// app/api/dashBoard/gender-patients/route.ts
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

    let q = db
      .selectFrom("mv_daily_gender_province as m")
      .select([
        "m.gender as gender",
        sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"),
      ])
      .where("m.onset_date", ">=", startDate)
      .where("m.onset_date", "<=", endDate)
      // ⚠️ ถ้า MV ของคุณใช้ province_no ให้เปลี่ยน m.province_id -> m.province_no
      .where("m.province_id", "=", provinceId)
      .groupBy("m.gender");

    if (diseaseId != null) q = q.where("m.disease_id", "=", diseaseId);

    const rows = await q.execute();

    let male = 0;
    let female = 0;
    let unknown = 0;

    for (const r of rows as any[]) {
      const g = String(r.gender ?? "").trim();
      const c = Number(r.patients ?? 0);
      if (g === "M" || g === "ชาย") male += c;
      else if (g === "F" || g === "หญิง") female += c;
      else unknown += c;
    }

    // คืนรูปแบบเดิมที่ UI ใช้: [{ province, male, female, unknown }]
    return NextResponse.json([{ province, male, female, unknown }], { status: 200 });
  } catch (err) {
    console.error("❌ API ERROR (gender-patients):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
