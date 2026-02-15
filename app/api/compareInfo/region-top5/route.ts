// D:\HealtRiskHub\app\api\compareInfo\region-top5\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { province: string; patients: number; rank?: number; isMain?: boolean; isCompare?: boolean };

type APIResp = {
  ok: boolean;
  sameRegion: boolean;
  mainRegion?: string;
  compareRegion?: string;
  mainRows: Row[];
  compareRows: Row[];
  note?: string;
  error?: string;
};

// ref.provinces_moph
const REF_SCHEMA = (process.env.DB_REF_SCHEMA || "ref").trim();
const REF_PROVINCES_TABLE = (process.env.DB_REF_PROVINCES_TABLE || "provinces_moph").trim();
const REF_PROVINCE_NAME_COL = (process.env.DB_REF_PROVINCE_NAME_COL || "province_name_th").trim();
const REF_REGION_COL = (process.env.DB_REF_REGION_COL || "region_id").trim();

// d01_influenza
const D01_TABLE = (process.env.DB_D01_TABLE || "d01_influenza").trim();
const D01_PROVINCE_COL = (process.env.DB_D01_PROVINCE_COL || "province").trim();
const D01_ONSET_COL = (process.env.DB_D01_ONSET_COL || "onset_date_parsed").trim();

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

function sortByPatientsDesc(rows: Row[]): Row[] {
  rows.sort((a, b) => Number(b.patients ?? 0) - Number(a.patients ?? 0));
  return rows;
}

function normalizeProvinceName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\(อันดับ\s*\d+\)\s*$/u, "").trim();
}

function upsertSelected(
  rows: Row[],
  selected: { province: string; patients: number; rank?: number } | null,
  flags: Partial<Row>
) {
  if (!selected?.province) return;

  const norm = normalizeProvinceName(selected.province);
  const patients = Number(selected.patients ?? 0);
  const rank = selected.rank;
  const label = typeof rank === "number" && rank > 0 ? `${norm} (อันดับ ${rank})` : norm;

  const idx = rows.findIndex((r) => normalizeProvinceName(r.province) === norm);
  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      ...flags,
      rank: rows[idx].rank ?? rank,
      province: label,
      patients: rows[idx].patients ?? patients,
    };
  } else {
    rows.push({ province: label, patients, rank, ...flags });
  }
}

function ensureLimit5WithSelected(rows: Row[], importantNames: string[]): Row[] {
  const LIMIT = 5;
  sortByPatientsDesc(rows);

  const important = new Set(importantNames.map(normalizeProvinceName).filter(Boolean));
  if (rows.length <= LIMIT && important.size === 0) return rows;

  const selectedRows: Row[] = [];
  const otherRows: Row[] = [];

  for (const row of rows) {
    const norm = normalizeProvinceName(row.province);
    if (important.has(norm) && !selectedRows.some((r) => normalizeProvinceName(r.province) === norm)) selectedRows.push(row);
    else otherRows.push(row);
  }

  if (selectedRows.length >= LIMIT) return sortByPatientsDesc(selectedRows).slice(0, LIMIT);

  const needOthers = LIMIT - selectedRows.length;
  const result = [...selectedRows, ...otherRows.slice(0, needOthers)];
  return sortByPatientsDesc(result);
}

async function getRegionIdByProvinceName(provinceNameTh: string): Promise<string | null> {
  assertIdent(REF_SCHEMA, "ref schema");
  assertIdent(REF_PROVINCES_TABLE, "ref table");
  assertIdent(REF_PROVINCE_NAME_COL, "ref province name col");
  assertIdent(REF_REGION_COL, "ref region col");

  const refTable = sql`${sql.ref(`${REF_SCHEMA}.${REF_PROVINCES_TABLE}`)}`;

  const row = await (db as any)
    .selectFrom(refTable.as("p"))
    .select(sql<any>`${refCol("p", REF_REGION_COL)}`.as("region_id"))
    .where(sql`${refCol("p", REF_PROVINCE_NAME_COL)} = ${provinceNameTh}`)
    .executeTakeFirst();

  const v = (row as any)?.region_id;
  return v != null ? String(v) : null;
}

async function getPatientsCountByProvince(args: { start: Date; end: Date; provinceNameTh: string }): Promise<number> {
  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_ONSET_COL, "d01 onset col");

  const row = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select(sql<number>`COUNT(*)`.as("patients"))
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${args.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} >= ${args.start}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} <= ${args.end}`)
    .executeTakeFirst();

  return Number((row as any)?.patients ?? 0);
}

async function top5ByRegionId(args: { start: Date; end: Date; regionId: string }): Promise<Row[]> {
  // หา "รายชื่อจังหวัดใน region" จาก ref.provinces_moph ก่อน แล้วค่อยนับจาก d01_influenza
  const refTable = sql`${sql.ref(`${REF_SCHEMA}.${REF_PROVINCES_TABLE}`)}`;

  const provincesInRegion = await (db as any)
    .selectFrom(refTable.as("p"))
    .select(sql<string>`${refCol("p", REF_PROVINCE_NAME_COL)}`.as("province"))
    .where(sql`${refCol("p", REF_REGION_COL)} = ${args.regionId}`)
    .execute();

  const names = (provincesInRegion as any[]).map((r) => String(r.province ?? "").trim()).filter(Boolean);
  if (names.length === 0) return [];

  const rows = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select([sql<string>`${refCol("ic", D01_PROVINCE_COL)}`.as("province"), sql<number>`COUNT(*)`.as("patients")])
    .where(sql`${refCol("ic", D01_ONSET_COL)} >= ${args.start}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} <= ${args.end}`)
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ANY(${sql.val(names)}::text[])`)
    .groupBy("province")
    .orderBy("patients", "desc")
    .limit(5)
    .execute();

  return (rows as any[]).map((r, i) => ({
    province: String(r.province),
    patients: Number(r.patients ?? 0),
    rank: i + 1,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = (sp.get("start_date") ?? "2024-01-01").trim();
    const end_date = (sp.get("end_date") ?? "2024-12-31").trim();
    const mainProvince = (sp.get("mainProvince") ?? "").trim();
    const compareProvince = (sp.get("compareProvince") ?? "").trim();

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, sameRegion: false, mainRows: [], compareRows: [], error: "ต้องระบุทั้ง mainProvince และ compareProvince" },
        { status: 400 }
      );
    }

    const start = parseDateOrThrow(start_date, "start_date");
    const end = parseDateOrThrow(end_date, "end_date");

    const [mRegionId, cRegionId] = await Promise.all([
      getRegionIdByProvinceName(mainProvince),
      getRegionIdByProvinceName(compareProvince),
    ]);

    const sameRegion = mRegionId != null && cRegionId != null && mRegionId === cRegionId;

    let mainRows: Row[] = [];
    let compareRows: Row[] = [];
    let note = "";

    const [mainSelectedPatients, compareSelectedPatients] = await Promise.all([
      getPatientsCountByProvince({ start, end, provinceNameTh: mainProvince }),
      getPatientsCountByProvince({ start, end, provinceNameTh: compareProvince }),
    ]);

    const mainSelected = { province: mainProvince, patients: mainSelectedPatients };
    const compareSelected = { province: compareProvince, patients: compareSelectedPatients };

    if (mRegionId == null) {
      mainRows = [{ province: mainProvince, patients: mainSelectedPatients, rank: 1, isMain: true }];
      compareRows = [];
      note = `ไม่พบ ${REF_REGION_COL} ของจังหวัดหลักใน ref.provinces_moph`;
    } else if (sameRegion) {
      const combined = await top5ByRegionId({ start, end, regionId: mRegionId });

      upsertSelected(combined, mainSelected, { isMain: true });
      upsertSelected(combined, compareSelected, { isCompare: true });

      mainRows = ensureLimit5WithSelected(combined, [mainProvince, compareProvince]);
      compareRows = [];
      note = "จังหวัดหลักและจังหวัดที่เปรียบเทียบอยู่ภูมิภาคเดียวกัน (จะแสดงรวมไม่เกิน 5 และบังคับให้ทั้งสองจังหวัดอยู่ในกราฟเสมอ)";
    } else {
      const rowsMain = await top5ByRegionId({ start, end, regionId: mRegionId });
      upsertSelected(rowsMain, mainSelected, { isMain: true });
      mainRows = ensureLimit5WithSelected(rowsMain, [mainProvince]);

      if (cRegionId == null) {
        compareRows = [{ province: compareProvince, patients: compareSelectedPatients, rank: 1, isCompare: true }];
        note = `ไม่พบ ${REF_REGION_COL} ของจังหวัดที่เปรียบเทียบใน ref.provinces_moph`;
      } else {
        const rowsCompare = await top5ByRegionId({ start, end, regionId: cRegionId });
        upsertSelected(rowsCompare, compareSelected, { isCompare: true });
        compareRows = ensureLimit5WithSelected(rowsCompare, [compareProvince]);
      }
    }

    return NextResponse.json<APIResp>(
      {
        ok: true,
        sameRegion,
        mainRegion: mRegionId ?? undefined,
        compareRegion: cRegionId ?? undefined,
        mainRows,
        compareRows,
        note,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/region-top5):", e);
    return NextResponse.json<APIResp>(
      { ok: false, sameRegion: false, mainRows: [], compareRows: [], error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
