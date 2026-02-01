import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

/**
 * ✅ Resolve จังหวัดจาก "ref".provinces_moph
 * - ถ้าเป็นตัวเลข -> province_no
 * - ถ้าเป็นชื่อ -> province_name_th
 */
async function resolveProvince(provinceParam: string) {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_id"),
        sql<string>`p.province_name_th`.as("province_name_th"),
        sql<number>`p.region_id`.as("region_id"),
      ])
      .where(sql`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return row as any;
  }

  const row = await db
    .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
    .select([
      sql<number>`p.province_no`.as("province_id"),
      sql<string>`p.province_name_th`.as("province_name_th"),
      sql<number>`p.region_id`.as("region_id"),
    ])
    .where(sql`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return row as any;
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
    const p = request.nextUrl.searchParams;

    const startDate = parseDateOrFallback(p.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(p.get("end_date"), "2024-12-31");
    const provinceParam = p.get("province")?.trim();

    if (!provinceParam) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const prov = await resolveProvince(provinceParam);
    if (!prov) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${provinceParam}` }, { status: 404 });
    }

    const diseaseId = await resolveDiseaseId(p);

    let q = db
      .selectFrom("mv_daily_province as m")
      .select([
        sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"),
        sql<number>`COALESCE(SUM(m.daily_deaths),0)`.as("deaths"),
      ])
      .where("m.onset_date", ">=", startDate)
      .where("m.onset_date", "<=", endDate)
      // ⚠️ ถ้า MV ของคุณใช้ province_no อยู่แล้ว OK
      // ถ้ายังเป็น province_id เดิม ให้ปรับ MV ให้ตรงก่อน
      .where("m.province_id", "=", Number(prov.province_id));

    if (diseaseId != null) q = q.where("m.disease_id", "=", diseaseId);

    const row = await q.executeTakeFirst();

    return NextResponse.json(
      {
        province: String(prov.province_name_th),
        regionId: prov.region_id ?? null,
        region: prov.region_id != null ? String(prov.region_id) : "",
        patients: Number((row as any)?.patients ?? 0),
        deaths: Number((row as any)?.deaths ?? 0),
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (province-summary):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
