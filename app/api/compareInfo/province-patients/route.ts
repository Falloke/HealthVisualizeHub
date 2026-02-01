import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";
import { resolveDiseaseId as resolveDiseaseIdLoose } from "@/lib/kysely3/resolveDiseaseId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProvinceSummary = { province: string; region?: string | null; patients: number };
type APIResp = { ok: boolean; main?: ProvinceSummary; compare?: ProvinceSummary; error?: string };

function parseDateOrThrow(v: string, name: string): Date {
  const raw = (v ?? "").trim();
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function parseIntOrNull(input: string | null) {
  const s = (input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickDiseaseCode(sp: URLSearchParams) {
  return (sp.get("disease") || sp.get("disease_code") || sp.get("code") || "").trim();
}

async function resolveDiseaseId(sp: URLSearchParams): Promise<number | null> {
  const diseaseId = parseIntOrNull(sp.get("disease_id"));
  if (diseaseId != null) return diseaseId;

  const code = pickDiseaseCode(sp);
  if (!code) return null;

  return await resolveDiseaseIdLoose(code);
}

async function resolveProvince(provinceParam: string): Promise<{
  province_id: number;
  province_name_th: string;
  region_id: number | null;
} | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  // ถ้าเป็นเลข
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

async function queryProvincePatients(opts: {
  diseaseId: number | null;
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<ProvinceSummary> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  const prov = await resolveProvince(opts.provinceNameTh);
  if (!prov) return { province: opts.provinceNameTh, region: null, patients: 0 };

  let q = db
    .selectFrom(sql`"method_e"."mv_daily_province"`.as("m"))
    .select(sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"))
    .where(sql`m.province_id`, "=", prov.province_id)
    .where(sql`m.onset_date`, ">=", start)
    .where(sql`m.onset_date`, "<=", end);

  if (opts.diseaseId != null) q = q.where(sql`m.disease_id`, "=", opts.diseaseId);

  const row = await q.executeTakeFirst();

  return {
    province: prov.province_name_th,
    region: prov.region_id != null ? String(prov.region_id) : null,
    patients: Number((row as any)?.patients ?? 0),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด" },
        { status: 400 }
      );
    }

    const diseaseId = await resolveDiseaseId(sp);

    const [main, compare] = await Promise.all([
      mainProvince
        ? queryProvincePatients({ diseaseId, start_date, end_date, provinceNameTh: mainProvince })
        : Promise.resolve(undefined),
      compareProvince
        ? queryProvincePatients({ diseaseId, start_date, end_date, provinceNameTh: compareProvince })
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json<APIResp>(
      { ok: true, ...(main ? { main } : {}), ...(compare ? { compare } : {}) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-patients):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
