// D:\HealtRiskHub\app\api\compareInfo\age-group-deaths\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RowOut = { ageRange: string; mainDeaths: number; compareDeaths: number };
type AgeRow = { ageRange: string; deaths: number };

const AGE_ORDER = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-44", "45-59", "60+"] as const;

// ref.provinces_moph
const REF_SCHEMA = (process.env.DB_REF_SCHEMA || "ref").trim();
const REF_PROVINCES_TABLE = (process.env.DB_REF_PROVINCES_TABLE || "provinces_moph").trim();
const REF_PROVINCE_ID_COL = (process.env.DB_REF_PROVINCE_ID_COL || "province_no").trim();
const REF_PROVINCE_NAME_COL = (process.env.DB_REF_PROVINCE_NAME_COL || "province_name_th").trim();

// d01_influenza
const D01_TABLE = (process.env.DB_D01_TABLE || "d01_influenza").trim();
const D01_PROVINCE_COL = (process.env.DB_D01_PROVINCE_COL || "province").trim();
const D01_DEATH_COL = (process.env.DB_D01_DEATH_COL || "death_date_parsed").trim();
const D01_AGE_COL = (process.env.DB_D01_AGE_COL || "age_y").trim();

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

/** ✅ resolve จังหวัดเหมือน dashboard: ref.provinces_moph (province_no หรือ province_name_th) */
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

async function queryAgeDeaths(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<AgeRow[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_DEATH_COL, "d01 death col");
  assertIdent(D01_AGE_COL, "d01 age col");

  const ageCol = refCol("ic", D01_AGE_COL);

  const ageCase = sql<string>`
    CASE
      WHEN ${ageCol} BETWEEN 0 AND 4 THEN '0-4'
      WHEN ${ageCol} BETWEEN 5 AND 9 THEN '5-9'
      WHEN ${ageCol} BETWEEN 10 AND 14 THEN '10-14'
      WHEN ${ageCol} BETWEEN 15 AND 19 THEN '15-19'
      WHEN ${ageCol} BETWEEN 20 AND 24 THEN '20-24'
      WHEN ${ageCol} BETWEEN 25 AND 44 THEN '25-44'
      WHEN ${ageCol} BETWEEN 45 AND 59 THEN '45-59'
      WHEN ${ageCol} >= 60 THEN '60+'
      ELSE NULL
    END
  `.as("ageRange");

  const rows = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select([ageCase, sql<number>`COUNT(*)`.as("deaths")])
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${args.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} IS NOT NULL`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} <= ${end}`)
    .where(sql`${ageCol} IS NOT NULL`)
    .groupBy("ageRange")
    .execute();

  const map = new Map<string, number>();
  for (const r of rows as any[]) {
    const k = String(r?.ageRange ?? "").trim();
    if (!k) continue;
    map.set(k, Number(r?.deaths ?? 0));
  }

  return (AGE_ORDER as unknown as string[]).map((ageRange) => ({
    ageRange,
    deaths: map.get(ageRange) ?? 0,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = (sp.get("start_date") ?? "").trim();
    const end_date = (sp.get("end_date") ?? "").trim();
    const mainProvinceRaw = (sp.get("mainProvince") ?? "").trim();
    const compareProvinceRaw = (sp.get("compareProvince") ?? "").trim();

    if (!start_date || !end_date || !mainProvinceRaw || !compareProvinceRaw) {
      return NextResponse.json({ ok: false, error: "missing required query params" }, { status: 400 });
    }

    const [mainProvince, compareProvince] = await Promise.all([
      resolveProvinceName(mainProvinceRaw),
      resolveProvinceName(compareProvinceRaw),
    ]);

    if (!mainProvince || !compareProvince) {
      return NextResponse.json(
        { ok: false, error: `ไม่พบจังหวัด: ${!mainProvince ? mainProvinceRaw : compareProvinceRaw}` },
        { status: 404 }
      );
    }

    const [mainRows, compareRows] = await Promise.all([
      queryAgeDeaths({ start_date, end_date, provinceNameTh: mainProvince }),
      queryAgeDeaths({ start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    const mainMap = new Map(mainRows.map((r) => [r.ageRange, r.deaths]));
    const compareMap = new Map(compareRows.map((r) => [r.ageRange, r.deaths]));

    const out: RowOut[] = (AGE_ORDER as unknown as string[]).map((ageRange) => ({
      ageRange,
      mainDeaths: Number(mainMap.get(ageRange) ?? 0),
      compareDeaths: Number(compareMap.get(ageRange) ?? 0),
    }));

    return NextResponse.json(out, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group-deaths] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
