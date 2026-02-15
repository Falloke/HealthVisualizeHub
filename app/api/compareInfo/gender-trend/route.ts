<<<<<<< HEAD
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely/db";
=======
// D:\HealtRiskHub\app\api\compareInfo\gender-trend\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";
>>>>>>> feature/Method_F&Method_G

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

<<<<<<< HEAD
// -------------------- Date helpers --------------------
function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}
function ymdToUTCStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}
function ymdToUTCEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`);
=======
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
>>>>>>> feature/Method_F&Method_G
}

// -------------------- Display helpers --------------------
function toThaiMonthLabel(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = new Date(y, mo, 1);
  return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
}

<<<<<<< HEAD
// -------------------- Disease helpers --------------------
function diseaseCandidates(raw: string) {
  const v = (raw || "").trim();
  if (!v) return [];

  const set = new Set<string>();
  set.add(v);
  set.add(v.toUpperCase());
  set.add(v.toLowerCase());

  let digits: string | null = null;
  const m = v.match(/^d(\d+)$/i);
  if (m?.[1]) digits = m[1];
  if (!digits && /^\d+$/.test(v)) digits = v;

  if (digits) {
    const n = String(Number(digits));
    const pad2 = n.padStart(2, "0");
    const pad3 = n.padStart(3, "0");

    set.add(n);
    set.add(pad2);
    set.add(pad3);

    set.add(`D${n}`);
    set.add(`D${pad2}`);
    set.add(`D${pad3}`);

    set.add(`d${n}`);
    set.add(`d${pad2}`);
    set.add(`d${pad3}`);
  }

  return Array.from(set).filter(Boolean);
}

async function resolveDiseaseCode(diseaseParam: string) {
  const raw = (diseaseParam || "").trim();
  if (!raw) return null;

  const candidates = diseaseCandidates(raw);

  const byCode = await db
    .selectFrom("diseases")
    .select(["code"])
    .where("code", "in", candidates as any)
    .executeTakeFirst();

  if ((byCode as any)?.code) return String((byCode as any).code);

  const byName = await db
    .selectFrom("diseases")
    .select(["code"])
    .where((eb) =>
      eb.or([
        eb("name_th", "in", candidates as any),
        eb("name_en", "in", candidates as any),
      ])
    )
    .executeTakeFirst();

  if ((byName as any)?.code) return String((byName as any).code);

  return raw;
}

// -------------------- fact table resolver --------------------
function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(String(s || "").trim());
}

async function resolveFactTableByDisease(
  diseaseParam: string
): Promise<{ schema: string; table: string } | null> {
  const resolved = await resolveDiseaseCode(diseaseParam);
  if (!resolved) return null;

  const candidates = diseaseCandidates(resolved);
  if (candidates.length === 0) return null;

  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active"])
    .where("disease_code", "in", candidates as any)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  if (!schema || !table) return null;
  if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

  return { schema, table };
}

// -------------------- Query --------------------
=======
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

>>>>>>> feature/Method_F&Method_G
async function queryGenderTrend(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<TrendData[]> {
  const startYMD = parseYMDOrFallback(args.start_date, "2024-01-01");
  const endYMD = parseYMDOrFallback(args.end_date, "2024-12-31");

  const startDate = ymdToUTCStart(startYMD);
  const endDate = ymdToUTCEnd(endYMD);

  const fact = await resolveFactTableByDisease(args.disease);
  if (!fact) return [];

  const resolved = await resolveDiseaseCode(args.disease);
  if (!resolved) return [];

  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0) return [];

<<<<<<< HEAD
  const g = sql`LOWER(TRIM(COALESCE(ic.gender, '')))`;
  const monthKey =
    sql<string>`TO_CHAR(date_trunc('month', ic.onset_date_parsed), 'YYYY-MM')`.as(
      "month"
    );

  const rows = await (db as any)
    .withSchema(fact.schema)
    .selectFrom(`${fact.table} as ic` as any)
=======
  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_ONSET_COL, "d01 onset col");
  assertIdent(D01_GENDER_COL, "d01 gender col");

  const g = sql`LOWER(TRIM(COALESCE(${refCol("ic", D01_GENDER_COL)}, '')))`;
  const monthKey = sql<string>`TO_CHAR(date_trunc('month', ${refCol("ic", D01_ONSET_COL)}), 'YYYY-MM')`.as("month");

  const rows = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
>>>>>>> feature/Method_F&Method_G
    .select(() => [
      monthKey,
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))::int`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))::int`.as("female"),
    ])
<<<<<<< HEAD
    .where("ic.province", "=", args.provinceNameTh)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where("ic.onset_date_parsed", ">=", startDate)
    .where("ic.onset_date_parsed", "<=", endDate)
=======
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${args.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} <= ${end}`)
>>>>>>> feature/Method_F&Method_G
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

<<<<<<< HEAD
    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = (sp.get("mainProvince") ?? "").trim();
    const compareProvince = (sp.get("compareProvince") ?? "").trim();
    const disease = (sp.get("disease") || sp.get("diseaseCode") || "").trim();

    if (!mainProvince || !compareProvince || !disease) {
=======
    const start_date = (sp.get("start_date") ?? "2024-01-01").trim();
    const end_date = (sp.get("end_date") ?? "2024-12-31").trim();
    const mainProvinceRaw = (sp.get("mainProvince") ?? "").trim();
    const compareProvinceRaw = (sp.get("compareProvince") ?? "").trim();

    if (!mainProvinceRaw || !compareProvinceRaw) {
>>>>>>> feature/Method_F&Method_G
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

    const [mainTrend, compareTrend] = await Promise.all([
      queryGenderTrend({ start_date, end_date, provinceNameTh: mainProvince, disease }),
      queryGenderTrend({ start_date, end_date, provinceNameTh: compareProvince, disease }),
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

<<<<<<< HEAD
    return NextResponse.json<APIResp>(
      { ok: true, rows },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
=======
    return NextResponse.json<APIResp>({ ok: true, rows }, { status: 200, headers: { "Cache-Control": "no-store" } });
>>>>>>> feature/Method_F&Method_G
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-trend):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
