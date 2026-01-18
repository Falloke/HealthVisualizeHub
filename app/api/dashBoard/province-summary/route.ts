import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

async function resolveProvince(provinceParam: string) {
  const p = provinceParam.trim();

  // ส่งเป็นเลข -> province_id
  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom("provinces")
      .select(["province_id", "province_name_th", "region_id"])
      .where("province_id", "=", Number(p))
      .executeTakeFirst();
    return row ?? null;
  }

  // ส่งเป็นชื่อไทย -> map เป็น province_id
  const row = await db
    .selectFrom("provinces")
    .select(["province_id", "province_name_th", "region_id"])
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return row ?? null;
}

/** ✅ mapping คอลัมน์วัน/วันตายตาม schema (ไม่แตะ DB) */
const CASE_DATE_COL = process.env.DB_CASE_DATE_COL || "onset_date_parsed";
const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const CASE_DATE_CAST = (process.env.DB_CASE_DATE_CAST || "").trim();
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim();

function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
}

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(p.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(p.get("end_date"), "2024-12-31");
    const province = p.get("province")?.trim();

    if (!province) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const prov = await resolveProvince(province);
    if (!prov) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const caseDate = dateExpr("ic", CASE_DATE_COL, CASE_DATE_CAST);
    const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

    // 🧮 ผู้ป่วยในช่วงวันที่
    const patientsRow = await db
      .selectFrom("influenza_cases as ic")
      .select([sql<number>`COUNT(*)`.as("patients")])
      .where(caseDate, ">=", startDate)
      .where(caseDate, "<=", endDate)
      .where("ic.province_id", "=", (prov as any).province_id)
      .executeTakeFirst();

    // ☠️ ผู้เสียชีวิตในช่วงวันที่ (นับเฉพาะแถวที่มี deathDate ไม่เป็น null)
    const deathsRow = await db
      .selectFrom("influenza_cases as ic")
      .select([
        sql<number>`COUNT(*) FILTER (WHERE ${deathDate} IS NOT NULL)`.as("deaths"),
      ])
      .where(sql<boolean>`${deathDate} IS NOT NULL`)
      .where(deathDate, ">=", startDate)
      .where(deathDate, "<=", endDate)
      .where("ic.province_id", "=", (prov as any).province_id)
      .executeTakeFirst();

    return NextResponse.json(
      {
        province: (prov as any).province_name_th, // คืนชื่อจังหวัดมาตรฐาน
        regionId: (prov as any).region_id ?? null,
        patients: Number((patientsRow as any)?.patients ?? 0),
        deaths: Number((deathsRow as any)?.deaths ?? 0),
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (province-summary):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
