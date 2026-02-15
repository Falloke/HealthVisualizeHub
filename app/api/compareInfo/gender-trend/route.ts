// D:\HealtRiskHub\app\api\compareInfo\gender-trend\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

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

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date((v ?? "").trim());
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

function assertIdent(name: string, label: string) {
  const v = (name ?? "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) throw new Error(`Invalid ${label}: ${name}`);
  return v;
}
function refCol(alias: string, col: string) {
  return sql.ref(`${assertIdent(alias, "alias")}.${assertIdent(col, "column")}`);
}

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

async function queryGenderTrend(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<TrendData[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_ONSET_COL, "d01 onset col");
  assertIdent(D01_GENDER_COL, "d01 gender col");

  const g = sql`LOWER(TRIM(COALESCE(${refCol("ic", D01_GENDER_COL)}, '')))`;
  const monthKey = sql<string>`TO_CHAR(date_trunc('month', ${refCol("ic", D01_ONSET_COL)}), 'YYYY-MM')`.as("month");

  const rows = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select(() => [
      monthKey,
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))`.as("female"),
    ])
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${args.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} <= ${end}`)
    .groupBy("month")
    .orderBy("month", "asc")
    .execute();

  return (rows as any[]).map((r) => ({
    month: String(r.month),
    male: Number(r.male ?? 0),
    female: Number(r.female ?? 0),
  }));
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

    const [mainTrend, compareTrend] = await Promise.all([
      queryGenderTrend({ start_date, end_date, provinceNameTh: mainProvince }),
      queryGenderTrend({ start_date, end_date, provinceNameTh: compareProvince }),
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

    return NextResponse.json<APIResp>({ ok: true, rows }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-trend):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
