// D:\HealtRiskHub\app\api\compareInfo\gender-deaths\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

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

// ref.provinces_moph
const REF_SCHEMA = (process.env.DB_REF_SCHEMA || "ref").trim();
const REF_PROVINCES_TABLE = (process.env.DB_REF_PROVINCES_TABLE || "provinces_moph").trim();
const REF_PROVINCE_ID_COL = (process.env.DB_REF_PROVINCE_ID_COL || "province_no").trim();
const REF_PROVINCE_NAME_COL = (process.env.DB_REF_PROVINCE_NAME_COL || "province_name_th").trim();

// d01_influenza
const D01_TABLE = (process.env.DB_D01_TABLE || "d01_influenza").trim();
const D01_PROVINCE_COL = (process.env.DB_D01_PROVINCE_COL || "province").trim();
const D01_DEATH_COL = (process.env.DB_D01_DEATH_COL || "death_date_parsed").trim();
const D01_GENDER_COL = (process.env.DB_D01_GENDER_COL || "gender").trim();

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date((v ?? "").trim());
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function assertIdent(name: string, label: string) {
  const v = (name ?? "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) throw new Error(`Invalid ${label}: ${name}`);
  return v;
}
function refCol(alias: string, col: string) {
  return sql.ref(`${assertIdent(alias, "alias")}.${assertIdent(col, "column")}`);
}

/**
 * Small helpers for YMD parsing and UTC range conversion.
 * - parseYMDOrFallback: accept a YYYY-MM-DD or any parseable date, return YYYY-MM-DD or fallback
 * - ymdToUTCStart / ymdToUTCEnd: convert YYYY-MM-DD to UTC start/end Date
 */
function parseYMDOrFallback(v: string | undefined, fallback: string): string {
  const raw = (v ?? "").trim();
  if (!raw) return fallback;
  // prefer explicit YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return fallback;
  return d.toISOString().slice(0, 10);
}
function ymdToUTCStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((s) => Number(s));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}
function ymdToUTCEnd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((s) => Number(s));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999));
}

/** ✅ resolve จังหวัดเหมือน dashboard */
async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  assertIdent(REF_SCHEMA, "ref schema");
  assertIdent(REF_PROVINCES_TABLE, "ref table");
  assertIdent(REF_PROVINCE_ID_COL, "ref province id col");
  assertIdent(REF_PROVINCE_NAME_COL, "ref province name col");

  const refTable = sql`${sql.ref(`${REF_SCHEMA}.${REF_PROVINCES_TABLE}`)}`;

  if (/^\d+$/.test(p)) {
    const found = await (db as any)
      .selectFrom(refTable.as("p"))
      .select(sql<string>`${refCol("p", REF_PROVINCE_NAME_COL)}`.as("province_name_th"))
      .where(sql`${refCol("p", REF_PROVINCE_ID_COL)} = ${Number(p)}`)
      .executeTakeFirst();
    return (String((found as any)?.province_name_th ?? "").trim() || null);
  }

  const found = await (db as any)
    .selectFrom(refTable.as("p"))
    .select(sql<string>`${refCol("p", REF_PROVINCE_NAME_COL)}`.as("province_name_th"))
    .where(sql`${refCol("p", REF_PROVINCE_NAME_COL)} = ${p}`)
    .executeTakeFirst();

  return (String((found as any)?.province_name_th ?? "").trim() || null);
}

/**
 * Resolve fact table name for a given disease; return null if disease is empty.
 * Basic mapping: recognize 'influenza' and 'd01' as the D01_TABLE, otherwise return D01_TABLE as a sensible default.
 */
async function resolveFactTableByDisease(disease: string): Promise<string | null> {
  const d = (disease ?? "").trim().toLowerCase();
  if (!d) return null;
  if (d.includes("influenza") || d === "d01" || d.startsWith("d01")) return D01_TABLE;
  return D01_TABLE;
}

/**
 * Resolve a canonical disease code from a user-provided disease string.
 * Returns a short canonical code (e.g. 'd01') or null if the input is empty.
 */
async function resolveDiseaseCode(disease: string): Promise<string | null> {
  const d = (disease ?? "").trim().toLowerCase();
  if (!d) return null;
  // map common aliases to canonical codes
  if (d.includes("influenza") || d === "d01" || d.startsWith("d01")) return "d01";
  return d;
}

/** Build candidate disease identifiers array used in queries (simple passthrough / alias expansion). */
function diseaseCandidates(resolved: string): string[] {
  if (!resolved) return [];
  // include common aliases for known canonical codes
  if (resolved === "d01") return ["d01", "influenza"];
  return [resolved];
}

async function queryGenderDeaths(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<GenderCounts> {
  const startYMD = parseYMDOrFallback(opts.start_date, "2024-01-01");
  const endYMD = parseYMDOrFallback(opts.end_date, "2024-12-31");

  // use consistent variable names used in the query below
  const start = ymdToUTCStart(startYMD);
  const end = ymdToUTCEnd(endYMD);

  const fact = await resolveFactTableByDisease(opts.disease);
  if (!fact) return { male: 0, female: 0, unknown: 0 };

  const resolved = await resolveDiseaseCode(opts.disease);
  if (!resolved) return { male: 0, female: 0, unknown: 0 };

  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0) return { male: 0, female: 0, unknown: 0 };

  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_DEATH_COL, "d01 death col");
  assertIdent(D01_GENDER_COL, "d01 gender col");

  const g = sql`LOWER(TRIM(COALESCE(${refCol("ic", D01_GENDER_COL)}, '')))`;

  const row = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select(() => [
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))`.as("female"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} NOT IN ('m','male','ชาย','f','female','หญิง'))`.as("unknown"),
    ])
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${opts.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} IS NOT NULL`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} <= ${end}`)
    .executeTakeFirst();

  return {
    male: Number((row as any)?.male ?? 0),
    female: Number((row as any)?.female ?? 0),
    unknown: Number((row as any)?.unknown ?? 0),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = (sp.get("start_date") ?? "2024-01-01").trim();
    const end_date = (sp.get("end_date") ?? "2024-12-31").trim();
    const mainProvinceRaw = (sp.get("mainProvince") ?? "").trim();
    const compareProvinceRaw = (sp.get("compareProvince") ?? "").trim();
    const disease = (sp.get("disease") ?? "").trim();

    if (!mainProvinceRaw || !compareProvinceRaw || !disease) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince, compareProvince และ disease ให้ครบ" },
        { status: 400 }
      );
    }

    const [mainProvince, compareProvince] = await Promise.all([
      resolveProvinceName(mainProvinceRaw),
      resolveProvinceName(compareProvinceRaw),
    ]);

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: `ไม่พบจังหวัด: ${!mainProvince ? mainProvinceRaw : compareProvinceRaw}` },
        { status: 404 }
      );
    }

    const [mainCounts, compareCounts] = await Promise.all([
      queryGenderDeaths({ start_date, end_date, provinceNameTh: mainProvince, disease }),
      queryGenderDeaths({
        start_date,
        end_date,
        provinceNameTh: compareProvince,
        disease,
      }),
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
    console.error("❌ API ERROR (compareInfo/gender-deaths):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
