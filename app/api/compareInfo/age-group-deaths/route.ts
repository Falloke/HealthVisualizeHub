<<<<<<< HEAD
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely/db";
=======
// D:\HealtRiskHub\app\api\compareInfo\age-group-deaths\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";
>>>>>>> feature/Method_F&Method_G

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RowOut = { ageRange: string; mainDeaths: number; compareDeaths: number };
type AgeRow = { ageRange: string; deaths: number };

<<<<<<< HEAD
type RowMerged = {
  ageRange: string;
  mainDeaths: number;
  compareDeaths: number;
};

const AGE_ORDER = [
  "0-4",
  "5-9",
  "10-14",
  "15-19",
  "20-24",
  "25-44",
  "45-59",
  "60+",
] as const;

const AGE_SET = new Set<string>(AGE_ORDER as unknown as string[]);

// ✅ CONFIG via ENV (เหมือนหน้า dashboard)
const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim(); // เช่น "date"

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
}

function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
=======
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
>>>>>>> feature/Method_F&Method_G
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

/** ✅ รองรับ D01 / 01 / 1 / 001 / d01 */
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

/** ✅ resolve code จากตาราง diseases.code/name_th/name_en */
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

async function queryAgeDeaths(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<AgeRow[]> {
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

<<<<<<< HEAD
  const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

  // ถ้า cast เป็น date จะ compare ด้วย string YYYY-MM-DD ได้
  const compareStart = DEATH_DATE_CAST ? startYMD : startDate;
  const compareEnd = DEATH_DATE_CAST ? endYMD : endDate;

  const rows = await (db as any)
    .withSchema(fact.schema)
    .selectFrom(`${fact.table} as ic` as any)
    .select([ageCase, sql<number>`COUNT(*)::int`.as("deaths")])
    .where("ic.province", "=", args.provinceNameTh)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where(sql<boolean>`${deathDate} IS NOT NULL`)
    .where(deathDate, ">=", compareStart as any)
    .where(deathDate, "<=", compareEnd as any)
    .where(sql`ic.age_y IS NOT NULL`)
=======
  const rows = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select([ageCase, sql<number>`COUNT(*)`.as("deaths")])
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${args.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} IS NOT NULL`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} <= ${end}`)
    .where(sql`${ageCol} IS NOT NULL`)
>>>>>>> feature/Method_F&Method_G
    .groupBy("ageRange")
    .execute();

  const map = new Map<string, number>();
  for (const r of rows as any[]) {
<<<<<<< HEAD
    const k = String(r.ageRange ?? "").trim();
    if (!k) continue;
    map.set(k, Number(r.deaths ?? 0));
=======
    const k = String(r?.ageRange ?? "").trim();
    if (!k) continue;
    map.set(k, Number(r?.deaths ?? 0));
>>>>>>> feature/Method_F&Method_G
  }

  return (AGE_ORDER as unknown as string[]).map((ageRange) => ({
    ageRange,
    deaths: map.get(ageRange) ?? 0,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

<<<<<<< HEAD
    const start_date = sp.get("start_date") ?? "";
    const end_date = sp.get("end_date") ?? "";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";
    const disease = (sp.get("disease") || sp.get("diseaseCode") || "").trim();

    if (!start_date || !end_date || !mainProvince || !compareProvince || !disease) {
      return NextResponse.json(
        {
          error:
            "missing required query params (start_date,end_date,mainProvince,compareProvince,disease)",
        },
        { status: 400 }
=======
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
>>>>>>> feature/Method_F&Method_G
      );
    }

    const [mainRows, compareRows] = await Promise.all([
      queryAgeDeaths({
        start_date,
        end_date,
        provinceNameTh: mainProvince,
        disease,
      }),
      queryAgeDeaths({
        start_date,
        end_date,
        provinceNameTh: compareProvince,
        disease,
      }),
    ]);

    const mainMap = new Map(mainRows.map((r) => [r.ageRange, r.deaths]));
    const compareMap = new Map(compareRows.map((r) => [r.ageRange, r.deaths]));

<<<<<<< HEAD
    return NextResponse.json(merged, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group-deaths] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
=======
    const out: RowOut[] = (AGE_ORDER as unknown as string[]).map((ageRange) => ({
      ageRange,
      mainDeaths: Number(mainMap.get(ageRange) ?? 0),
      compareDeaths: Number(compareMap.get(ageRange) ?? 0),
    }));

    return NextResponse.json(out, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group-deaths] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
>>>>>>> feature/Method_F&Method_G
  }
}
