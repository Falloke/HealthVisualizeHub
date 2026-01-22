import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";
import { resolveDiseaseAndTable } from "@/lib/dashboard/resolveDiseaseAndTable";

export const runtime = "nodejs";

// ✅ CONFIG via ENV
const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim(); // เช่น "date"

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
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

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startDate = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const provinceName = (params.get("province") || "").trim();
    const diseaseRaw = pickDisease(params);

    // ✅ เหมือนของเดิม: ถ้าไม่ส่ง province มา ให้ 0 ทั้งหมด
    if (!provinceName) {
      return NextResponse.json(
        { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
        { status: 200 }
      );
    }

    // ✅ ถ้าไม่ส่งโรคมา ก็ให้ 0 เหมือนกัน
    if (!diseaseRaw) {
      return NextResponse.json(
        { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
        { status: 200 }
      );
    }

    // ✅ resolve ตารางจากโรค
    const { factTable, diseaseCode } = await resolveDiseaseAndTable(diseaseRaw);

    const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

    // ✅ ผู้เสียชีวิตในช่วงวันที่
    const inRange = await sql<any>`
      SELECT COUNT(*)::int AS total_deaths
      FROM ${sql.raw(factTable)} ic
      WHERE ic.province = ${provinceName}
        AND ic.disease_code = ${diseaseCode}
        AND ${deathDate} IS NOT NULL
        AND ${deathDate} >= ${startDate}
        AND ${deathDate} <= ${endDate}
    `.execute(db);

    const totalDeaths = Number(inRange.rows?.[0]?.total_deaths ?? 0);

    const days = daysInclusiveYMD(startDate, endDate);
    const avgDeathsPerDay = Math.round(totalDeaths / days);

    // ✅ ผู้เสียชีวิตสะสมทั้งหมด (ของจังหวัดนั้น)
    const cum = await sql<any>`
      SELECT COUNT(*)::int AS cumulative_deaths
      FROM ${sql.raw(factTable)} ic
      WHERE ic.province = ${provinceName}
        AND ic.disease_code = ${diseaseCode}
        AND ${deathDate} IS NOT NULL
    `.execute(db);

    const cumulativeDeaths = Number(cum.rows?.[0]?.cumulative_deaths ?? 0);

    return NextResponse.json(
      { totalDeaths, avgDeathsPerDay, cumulativeDeaths },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (deaths-summary):", error);
    return NextResponse.json(
      { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
      { status: 200 }
    );
  }
}
