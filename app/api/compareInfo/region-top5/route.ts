// app/api/compareInfo/region-top5/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export const runtime = "nodejs";

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
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function sortByPatientsDesc(rows: Row[]): Row[] {
  rows.sort((a, b) => Number(b.patients ?? 0) - Number(a.patients ?? 0));
  return rows;
}

function normalizeProvinceName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\(อันดับ\s*\d+\)\s*$/u, "").trim();
}

function upsertSelected(rows: Row[], selected: { province: string; patients: number; rank?: number } | null, flags: Partial<Row>) {
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

async function getRegionIdByProvinceName(provinceNameTh: string): Promise<number | null> {
  const row = await db
    .selectFrom("provinces")
    .select(["region_id"])
    .where("province_name_th", "=", provinceNameTh)
    .executeTakeFirst();

  return row?.region_id ?? null;
}

async function getPatientsCountByProvince(args: {
  start: Date;
  end: Date;
  provinceNameTh: string;
}): Promise<number> {
  const row = await db
    .selectFrom("influenza_cases as ic")
    .innerJoin("provinces as p", "p.province_id", "ic.province_id")
    .select(sql<number>`COUNT(*)`.as("patients"))
    .where("p.province_name_th", "=", args.provinceNameTh)
    .where("ic.onset_date_parsed", ">=", args.start)
    .where("ic.onset_date_parsed", "<=", args.end)
    .executeTakeFirst();

  return Number(row?.patients ?? 0);
}

async function top5ByRegionId(args: { start: Date; end: Date; regionId: number }): Promise<Row[]> {
  const rows = await db
    .selectFrom("influenza_cases as ic")
    .innerJoin("provinces as p", "p.province_id", "ic.province_id")
    .select([
      "p.province_name_th as province",
      sql<number>`COUNT(*)`.as("patients"),
    ])
    .where("p.region_id", "=", args.regionId)
    .where("ic.onset_date_parsed", ">=", args.start)
    .where("ic.onset_date_parsed", "<=", args.end)
    .groupBy("p.province_name_th")
    .orderBy("patients", "desc")
    .limit(5)
    .execute();

  return rows.map((r: any, i: number) => ({
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

    // เตรียม “selected” ให้ยัดเข้าไปเสมอ
    const [mainSelectedPatients, compareSelectedPatients] = await Promise.all([
      getPatientsCountByProvince({ start, end, provinceNameTh: mainProvince }),
      getPatientsCountByProvince({ start, end, provinceNameTh: compareProvince }),
    ]);

    const mainSelected = { province: mainProvince, patients: mainSelectedPatients };
    const compareSelected = { province: compareProvince, patients: compareSelectedPatients };

    if (mRegionId == null) {
      // ไม่รู้ภาคของจังหวัดหลัก -> แสดงเท่าที่ทำได้
      mainRows = [
        { province: mainProvince, patients: mainSelectedPatients, rank: 1, isMain: true },
      ];
      compareRows = [];
      note = "ไม่พบ region_id ของจังหวัดหลักในตาราง provinces";
    } else if (sameRegion) {
      const combined = await top5ByRegionId({ start, end, regionId: mRegionId });

      upsertSelected(combined, mainSelected, { isMain: true });
      upsertSelected(combined, compareSelected, { isCompare: true });

      mainRows = ensureLimit5WithSelected(combined, [mainProvince, compareProvince]);
      compareRows = [];
      note = "จังหวัดหลักและจังหวัดที่เปรียบเทียบอยู่ region_id เดียวกัน จะแสดงไม่เกิน 5 จังหวัดและบังคับให้ทั้งสองจังหวัดอยู่ในกราฟเสมอ";
    } else {
      const rowsMain = await top5ByRegionId({ start, end, regionId: mRegionId });
      upsertSelected(rowsMain, mainSelected, { isMain: true });
      mainRows = ensureLimit5WithSelected(rowsMain, [mainProvince]);

      if (cRegionId == null) {
        compareRows = [{ province: compareProvince, patients: compareSelectedPatients, rank: 1, isCompare: true }];
        note = "ไม่พบ region_id ของจังหวัดที่เปรียบเทียบในตาราง provinces";
      } else {
        const rowsCompare = await top5ByRegionId({ start, end, regionId: cRegionId });
        upsertSelected(rowsCompare, compareSelected, { isCompare: true });
        compareRows = ensureLimit5WithSelected(rowsCompare, [compareProvince]);

        // note = "จังหวัดที่เปรียบเทียบอยู่นอกภูมิภาคของจังหวัดหลัก จึงแสดง Top 5 ของแต่ละภูมิภาคแยกกัน และบังคับให้จังหวัดที่เลือกโผล่ในกราฟของภูมิภาคตัวเองเสมอ";
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
      { status: 200, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/region-top5):", e);
    return NextResponse.json<APIResp>(
      { ok: false, sameRegion: false, mainRows: [], compareRows: [], error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
