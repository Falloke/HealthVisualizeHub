import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";

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

function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

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

async function resolveFactTable(diseaseCode: string): Promise<{ schema: string; table: string } | null> {
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

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const provinceName = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    if (!provinceName) {
      return NextResponse.json(
        { totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 },
        { status: 200 }
      );
    }

    if (!diseaseCode) {
      return NextResponse.json(
        { totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 },
        { status: 200 }
      );
    }

    const fact = await resolveFactTable(diseaseCode);
    if (!fact) {
      return NextResponse.json(
        { totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 },
        { status: 200 }
      );
    }

    // ✅ ผู้ป่วยในช่วงวันที่
    const inRange = await db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("total_patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .where("ic.disease_code", "=", diseaseCode)
      .executeTakeFirst();

    const totalPatients = Number((inRange as any)?.total_patients ?? 0);

    const days = daysInclusiveYMD(startYMD, endYMD);
    const avgPatientsPerDay = Math.round(totalPatients / days);

    // ✅ ผู้ป่วยสะสมทั้งหมด (ไม่จำกัดช่วงเวลา)
    const cum = await db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("cumulative_patients")])
      .where("ic.province", "=", provinceName)
      .where("ic.disease_code", "=", diseaseCode)
      .executeTakeFirst();

    const cumulativePatients = Number((cum as any)?.cumulative_patients ?? 0);

    return NextResponse.json(
      { totalPatients, avgPatientsPerDay, cumulativePatients },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (patients-summary):", error);
    return NextResponse.json(
      { totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 },
      { status: 200 }
    );
  }
}
