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

async function resolveProvinceId(provinceParam: string) {
  const p = provinceParam.trim();

  if (/^\d+$/.test(p)) return Number(p);

  const found = await db
    .selectFrom("provinces")
    .select("province_id")
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return found?.province_id ?? null;
}

function daysInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const d = Math.floor(ms / 86400000) + 1;
  return Math.max(1, d);
}

/** ✅ mapping คอลัมน์วันเริ่มป่วยตาม schema (ไม่แตะ DB) */
const CASE_DATE_COL = process.env.DB_CASE_DATE_COL || "onset_date_parsed";
const CASE_DATE_CAST = (process.env.DB_CASE_DATE_CAST || "").trim();

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
      return NextResponse.json(
        { totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 },
        { status: 200 }
      );
    }

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json(
        { totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 },
        { status: 200 }
      );
    }

    const caseDate = dateExpr("ic", CASE_DATE_COL, CASE_DATE_CAST);

    // ผู้ป่วยในช่วงวันที่
    const inRange = await db
      .selectFrom("influenza_cases as ic")
      .select([sql<number>`COUNT(*)`.as("total_patients")])
      .where(caseDate, ">=", startDate)
      .where(caseDate, "<=", endDate)
      .where("ic.province_id", "=", provinceId)
      .executeTakeFirst();

    const totalPatients = Number((inRange as any)?.total_patients ?? 0);

    const days = daysInclusive(startDate, endDate);
    const avgPatientsPerDay = Math.round(totalPatients / days);

    // ผู้ป่วยสะสมทั้งหมด (ของจังหวัดนั้น)
    const cum = await db
      .selectFrom("influenza_cases as ic")
      .select([sql<number>`COUNT(*)`.as("cumulative_patients")])
      .where("ic.province_id", "=", provinceId)
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
