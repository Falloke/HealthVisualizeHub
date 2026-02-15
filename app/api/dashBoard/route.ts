// app/api/dashBoard/route.ts
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ----------------------
// ✅ Helpers (YMD + UTC)
// ----------------------
function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

function ymdToUTCStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}
function ymdToUTCEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`);
}

// ✅ รับ disease หลาย key
function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

// ✅ days inclusive แบบ UTC
function daysInclusiveYMD(startYMD: string, endYMD: string) {
  const [sy, sm, sd] = startYMD.split("-").map(Number);
  const [ey, em, ed] = endYMD.split("-").map(Number);

  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);

  const ms = end - start;
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

    const todayYMD = new Date().toISOString().slice(0, 10);
    const startYMD = parseYMDOrFallback(
      params.get("start") || params.get("startYMD") || params.get("start_date") || null,
      todayYMD
    );
    const endYMD = parseYMDOrFallback(
      params.get("end") || params.get("endYMD") || params.get("end_date") || null,
      todayYMD
    );

    const province = (params.get("province") || "").trim(); // optional
    const provinceName = province ? await resolveProvinceNameOrNull(province) : null;

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    // small helpers used by this handler (kept local to avoid missing imports)
    function zeroPayload(provinceArg: string | null, diseaseArg: string | null) {
      return {
        province: provinceArg,
        disease: diseaseArg ?? null,
        totalPatients: 0,
        avgPatientsPerDay: 0,
        cumulativePatients: 0,
        totalDeaths: 0,
        avgDeathsPerDay: 0,
        cumulativeDeaths: 0,
      };
    }

    async function resolveFactTable(diseaseKey: string): Promise<string | null> {
      if (!diseaseKey) return null;
      const key = diseaseKey.trim().toLowerCase();
      // simple mapping; extend as needed
      if (key === "influenza" || key === "flu") return "d01_influenza";
      return null;
    }

    function daysInclusive(start: Date, end: Date) {
      const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      return Math.max(1, Math.floor((e - s) / 86400000) + 1);
    }

    const disease = pickDisease(params);

    // ✅ ถ้าไม่มี disease -> คืน 0 (กันยิงก่อน store set)
    if (!disease) {
      return NextResponse.json(zeroPayload(province || null, null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fact = await resolveFactTable(disease);
    if (!fact) {
      return NextResponse.json(zeroPayload(province || null, disease), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const days = daysInclusiveYMD(startYMD, endYMD);

    // -------------------------
    // 🩺 ผู้ป่วยช่วงวันที่
    let patientQuery = (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(*)`.as("total_patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate);

    if (provinceName) patientQuery = patientQuery.where("ic.province", "=", provinceName);
    const patientStats = await patientQuery.executeTakeFirst();
    const totalPatients = Number((patientStats as any)?.total_patients ?? 0);
    const avgPatientsPerDay = Math.round(totalPatients / days);

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
      province: province || null,

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
