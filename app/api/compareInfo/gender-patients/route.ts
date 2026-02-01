import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";
import { resolveDiseaseId as resolveDiseaseIdLoose } from "@/lib/kysely3/resolveDiseaseId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type GenderCounts = { male: number; female: number; unknown: number };
type GenderSummary = { province: string } & GenderCounts;

type APIResp = {
  ok: boolean;
  main?: GenderSummary;
  compare?: GenderSummary;
  error?: string;
};

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

/** ✅ รับได้ทั้งเลขจังหวัด หรือชื่อจังหวัดไทย */
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

function normalizeGender(raw: unknown): "male" | "female" | "unknown" {
  const g = String(raw ?? "").trim().toLowerCase();
  if (g === "m" || g === "male" || g === "ชาย") return "male";
  if (g === "f" || g === "female" || g === "หญิง") return "female";
  return "unknown";
}

async function queryGenderPatients(opts: {
  diseaseId: number | null;
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<GenderCounts> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  const provinceId = await resolveProvinceId(opts.provinceNameTh);
  if (!provinceId) return { male: 0, female: 0, unknown: 0 };

  let q = db
    .selectFrom(sql`"method_e"."mv_daily_gender_province"`.as("m"))
    .select([
      sql<string>`m.gender`.as("gender"),
      sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"),
    ])
    .where(sql`m.province_id`, "=", provinceId)
    .where(sql`m.onset_date`, ">=", start)
    .where(sql`m.onset_date`, "<=", end)
    .groupBy(sql`m.gender`);

  if (opts.diseaseId != null) q = q.where(sql`m.disease_id`, "=", opts.diseaseId);

  const rows = await q.execute();

  let male = 0;
  let female = 0;
  let unknown = 0;

  for (const r of rows as any[]) {
    const bucket = normalizeGender(r.gender);
    const val = Number(r.patients ?? 0);
    if (bucket === "male") male += val;
    else if (bucket === "female") female += val;
    else unknown += val;
  }

  return { male, female, unknown };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince และ compareProvince ให้ครบ" },
        { status: 400 }
      );
    }

    const diseaseId = await resolveDiseaseId(sp);

    const [mainCounts, compareCounts] = await Promise.all([
      queryGenderPatients({ diseaseId, start_date, end_date, provinceNameTh: mainProvince }),
      queryGenderPatients({ diseaseId, start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    return NextResponse.json<APIResp>(
      {
        ok: true,
        main: { province: mainProvince, ...mainCounts },
        compare: { province: compareProvince, ...compareCounts },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-patients):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
