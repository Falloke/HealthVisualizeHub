// app/api/dashBoard/gender-trend/route.ts
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

function monthKeyFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const province = params.get("province");

    if (!province || !province.trim()) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const diseaseId = await resolveDiseaseId(params);

    // ใช้ MV รายเดือนแยกเพศ
    let q = db
      .selectFrom("mv_monthly_gender_patients as m")
      .select([
        sql<string>`TO_CHAR(m.month_start, 'YYYY-MM')`.as("month"),
        "m.gender as gender",
        sql<number>`COALESCE(SUM(m.monthly_patients),0)`.as("count"),
      ])
      // ⚠️ ถ้า MV ของคุณใช้ province_no ให้เปลี่ยน m.province_id -> m.province_no
      .where("m.province_id", "=", provinceId)
      .where("m.month_start", ">=", startDate)
      .where("m.month_start", "<=", endDate)
      .groupBy(sql`TO_CHAR(m.month_start, 'YYYY-MM')`)
      .groupBy("m.gender")
      .orderBy(sql`TO_CHAR(m.month_start, 'YYYY-MM')`);

    if (diseaseId != null) q = q.where("m.disease_id", "=", diseaseId);

    const rows = await q.execute();

    // แปลงเป็น { month, male, female } เหมือนเดิม
    const monthlyData: Record<string, { male: number; female: number }> = {};

    for (const r of rows as any[]) {
      const month = String(r.month ?? "");
      if (!month) continue;

      if (!monthlyData[month]) monthlyData[month] = { male: 0, female: 0 };

      const g = String(r.gender ?? "").trim();
      const c = Number(r.count ?? 0);

      if (g === "M" || g === "ชาย") monthlyData[month].male += c;
      else if (g === "F" || g === "หญิง") monthlyData[month].female += c;
    }

    // ทำให้ช่วงเดือนต่อเนื่อง (ถ้าบางเดือนเป็น 0 จะยังแสดง)
    const startKey = monthKeyFromDate(startDate);
    const endKey = monthKeyFromDate(endDate);

    const out: Array<{ month: string; male: number; female: number }> = [];

    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cur <= end) {
      const k = monthKeyFromDate(cur);
      if (k >= startKey && k <= endKey) {
        const v = monthlyData[k] ?? { male: 0, female: 0 };
        out.push({ month: k, male: v.male, female: v.female });
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    console.error("❌ API ERROR (gender-trend):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
