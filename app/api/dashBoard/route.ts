// app/api/dashBoard/route.ts
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

function parseIntOrNull(input: string | null) {
  const s = (input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function daysInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const d = Math.floor(ms / 86400000) + 1;
  return Math.max(1, d);
}

/**
 * ✅ Resolve จังหวัดจาก ref.provinces_moph
 * - ถ้าเป็นตัวเลข -> province_no
 * - ถ้าเป็นชื่อ -> province_name_th
 */
async function resolveProvinceId(provinceParam: string) {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) return Number(p);

  const found = await db
    .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
    .select(sql<number>`p.province_no`.as("province_id"))
    .where(sql`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (found as any)?.province_id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");

    const provinceParam = (params.get("province") || "").trim();
    const provinceId = provinceParam ? await resolveProvinceId(provinceParam) : null;

    // optional disease filter
    const diseaseId = parseIntOrNull(params.get("disease_id"));

    // ✅ ช่วงวันที่
    let rangeQ = db
      .selectFrom("mv_daily_province as m")
      .select([
        sql<number>`COALESCE(SUM(m.daily_patients), 0)`.as("total_patients"),
        sql<number>`COALESCE(SUM(m.daily_deaths), 0)`.as("total_deaths"),
      ])
      .where("m.onset_date", ">=", startDate)
      .where("m.onset_date", "<=", endDate);

    // ⚠️ ถ้า MV ใช้ province_no อยู่แล้ว OK
    if (provinceId) rangeQ = rangeQ.where("m.province_id", "=", provinceId);
    if (diseaseId != null) rangeQ = rangeQ.where("m.disease_id", "=", diseaseId);

    const rangeRow = await rangeQ.executeTakeFirst();
    const totalPatients = Number((rangeRow as any)?.total_patients ?? 0);
    const totalDeaths = Number((rangeRow as any)?.total_deaths ?? 0);

    const days = daysInclusive(startDate, endDate);
    const avgPatientsPerDay = Math.round(totalPatients / days);
    const avgDeathsPerDay = Math.round(totalDeaths / days);

    // ✅ สะสมทั้งหมด
    let cumQ = db
      .selectFrom("mv_daily_province as m")
      .select([
        sql<number>`COALESCE(SUM(m.daily_patients), 0)`.as("cumulative_patients"),
        sql<number>`COALESCE(SUM(m.daily_deaths), 0)`.as("cumulative_deaths"),
      ]);

    if (provinceId) cumQ = cumQ.where("m.province_id", "=", provinceId);
    if (diseaseId != null) cumQ = cumQ.where("m.disease_id", "=", diseaseId);

    const cumRow = await cumQ.executeTakeFirst();

    const data = {
      province: provinceParam || null,

      totalPatients,
      avgPatientsPerDay,
      cumulativePatients: Number((cumRow as any)?.cumulative_patients ?? 0),

      totalDeaths,
      avgDeathsPerDay,
      cumulativeDeaths: Number((cumRow as any)?.cumulative_deaths ?? 0),
    };

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("❌ API ERROR (/api/dashBoard):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
