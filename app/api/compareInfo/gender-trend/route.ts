import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";
import { resolveDiseaseId as resolveDiseaseIdLoose } from "@/lib/kysely3/resolveDiseaseId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TrendData = { month: string; male: number; female: number };

type CombinedRow = {
  month: string;
  month_th: string;
  male_main?: number;
  female_main?: number;
  male_compare?: number;
  female_compare?: number;
};

type APIResp = { ok: boolean; rows?: CombinedRow[]; error?: string };

function parseDateOrThrow(v: string, name: string): Date {
  const raw = (v ?? "").trim();
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function toThaiMonthLabel(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = new Date(y, mo, 1);
  return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
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

async function queryGenderTrend(args: {
  diseaseId: number | null;
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<TrendData[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  const provinceId = await resolveProvinceId(args.provinceNameTh);
  if (!provinceId) return [];

  const monthKey = sql<string>`TO_CHAR(date_trunc('month', m.onset_date), 'YYYY-MM')`.as("month");
  const g = sql`LOWER(TRIM(COALESCE(m.gender, '')))`;

  let q = db
    .selectFrom(sql`"method_e"."mv_daily_gender_province"`.as("m"))
    .select(() => [
      monthKey,
      sql<number>`
        COALESCE(SUM(m.daily_patients) FILTER (WHERE ${g} IN ('m','male','ชาย')),0)
      `.as("male"),
      sql<number>`
        COALESCE(SUM(m.daily_patients) FILTER (WHERE ${g} IN ('f','female','หญิง')),0)
      `.as("female"),
    ])
    .where(sql`m.province_id`, "=", provinceId)
    .where(sql`m.onset_date`, ">=", start)
    .where(sql`m.onset_date`, "<=", end)
    .groupBy(sql`month`)
    .orderBy(sql`month`, "asc");

  if (args.diseaseId != null) q = q.where(sql`m.disease_id`, "=", args.diseaseId);

  const rows = await q.execute();

  return (rows as any[]).map((r) => ({
    month: String(r.month),
    male: Number(r.male ?? 0),
    female: Number(r.female ?? 0),
  }));
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

    const [mainTrend, compareTrend] = await Promise.all([
      queryGenderTrend({ diseaseId, start_date, end_date, provinceNameTh: mainProvince }),
      queryGenderTrend({ diseaseId, start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    const mainMap = new Map<string, TrendData>();
    for (const r of mainTrend) mainMap.set(r.month, r);

    const compareMap = new Map<string, TrendData>();
    for (const r of compareTrend) compareMap.set(r.month, r);

    const monthSet = new Set<string>();
    for (const k of mainMap.keys()) monthSet.add(k);
    for (const k of compareMap.keys()) monthSet.add(k);

    const months = Array.from(monthSet.values()).sort();

    const rows: CombinedRow[] = months.map((m) => {
      const a = mainMap.get(m);
      const b = compareMap.get(m);
      return {
        month: m,
        month_th: toThaiMonthLabel(m),
        male_main: Number(a?.male ?? 0),
        female_main: Number(a?.female ?? 0),
        male_compare: Number(b?.male ?? 0),
        female_compare: Number(b?.female ?? 0),
      };
    });

    return NextResponse.json<APIResp>({ ok: true, rows }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-trend):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
