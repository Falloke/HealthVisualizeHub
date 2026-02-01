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

/**
 * ✅ Resolve จังหวัดจาก query param:
 * - ถ้าเป็นตัวเลข -> ใช้เป็น province_no
 * - ถ้าเป็นชื่อ -> map จาก "ref".provinces_moph.province_name_th -> province_no
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

function parseIntOrNull(input: string | null) {
  const s = (input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function resolveDiseaseId(params: URLSearchParams) {
  const diseaseId = parseIntOrNull(params.get("disease_id"));
  if (diseaseId != null) return diseaseId;

  const code = (params.get("disease_code") || params.get("disease") || "").trim();
  if (!code) return null;

  const row = await db
    .selectFrom("diseases")
    .select(["disease_id"])
    .where("disease_code", "=", code)
    .executeTakeFirst();

  return row?.disease_id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const province = (params.get("province") || "").trim();

    if (!province) {
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

    const diseaseId = await resolveDiseaseId(params);

    // ช่วงวันที่
    let inRangeQ = db
      .selectFrom("mv_daily_province as m")
      .select([sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("total_patients")])
      .where("m.onset_date", ">=", startDate)
      .where("m.onset_date", "<=", endDate)
      // ⚠️ ถ้า MV ของคุณใช้ province_no ให้เปลี่ยน m.province_id -> m.province_no
      .where("m.province_id", "=", provinceId);

    if (diseaseId != null) inRangeQ = inRangeQ.where("m.disease_id", "=", diseaseId);

    const inRange = await inRangeQ.executeTakeFirst();
    const totalPatients = Number((inRange as any)?.total_patients ?? 0);

    const days = daysInclusive(startDate, endDate);
    const avgPatientsPerDay = Math.round(totalPatients / days);

    // สะสมทั้งหมด
    let cumQ = db
      .selectFrom("mv_daily_province as m")
      .select([sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("cumulative_patients")])
      // ⚠️ ถ้า MV ของคุณใช้ province_no ให้เปลี่ยน m.province_id -> m.province_no
      .where("m.province_id", "=", provinceId);

    if (diseaseId != null) cumQ = cumQ.where("m.disease_id", "=", diseaseId);

    const cum = await cumQ.executeTakeFirst();
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
