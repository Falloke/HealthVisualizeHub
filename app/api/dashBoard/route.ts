// app/api/dashBoard/route.ts
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(s);
}

async function resolveFactTable(
  diseaseCode: string
): Promise<{ schema: string; table: string } | null> {
  if (!diseaseCode) return null;

  const row = await db
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active"])
    .where("disease_code", "=", diseaseCode)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  if (!schema || !table) return null;
  if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

  return { schema, table };
}

function zeroPayload(province: string | null, disease: string | null) {
  return {
    province: province || null,
    disease: disease || null,
    totalPatients: 0,
    avgPatientsPerDay: 0,
    cumulativePatients: 0,
    totalDeaths: 0,
    avgDeathsPerDay: 0,
    cumulativeDeaths: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const province = (params.get("province") || "").trim(); // optional
    const disease = pickDisease(params);

    // ✅ FIX: ถ้าไม่มี disease อย่า return 400
    // เพราะหน้า Home/Map/Narrative อาจยิง API ก่อน disease ใน store จะถูก set เสร็จ
    if (!disease) {
      return NextResponse.json(zeroPayload(province || null, null), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fact = await resolveFactTable(disease);
    if (!fact) {
      // ✅ หา table ไม่เจอ -> คืน 0 (กันกราฟพัง)
      return NextResponse.json(zeroPayload(province || null, disease), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const days = daysInclusiveYMD(startYMD, endYMD);

    // -------------------------
    // 🩺 ผู้ป่วยช่วงวันที่
    // -------------------------
    let patientQuery = db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("total_patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", disease);

    if (province) {
      patientQuery = patientQuery.where("ic.province", "=", province);
    }

    const patientStats = await patientQuery.executeTakeFirst();
    const totalPatients = Number((patientStats as any)?.total_patients ?? 0);
    const avgPatientsPerDay = Math.round(totalPatients / days);

    // -------------------------
    // 👥 ผู้ป่วยสะสมทั้งหมด (ไม่จำกัดช่วงเวลา)
    // -------------------------
    let cumPatientQuery = db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("cumulative_patients")])
      .where("ic.disease_code", "=", disease);

    if (province) {
      cumPatientQuery = cumPatientQuery.where("ic.province", "=", province);
    }

    const cumulativePatientsRow = await cumPatientQuery.executeTakeFirst();
    const cumulativePatients = Number(
      (cumulativePatientsRow as any)?.cumulative_patients ?? 0
    );

    // -------------------------
    // ☠️ ผู้เสียชีวิตช่วงวันที่
    // -------------------------
    let deathQuery = db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<number>`COUNT(*) FILTER (WHERE ic.death_date_parsed IS NOT NULL)::int`.as(
          "total_deaths"
        ),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", disease);

    if (province) {
      deathQuery = deathQuery.where("ic.province", "=", province);
    }

    const deathStats = await deathQuery.executeTakeFirst();
    const totalDeaths = Number((deathStats as any)?.total_deaths ?? 0);
    const avgDeathsPerDay = Math.round(totalDeaths / days);

    // -------------------------
    // ☠️ ผู้เสียชีวิตสะสม (ไม่จำกัดช่วงเวลา)
    // -------------------------
    let cumDeathQuery = db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<number>`COUNT(*) FILTER (WHERE ic.death_date_parsed IS NOT NULL)::int`.as(
          "cumulative_deaths"
        ),
      ])
      .where("ic.disease_code", "=", disease);

    if (province) {
      cumDeathQuery = cumDeathQuery.where("ic.province", "=", province);
    }

    const cumulativeDeathsRow = await cumDeathQuery.executeTakeFirst();
    const cumulativeDeaths = Number(
      (cumulativeDeathsRow as any)?.cumulative_deaths ?? 0
    );

    return NextResponse.json(
      {
        province: province || null,
        disease,

        totalPatients,
        avgPatientsPerDay,
        cumulativePatients,

        totalDeaths,
        avgDeathsPerDay,
        cumulativeDeaths,
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ API ERROR (/api/dashBoard summary):", error);
    return NextResponse.json(zeroPayload(null, null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
