import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AgeRow = { ageRange: string; patients: number };
type RowMerged = { ageRange: string; mainPatients: number; comparePatients: number };
type QueryRow = { ageRange: string | null; patients: number | string | null };

const AGE_ORDER = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-44", "45-59", "60+"] as const;
const AGE_SET = new Set<string>(AGE_ORDER as unknown as string[]);

// ref table
const REF_SCHEMA = (process.env.DB_REF_SCHEMA || "ref").trim();
const REF_PROVINCES_TABLE = (process.env.DB_REF_PROVINCES_TABLE || "provinces_moph").trim();
const REF_PROVINCE_ID_COL = (process.env.DB_REF_PROVINCE_ID_COL || "province_no").trim();
const REF_PROVINCE_NAME_COL = (process.env.DB_REF_PROVINCE_NAME_COL || "province_name_th").trim();

// disease table
const D01_TABLE = (process.env.DB_D01_TABLE || "d01_influenza").trim();
const D01_PROVINCE_COL = (process.env.DB_D01_PROVINCE_COL || "province").trim();
const D01_ONSET_COL = (process.env.DB_D01_ONSET_COL || "onset_date_parsed").trim();
const D01_AGE_COL = (process.env.DB_D01_AGE_COL || "age_y").trim();

/** =========================
 * Utils
 * ========================= */
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
    const v = Number(r.patients ?? 0);
    mainMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  for (const r of compare ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.patients ?? 0);
    compareMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  const base: RowMerged[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    mainPatients: mainMap.get(k) ?? 0,
    comparePatients: compareMap.get(k) ?? 0,
  }));

  const extras = Array.from(extra.values())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({
      ageRange: k,
      mainPatients: mainMap.get(k) ?? 0,
      comparePatients: compareMap.get(k) ?? 0,
    }));

  return base.concat(extras);
}

function assertIdent(name: string, label: string) {
  const v = (name ?? "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) throw new Error(`Invalid ${label}: ${name}`);
  return v;
}

/** helper: dynamic table + SQL ref (ไม่ใช้ db.dynamic.ref().as()) */
const t = (name: string) => (db.dynamic.table(name as any) as any);
const col = (path: string) => sql.ref(path); // <= ใช้ sql.ref เพื่อให้ alias ได้

async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  const schema = assertIdent(REF_SCHEMA, "ref schema");
  const refTableName = assertIdent(REF_PROVINCES_TABLE, "ref table");
  const idCol = assertIdent(REF_PROVINCE_ID_COL, "ref id col");
  const nameCol = assertIdent(REF_PROVINCE_NAME_COL, "ref name col");

  const fullRefTable = `${schema}.${refTableName}`;

  if (/^\d+$/.test(p)) {
    const found = await (db as any)
      .selectFrom(t(fullRefTable).as("p"))
      .select(col(`p.${nameCol}`).as("province_name_th"))
      .where(col(`p.${idCol}`), "=", Number(p))
      .executeTakeFirst();

    return String((found as any)?.province_name_th ?? "").trim() || null;
  }

  const found = await (db as any)
    .selectFrom(t(fullRefTable).as("p"))
    .select(col(`p.${nameCol}`).as("province_name_th"))
    .where(col(`p.${nameCol}`), "=", p)
    .executeTakeFirst();

  return String((found as any)?.province_name_th ?? "").trim() || null;
}

async function queryAgePatients(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<AgeRow[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  const d01Table = assertIdent(D01_TABLE, "d01 table");
  const provinceCol = assertIdent(D01_PROVINCE_COL, "d01 province col");
  const onsetCol = assertIdent(D01_ONSET_COL, "d01 onset col");
  const ageColName = assertIdent(D01_AGE_COL, "d01 age col");

  const ageColRef = col(`ic.${ageColName}`);

  const ageCase = sql<string>`
    CASE
      WHEN ${ageColRef} BETWEEN 0 AND 4 THEN '0-4'
      WHEN ${ageColRef} BETWEEN 5 AND 9 THEN '5-9'
      WHEN ${ageColRef} BETWEEN 10 AND 14 THEN '10-14'
      WHEN ${ageColRef} BETWEEN 15 AND 19 THEN '15-19'
      WHEN ${ageColRef} BETWEEN 20 AND 24 THEN '20-24'
      WHEN ${ageColRef} BETWEEN 25 AND 44 THEN '25-44'
      WHEN ${ageColRef} BETWEEN 45 AND 59 THEN '45-59'
      WHEN ${ageColRef} >= 60 THEN '60+'
      ELSE NULL
    END
  `.as("ageRange");

  const rows = (await (db as any)
    .selectFrom(t(d01Table).as("ic"))
    .select([ageCase, sql<number>`COUNT(*)`.as("patients")])
    .where(col(`ic.${provinceCol}`), "=", args.provinceNameTh)
    .where(col(`ic.${onsetCol}`), ">=", start)
    .where(col(`ic.${onsetCol}`), "<=", end)
    .where(sql`${ageColRef} IS NOT NULL`)
    .groupBy("ageRange")
    .execute()) as QueryRow[];

  const map = new Map<string, number>();
  for (const row of rows) {
    const k = String(row?.ageRange ?? "").trim();
    if (!k) continue;
    const n = Number(row?.patients ?? 0);
    map.set(k, Number.isFinite(n) ? n : 0);
  }

  const ordered: AgeRow[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    patients: map.get(k) ?? 0,
  }));

  const extras = Array.from(map.keys())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({ ageRange: k, patients: map.get(k) ?? 0 }));

  return ordered.concat(extras);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "";
    const end_date = sp.get("end_date") ?? "";
    const mainProvinceRaw = sp.get("mainProvince") ?? "";
    const compareProvinceRaw = sp.get("compareProvince") ?? "";

    if (!start_date || !end_date || !mainProvinceRaw || !compareProvinceRaw) {
      return NextResponse.json(
        { ok: false, error: "missing required query params" },
        { status: 400 }
      );
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
      queryAgePatients({ start_date, end_date, provinceNameTh: mainProvince }),
      queryAgePatients({ start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    const merged = mergeAgeData(mainRows, compareRows);

    return NextResponse.json(merged, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const errObj =
      e instanceof Error
        ? { message: e.message, stack: e.stack }
        : { message: "Internal Server Error" };

    console.error("compareInfo age-group error", errObj);

    return NextResponse.json(
      { ok: false, error: errObj.message },
      { status: 500 }
    );
  }
}
