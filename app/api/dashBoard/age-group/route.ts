import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
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
  { label: "60+", min: 60, max: 200 },
];

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

/**
 * ✅ ใช้ ref.provinces_moph แทน provinces
 * - รับ province ได้ทั้งเลข (province_no) หรือชื่อไทย (province_name_th)
 */
async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  // ส่งเป็นเลข -> province_no
  if (/^\d+$/.test(p)) {
    const found = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  // ส่งเป็นชื่อไทย -> เช็คชื่อมาตรฐานจาก ref.provinces_moph
  const found = await db
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select(sql<string>`p.province_name_th`.as("province_name_th"))
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (found?.province_name_th ?? "").trim() || null;
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

    const provinceName = await resolveProvinceName(province);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    // 📍 method_f/g: นับผู้ป่วยแยกตามอายุจาก d01_influenza (denormalized)
    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(*)`.as("patients"), "ic.age_y as age_y"])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .where("ic.age_y", "is not", null)
      .groupBy("ic.age_y")
      .execute();

    // 📊 Map age → group
    const grouped: Record<string, number> = {};
    for (const g of ageGroups) grouped[g.label] = 0;

    for (const row of rows) {
      const age = Number((row as any).age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number((row as any).patients ?? 0);
    }

    const result = Object.entries(grouped).map(([ageRange, patients]) => ({
      ageRange,
      patients,
    }));

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (age-group):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
