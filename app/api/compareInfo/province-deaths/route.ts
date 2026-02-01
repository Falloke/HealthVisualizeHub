import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";
import { resolveDiseaseId as resolveDiseaseIdLoose } from "@/lib/kysely3/resolveDiseaseId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProvinceDeaths = { province: string; deaths: number };
type APIResp = { ok: boolean; main?: ProvinceDeaths; compare?: ProvinceDeaths; error?: string };

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

async function resolveProvinceId(provinceParam: string): Promise<number | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) return Number(p);

  const row = await db
    .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
    .select(sql<number>`p.province_no`.as("province_id"))
    .where(sql`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (row as any)?.province_id ?? null;
}

async function queryProvinceDeaths(opts: {
  diseaseId: number | null;
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<ProvinceDeaths> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  const provinceId = await resolveProvinceId(opts.provinceNameTh);
  if (!provinceId) return { province: opts.provinceNameTh, deaths: 0 };

  let q = db
    .selectFrom(sql`"method_e"."mv_daily_province"`.as("m"))
    .select(sql<number>`COALESCE(SUM(m.daily_deaths),0)`.as("deaths"))
    .where(sql`m.province_id`, "=", provinceId)
    .where(sql`m.onset_date`, ">=", start)
    .where(sql`m.onset_date`, "<=", end);

  if (opts.diseaseId != null) q = q.where(sql`m.disease_id`, "=", opts.diseaseId);

  const row = await q.executeTakeFirst();

  return { province: opts.provinceNameTh, deaths: Number((row as any)?.deaths ?? 0) };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    // ✅ เดิมใช้ && ทำให้หลุดเคสส่งมาแค่ตัวเดียว
    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด" },
        { status: 400 }
      );
    }

    const diseaseId = await resolveDiseaseId(sp);

    const [main, compare] = await Promise.all([
      mainProvince
        ? queryProvinceDeaths({ diseaseId, start_date, end_date, provinceNameTh: mainProvince })
        : Promise.resolve(undefined),
      compareProvince
        ? queryProvinceDeaths({ diseaseId, start_date, end_date, provinceNameTh: compareProvince })
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json<APIResp>(
      { ok: true, ...(main ? { main } : {}), ...(compare ? { compare } : {}) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-deaths):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
