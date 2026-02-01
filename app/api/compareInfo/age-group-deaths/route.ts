import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";
import { resolveDiseaseId as resolveDiseaseIdLoose } from "@/lib/kysely3/resolveDiseaseId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AgeRow = { ageRange: string; deaths: number };
type RowMerged = { ageRange: string; mainDeaths: number; compareDeaths: number };

const AGE_ORDER = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-44", "45-59", "60+"] as const;
const AGE_SET = new Set<string>(AGE_ORDER as unknown as string[]);

function parseDateOrThrow(v: string, name: string): Date {
  const raw = (v ?? "").trim();
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function normalizeAgeRange(v: unknown): string {
  return String(v ?? "").trim();
}

function orderIndex(range: string): number {
  const i = (AGE_ORDER as unknown as string[]).indexOf(range);
  return i === -1 ? 999 : i;
}

function mergeAgeData(main: AgeRow[], compare: AgeRow[]): RowMerged[] {
  const mainMap = new Map<string, number>();
  const compareMap = new Map<string, number>();
  const extra = new Set<string>();

  for (const r of main ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.deaths ?? 0);
    mainMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  for (const r of compare ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.deaths ?? 0);
    compareMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  const base: RowMerged[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    mainDeaths: mainMap.get(k) ?? 0,
    compareDeaths: compareMap.get(k) ?? 0,
  }));

  const extras = Array.from(extra.values())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({
      ageRange: k,
      mainDeaths: mainMap.get(k) ?? 0,
      compareDeaths: compareMap.get(k) ?? 0,
    }));

  return base.concat(extras);
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

async function queryAgeDeaths(args: {
  diseaseId: number | null;
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<AgeRow[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  const provinceId = await resolveProvinceId(args.provinceNameTh);
  if (!provinceId) return (AGE_ORDER as unknown as string[]).map((k) => ({ ageRange: k, deaths: 0 }));

  let q = db
    .selectFrom(sql`"method_e"."mv_daily_age_province"`.as("m"))
    .select([
      sql<string>`m.age_group`.as("ageRange"),
      sql<number>`COALESCE(SUM(m.daily_deaths),0)`.as("deaths"),
    ])
    .where(sql`m.province_id`, "=", provinceId)
    .where(sql`m.onset_date`, ">=", start)
    .where(sql`m.onset_date`, "<=", end)
    .groupBy(sql`m.age_group`);

  if (args.diseaseId != null) q = q.where(sql`m.disease_id`, "=", args.diseaseId);

  const rows = await q.execute();

  const map = new Map<string, number>();
  for (const r of rows as any[]) {
    const k = String(r.ageRange ?? "").trim();
    if (!k) continue;
    map.set(k, Number(r.deaths ?? 0));
  }

  const ordered: AgeRow[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    deaths: map.get(k) ?? 0,
  }));

  const extras = Array.from(map.keys())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({ ageRange: k, deaths: map.get(k) ?? 0 }));

  return ordered.concat(extras);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "";
    const end_date = sp.get("end_date") ?? "";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    if (!start_date || !end_date || !mainProvince || !compareProvince) {
      return NextResponse.json({ error: "missing required query params" }, { status: 400 });
    }

    const diseaseId = await resolveDiseaseId(sp);

    const [mainRows, compareRows] = await Promise.all([
      queryAgeDeaths({ diseaseId, start_date, end_date, provinceNameTh: mainProvince }),
      queryAgeDeaths({ diseaseId, start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    const merged = mergeAgeData(mainRows, compareRows);

    return NextResponse.json(merged, {
      status: 200,
     headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group-deaths] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
