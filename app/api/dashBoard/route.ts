import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

export const runtime = "nodejs";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

function daysInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const d = Math.floor(ms / 86400000) + 1;
  return Math.max(1, d);
}

async function resolveProvinceId(provinceParam: string) {
  const p = provinceParam.trim();

  if (!p) return null;

  if (/^\d+$/.test(p)) return Number(p);

  const found = await db
    .selectFrom("provinces")
    .select("province_id")
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return found?.province_id ?? null;
}

/** ✅ mapping คอลัมน์วัน/วันตายตาม schema (ไม่แตะ DB) */
const CASE_DATE_COL = process.env.DB_CASE_DATE_COL || "onset_date_parsed";
const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const CASE_DATE_CAST = (process.env.DB_CASE_DATE_CAST || "").trim(); // เช่น "date" หรือ "timestamptz"
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim();

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
    const provinceParam = (params.get("province") || "").trim();

    const provinceId = provinceParam ? await resolveProvinceId(provinceParam) : null;

    const caseDate = dateExpr("ic", CASE_DATE_COL, CASE_DATE_CAST);
    const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

    // 🩺 ผู้ป่วยช่วงวันที่
    let patientQuery = db
      .selectFrom("influenza_cases as ic")
      .select([sql<number>`COUNT(*)`.as("total_patients")])
      .where(caseDate, ">=", startDate)
      .where(caseDate, "<=", endDate);

    if (provinceId) patientQuery = patientQuery.where("ic.province_id", "=", provinceId);
    const patientStats = await patientQuery.executeTakeFirst();

    const totalPatients = Number((patientStats as any)?.total_patients ?? 0);
    const avgPatientsPerDay = Math.round(
      totalPatients / daysInclusive(startDate, endDate)
    );

    // 👥 ผู้ป่วยสะสมทั้งหมด (ไม่จำกัดช่วงเวลา)
    let cumPatientQuery = db
      .selectFrom("influenza_cases as ic")
      .select([sql<number>`COUNT(*)`.as("cumulative_patients")]);

    if (provinceId) cumPatientQuery = cumPatientQuery.where("ic.province_id", "=", provinceId);
    const cumulativePatientsRow = await cumPatientQuery.executeTakeFirst();

    // ☠️ ผู้เสียชีวิตช่วงวันที่
    // นับเป็น COUNT(*) ที่มี deathDate ไม่เป็น null (กันปัญหาชื่อคอลัมน์)
    let deathQuery = db
      .selectFrom("influenza_cases as ic")
      .select([
        sql<number>`COUNT(*) FILTER (WHERE ${deathDate} IS NOT NULL)`.as("total_deaths"),
      ])
      .where(sql<boolean>`${deathDate} IS NOT NULL`)
      .where(deathDate, ">=", startDate)
      .where(deathDate, "<=", endDate);

    if (provinceId) deathQuery = deathQuery.where("ic.province_id", "=", provinceId);
    const deathStats = await deathQuery.executeTakeFirst();

    const totalDeaths = Number((deathStats as any)?.total_deaths ?? 0);
    const avgDeathsPerDay = Math.round(
      totalDeaths / daysInclusive(startDate, endDate)
    );

    // ☠️ ผู้เสียชีวิตสะสม (ไม่จำกัดช่วงเวลา)
    let cumDeathQuery = db
      .selectFrom("influenza_cases as ic")
      .select([
        sql<number>`COUNT(*) FILTER (WHERE ${deathDate} IS NOT NULL)`.as("cumulative_deaths"),
      ])
      .where(sql<boolean>`${deathDate} IS NOT NULL`);

    if (provinceId) cumDeathQuery = cumDeathQuery.where("ic.province_id", "=", provinceId);
    const cumulativeDeathsRow = await cumDeathQuery.executeTakeFirst();

    const data = {
      province: provinceParam || null,

      totalPatients,
      avgPatientsPerDay,
      cumulativePatients: Number((cumulativePatientsRow as any)?.cumulative_patients ?? 0),

      totalDeaths,
      avgDeathsPerDay,
      cumulativeDeaths: Number((cumulativeDeathsRow as any)?.cumulative_deaths ?? 0),
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("❌ API ERROR (/api/dashBoard):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
