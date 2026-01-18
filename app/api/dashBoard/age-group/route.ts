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
  { label: "60+", min: 60, max: 200 },
];

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

async function resolveProvinceId(provinceParam: string) {
  const p = provinceParam.trim();

  // ถ้าส่งเป็นเลข -> ถือว่าเป็น province_id
  if (/^\d+$/.test(p)) return Number(p);

  // ถ้าส่งเป็นชื่อจังหวัดไทย -> map ไปเป็น province_id
  const found = await db
    .selectFrom("provinces")
    .select("province_id")
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return found?.province_id ?? null;
}

/** ✅ mapping คอลัมน์วันที่ตาม schema (ไม่แตะ DB) */
const CASE_DATE_COL = process.env.DB_CASE_DATE_COL || "onset_date_parsed";
const CASE_DATE_CAST = (process.env.DB_CASE_DATE_CAST || "").trim(); // เช่น "date" หรือ "timestamptz"

function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
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
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const caseDate = dateExpr("ic", CASE_DATE_COL, CASE_DATE_CAST);

    // 📍 ดึงจำนวนผู้ป่วยแยกตามอายุ (age_y) ของจังหวัดนั้น จากตาราง influenza_cases
    const rows = await db
      .selectFrom("influenza_cases as ic")
      .select([sql<number>`COUNT(*)`.as("patients"), "ic.age_y as age_y"])
      .where(caseDate, ">=", startDate)
      .where(caseDate, "<=", endDate)
      .where("ic.province_id", "=", provinceId)
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
      if (group) grouped[group.label] += Number((row as any).patients);
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
