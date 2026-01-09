import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

export const runtime = "nodejs";

// กลุ่มอายุ
const ageGroups = [
  { label: "0-4", min: 0, max: 4 },
  { label: "5-9", min: 5, max: 9 },
  { label: "10-14", min: 10, max: 14 },
  { label: "15-19", min: 15, max: 19 },
  { label: "20-24", min: 20, max: 24 },
  { label: "25-44", min: 25, max: 44 },
  { label: "45-59", min: 45, max: 59 },
  { label: "60+", min: 60, max: 200 }, // เผื่อกรณีอายุมาก
];

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

async function resolveProvinceId(provinceParam: string) {
  const p = provinceParam.trim();

  // ส่งเป็นเลข -> province_id
  if (/^\d+$/.test(p)) return Number(p);

  // ส่งเป็นชื่อจังหวัดไทย -> map เป็น province_id
  const found = await db
    .selectFrom("provinces")
    .select("province_id")
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return found?.province_id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const province = params.get("province");

    if (!province || !province.trim()) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json(
        { error: `ไม่พบจังหวัด: ${province}` },
        { status: 404 }
      );
    }

    // 📍 ดึงข้อมูลผู้เสียชีวิตของจังหวัดนั้น (นับจาก death_date_parsed)
    const rows = await db
      .selectFrom("influenza_cases")
      .select([sql<number>`COUNT(death_date_parsed)`.as("deaths"), "age_y"])
      .where("province_id", "=", provinceId)
      .where("death_date_parsed", "is not", null)
      .where("death_date_parsed", ">=", startDate)
      .where("death_date_parsed", "<=", endDate)
      .where("age_y", "is not", null)
      .groupBy("age_y")
      .execute();

    // 📊 Map age → group
    const grouped: Record<string, number> = {};
    for (const g of ageGroups) grouped[g.label] = 0;

    for (const row of rows) {
      const age = Number(row.age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number(row.deaths);
    }

    const result = Object.entries(grouped).map(([ageRange, deaths]) => ({
      ageRange,
      deaths,
    }));

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (age-group-deaths):", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
