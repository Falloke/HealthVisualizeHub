import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";
import { resolveDiseaseId as resolveDiseaseIdLoose } from "@/lib/kysely3/resolveDiseaseId";

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

function parseDateOrThrow(v: string, name: string): Date {
  const raw = (v ?? "").trim();
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
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

/** ✅ resolve จาก ref.provinces_moph */
async function resolveProvince(provinceParam: string): Promise<{
  province_id: number;
  province_name_th: string;
  region_id: number | null;
} | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_id"),
        sql<string>`p.province_name_th`.as("province_name_th"),
        sql<number>`p.region_id`.as("region_id"),
      ])
      .where(sql`p.province_no`, "=", Number(p))
      .executeTakeFirst();
    return row as any;
  }

  const row = await db
    .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
    .select([
      sql<number>`p.province_no`.as("province_id"),
      sql<string>`p.province_name_th`.as("province_name_th"),
      sql<number>`p.region_id`.as("region_id"),
    ])
    .where(sql`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return row as any;
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
    if (important.has(norm) && !selectedRows.some((r) => normalizeProvinceName(r.province) === norm))
      selectedRows.push(row);
    else otherRows.push(row);
  }

  if (selectedRows.length >= LIMIT) return sortByPatientsDesc(selectedRows).slice(0, LIMIT);

  const needOthers = LIMIT - selectedRows.length;
  const result = [...selectedRows, ...otherRows.slice(0, needOthers)];
  return sortByPatientsDesc(result);
}

async function getPatientsCountByProvince(args: {
  diseaseId: number | null;
  start: Date;
  end: Date;
  provinceId: number;
}): Promise<number> {
  let q = db
    .selectFrom(sql`"method_e"."mv_daily_province"`.as("m"))
    .select(sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"))
    .where(sql`m.province_id`, "=", args.provinceId)
    .where(sql`m.onset_date`, ">=", args.start)
    .where(sql`m.onset_date`, "<=", args.end);

  if (args.diseaseId != null) q = q.where(sql`m.disease_id`, "=", args.diseaseId);

  const row = await q.executeTakeFirst();
  return Number((row as any)?.patients ?? 0);
}

async function top5ByRegionId(args: {
  diseaseId: number | null;
  start: Date;
  end: Date;
  regionId: number;
}): Promise<Row[]> {
  let q = db
    .selectFrom(sql`"method_e"."mv_daily_province"`.as("m"))
    .innerJoin(sql`"ref"."provinces_moph"`.as("p"), sql`p.province_no`, "m.province_id")
    .select([
      sql<string>`p.province_name_th`.as("province"),
      sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"),
    ])
    .where(sql`p.region_id`, "=", args.regionId)
    .where(sql`m.onset_date`, ">=", args.start)
    .where(sql`m.onset_date`, "<=", args.end)
    .groupBy(sql`p.province_name_th`)
    .orderBy(sql`patients`, "desc")
    .limit(5);

  if (args.diseaseId != null) q = q.where(sql`m.disease_id`, "=", args.diseaseId);

  const rows = await q.execute();

  return (rows as any[]).map((r, i) => ({
    province: String(r.province),
    patients: Number(r.patients ?? 0),
    rank: i + 1,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<APIResp>(
        {
          ok: false,
          sameRegion: false,
          mainRows: [],
          compareRows: [],
          error: "ต้องระบุทั้ง mainProvince และ compareProvince",
        },
        { status: 400 }
      );
    }

    const start = parseDateOrThrow(start_date, "start_date");
    const end = parseDateOrThrow(end_date, "end_date");
    const diseaseId = await resolveDiseaseId(sp);

    const [mainProv, compareProv] = await Promise.all([
      resolveProvince(mainProvince),
      resolveProvince(compareProvince),
    ]);

    const mRegionId = mainProv?.region_id ?? null;
    const cRegionId = compareProv?.region_id ?? null;

    const sameRegion = mRegionId != null && cRegionId != null && mRegionId === cRegionId;

    let mainRows: Row[] = [];
    let compareRows: Row[] = [];
    let note = "";

    const [mainSelectedPatients, compareSelectedPatients] = await Promise.all([
      mainProv?.province_id
        ? getPatientsCountByProvince({ diseaseId, start, end, provinceId: mainProv.province_id })
        : Promise.resolve(0),
      compareProv?.province_id
        ? getPatientsCountByProvince({ diseaseId, start, end, provinceId: compareProv.province_id })
        : Promise.resolve(0),
    ]);

    const mainSelected = { province: mainProvince, patients: mainSelectedPatients };
    const compareSelected = { province: compareProvince, patients: compareSelectedPatients };

    if (mRegionId == null) {
      mainRows = [{ province: mainProvince, patients: mainSelectedPatients, rank: 1, isMain: true }];
      compareRows = [];
      note = "ไม่พบ region_id ของจังหวัดหลักใน ref.provinces_moph";
    } else if (sameRegion) {
      const combined = await top5ByRegionId({ diseaseId, start, end, regionId: mRegionId });

      upsertSelected(combined, mainSelected, { isMain: true });
      upsertSelected(combined, compareSelected, { isCompare: true });

      mainRows = ensureLimit5WithSelected(combined, [mainProvince, compareProvince]);
      compareRows = [];
      note = "จังหวัดหลักและจังหวัดที่เปรียบเทียบอยู่ region เดียวกัน แสดง Top 5 และบังคับให้ทั้งสองจังหวัดโผล่เสมอ";
    } else {
      const rowsMain = await top5ByRegionId({ diseaseId, start, end, regionId: mRegionId });
      upsertSelected(rowsMain, mainSelected, { isMain: true });
      mainRows = ensureLimit5WithSelected(rowsMain, [mainProvince]);

      if (cRegionId == null) {
        compareRows = [
          { province: compareProvince, patients: compareSelectedPatients, rank: 1, isCompare: true },
        ];
        note = "ไม่พบ region_id ของจังหวัดที่เปรียบเทียบใน ref.provinces_moph";
      } else {
        const rowsCompare = await top5ByRegionId({ diseaseId, start, end, regionId: cRegionId });
        upsertSelected(rowsCompare, compareSelected, { isCompare: true });
        compareRows = ensureLimit5WithSelected(rowsCompare, [compareProvince]);
      }
    }

    return NextResponse.json<APIResp>(
      {
        ok: true,
        sameRegion,
        mainRegion: mRegionId != null ? String(mRegionId) : undefined,
        compareRegion: cRegionId != null ? String(cRegionId) : undefined,
        mainRows,
        compareRows,
        note,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/region-top5):", e);
    return NextResponse.json<APIResp>(
      {
        ok: false,
        sameRegion: false,
        mainRows: [],
        compareRows: [],
        error: e?.message ?? "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
