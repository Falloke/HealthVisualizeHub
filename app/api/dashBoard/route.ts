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

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const provinceParam = (params.get("province") || "").trim();

    const provinceId = provinceParam ? await resolveProvinceId(provinceParam) : null;

    // 🩺 ผู้ป่วยช่วงวันที่
    let patientQuery = db
      .selectFrom("influenza_cases")
      .select([
        sql<number>`COUNT(*)`.as("total_patients"),
      ])
      .where("onset_date_parsed", ">=", startDate)
      .where("onset_date_parsed", "<=", endDate);

    if (provinceId) patientQuery = patientQuery.where("province_id", "=", provinceId);
    const patientStats = await patientQuery.executeTakeFirst();

    const totalPatients = Number(patientStats?.total_patients ?? 0);
    const avgPatientsPerDay = Math.round(totalPatients / daysInclusive(startDate, endDate));

    // 👥 ผู้ป่วยสะสมทั้งหมด (ไม่จำกัดช่วงเวลา)
    let cumPatientQuery = db
      .selectFrom("influenza_cases")
      .select([sql<number>`COUNT(*)`.as("cumulative_patients")]);

    if (provinceId) cumPatientQuery = cumPatientQuery.where("province_id", "=", provinceId);
    const cumulativePatientsRow = await cumPatientQuery.executeTakeFirst();

    // ☠️ ผู้เสียชีวิตช่วงวันที่
    let deathQuery = db
      .selectFrom("influenza_cases")
      .select([sql<number>`COUNT(death_date_parsed)`.as("total_deaths")])
      .where("death_date_parsed", "is not", null)
      .where("death_date_parsed", ">=", startDate)
      .where("death_date_parsed", "<=", endDate);

    if (provinceId) deathQuery = deathQuery.where("province_id", "=", provinceId);
    const deathStats = await deathQuery.executeTakeFirst();

    const totalDeaths = Number(deathStats?.total_deaths ?? 0);
    const avgDeathsPerDay = Math.round(totalDeaths / daysInclusive(startDate, endDate));

    // ☠️ ผู้เสียชีวิตสะสม (ไม่จำกัดช่วงเวลา)
    let cumDeathQuery = db
      .selectFrom("influenza_cases")
      .select([sql<number>`COUNT(death_date_parsed)`.as("cumulative_deaths")])
      .where("death_date_parsed", "is not", null);

    if (provinceId) cumDeathQuery = cumDeathQuery.where("province_id", "=", provinceId);
    const cumulativeDeathsRow = await cumDeathQuery.executeTakeFirst();

    const data = {
      province: provinceParam || null,

      totalPatients,
      avgPatientsPerDay,
      cumulativePatients: Number(cumulativePatientsRow?.cumulative_patients ?? 0),

      totalDeaths,
      avgDeathsPerDay,
      cumulativeDeaths: Number(cumulativeDeathsRow?.cumulative_deaths ?? 0),
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("❌ API ERROR (/api/dashBoard):", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
