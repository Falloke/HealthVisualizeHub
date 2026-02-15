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

async function queryGenderDeaths(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<GenderCounts> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

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

    if (!mainProvinceRaw || !compareProvinceRaw) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince และ compareProvince ให้ครบ" },
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
      queryGenderDeaths({ start_date, end_date, provinceNameTh: mainProvince }),
      queryGenderDeaths({ start_date, end_date, provinceNameTh: compareProvince }),
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
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
