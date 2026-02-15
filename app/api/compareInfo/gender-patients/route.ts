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
const D01_ONSET_COL = (process.env.DB_D01_ONSET_COL || "onset_date_parsed").trim();
const D01_GENDER_COL = (process.env.DB_D01_GENDER_COL || "gender").trim();

function assertIdent(name: string, label: string): string {
  const v = (name ?? "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
  return v;
}

function parseYMDOrFallback(v: string, fallback: string): string {
  const s = (v ?? "").trim() || fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return fallback;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdToUTCStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function ymdToUTCEnd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

/**
 * Minimal disease-to-fact-table resolver for this service.
 * Extend mapping as needed for other diseases/fact tables.
 */
async function resolveFactTableByDisease(disease: string): Promise<string | null> {
  const s = (disease ?? "").toLowerCase().trim();
  if (!s) return null;

  // D01 aliases
  if (s === "d01" || s.includes("influenza") || s.includes("flu") || s.includes("ไข้หวัด")) {
    return D01_TABLE;
  }

  return null;
}

/** Normalize disease code string */
async function resolveDiseaseCode(disease: string): Promise<string | null> {
  const s = (disease ?? "").trim().toLowerCase();
  return s || null;
}

/**
 * Resolve province display name in ref.provinces_moph
 * - input can be province_no (numeric) or province_name_th (text)
 */
async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  const schema = assertIdent(REF_SCHEMA, "ref schema");
  const table = assertIdent(REF_PROVINCES_TABLE, "ref table");
  const idCol = assertIdent(REF_PROVINCE_ID_COL, "ref province id col");
  const nameCol = assertIdent(REF_PROVINCE_NAME_COL, "ref province name col");
  const fullRefTable = `${schema}.${table}`;

  if (/^\d+$/.test(p)) {
    const found = await (db as any)
      .selectFrom(sql`${sql.ref(fullRefTable)}`.as("p"))
      .select(sql<string>`${sql.ref(`p.${nameCol}`)}`.as("province_name_th"))
      .where(sql`${sql.ref(`p.${idCol}`)} = ${Number(p)}`)
      .executeTakeFirst();

    return String((found as any)?.province_name_th ?? "").trim() || null;
  }

  const found = await (db as any)
    .selectFrom(sql`${sql.ref(fullRefTable)}`.as("p"))
    .select(sql<string>`${sql.ref(`p.${nameCol}`)}`.as("province_name_th"))
    .where(sql`${sql.ref(`p.${nameCol}`)} = ${p}`)
    .executeTakeFirst();

  return String((found as any)?.province_name_th ?? "").trim() || null;
}

async function queryGenderPatients(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<GenderCounts> {
  const startYMD = parseYMDOrFallback(opts.start_date, "2024-01-01");
  const endYMD = parseYMDOrFallback(opts.end_date, "2024-12-31");
  const startDate = ymdToUTCStart(startYMD);
  const endDate = ymdToUTCEnd(endYMD);

  const fact = await resolveFactTableByDisease(opts.disease);
  const diseaseCode = await resolveDiseaseCode(opts.disease);
  if (!fact || !diseaseCode) return { male: 0, female: 0, unknown: 0 };

  // For now this route supports D01 fact shape
  const table = assertIdent(fact, "fact table");
  const provinceCol = assertIdent(D01_PROVINCE_COL, "d01 province col");
  const onsetCol = assertIdent(D01_ONSET_COL, "d01 onset col");
  const genderCol = assertIdent(D01_GENDER_COL, "d01 gender col");

  const g = sql`LOWER(TRIM(COALESCE(${sql.ref(`ic.${genderCol}`)}, '')))`;

  const row = await (db as any)
    .selectFrom(sql`${sql.ref(table)}`.as("ic"))
    .select(() => [
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))`.as("female"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} NOT IN ('m','male','ชาย','f','female','หญิง'))`.as("unknown"),
    ])
    .where(sql`${sql.ref(`ic.${provinceCol}`)} = ${opts.provinceNameTh}`)
    .where(sql`${sql.ref(`ic.${onsetCol}`)} >= ${startDate}`)
    .where(sql`${sql.ref(`ic.${onsetCol}`)} <= ${endDate}`)
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
      queryGenderPatients({
        start_date,
        end_date,
        provinceNameTh: mainProvince,
        disease,
      }),
      queryGenderPatients({
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
    console.error("❌ API ERROR (compareInfo/gender-patients):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
