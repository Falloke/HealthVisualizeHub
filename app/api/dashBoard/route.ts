import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
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

async function resolveProvinceNameOrNull(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const found = await (db as any)
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  const found = await (db as any)
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
    const provinceParam = (params.get("province") || "").trim();

    const provinceName = provinceParam ? await resolveProvinceNameOrNull(provinceParam) : null;

    // 🩺 ผู้ป่วยช่วงวันที่
    let patientQuery = (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(*)`.as("total_patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate);

    if (provinceName) patientQuery = patientQuery.where("ic.province", "=", provinceName);
    const patientStats = await patientQuery.executeTakeFirst();

    const totalPatients = Number((patientStats as any)?.total_patients ?? 0);
    const avgPatientsPerDay = Math.round(totalPatients / daysInclusive(startDate, endDate));

    // 👥 ผู้ป่วยสะสมทั้งหมด
    let cumPatientQuery = (db as any).selectFrom("d01_influenza as ic").select([sql<number>`COUNT(*)`.as("cumulative_patients")]);
    if (provinceName) cumPatientQuery = cumPatientQuery.where("ic.province", "=", provinceName);
    const cumulativePatientsRow = await cumPatientQuery.executeTakeFirst();

    // ☠️ ผู้เสียชีวิตช่วงวันที่
    let deathQuery = (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(ic.death_date_parsed)`.as("total_deaths")])
      .where("ic.death_date_parsed", "is not", null)
      .where("ic.death_date_parsed", ">=", startDate)
      .where("ic.death_date_parsed", "<=", endDate);

    if (provinceName) deathQuery = deathQuery.where("ic.province", "=", provinceName);
    const deathStats = await deathQuery.executeTakeFirst();

    const totalDeaths = Number((deathStats as any)?.total_deaths ?? 0);
    const avgDeathsPerDay = Math.round(totalDeaths / daysInclusive(startDate, endDate));

    // ☠️ ผู้เสียชีวิตสะสม
    let cumDeathQuery = (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(ic.death_date_parsed)`.as("cumulative_deaths")])
      .where("ic.death_date_parsed", "is not", null);

    if (provinceName) cumDeathQuery = cumDeathQuery.where("ic.province", "=", provinceName);
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
