// app/api/compareInfo/region-top5/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  province: string;
  patients: number;
  rank?: number;
  isMain?: boolean;
  isCompare?: boolean;
};

type APIResp = {
  ok: boolean;
  sameRegion: boolean;
  mainRows: Row[];
  compareRows: Row[];
  note?: string;
  error?: string;
};

// ✅ จังหวัดอยู่ใน schema ref
const PROVINCES_SCHEMA = "ref";
const PROVINCES_TABLE = "provinces_moph";

// ----------------------
// ✅ Helpers (YMD + UTC)
// ----------------------
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

function normalizeProvinceName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\(อันดับ\s*\d+\)\s*$/u, "").trim();
}

function sortByPatientsDesc(rows: Row[]): Row[] {
  rows.sort((a, b) => Number(b.patients ?? 0) - Number(a.patients ?? 0));
  return rows;
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
    if (important.has(norm) && !selectedRows.some((r) => normalizeProvinceName(r.province) === norm)) {
      selectedRows.push(row);
    } else {
      otherRows.push(row);
    }
  }

  if (selectedRows.length >= LIMIT) return sortByPatientsDesc(selectedRows).slice(0, LIMIT);

  const needOthers = LIMIT - selectedRows.length;
  const result = [...selectedRows, ...otherRows.slice(0, needOthers)];
  return sortByPatientsDesc(result);
}

// ----------------------
// ✅ Disease helpers
// ----------------------
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

// ----------------------
// ✅ Fact table resolver
// ----------------------
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

function fq(schema: string, table: string) {
  return `${schema}.${table}`;
}

// ------------------------- DB Helpers -------------------------

async function getRegionIdByProvinceName(provinceNameTh: string): Promise<number | null> {
  try {
    const row = await db
      .selectFrom(`${fq(PROVINCES_SCHEMA, PROVINCES_TABLE)} as p` as any)
      .select(["region_id"])
      .where("province_name_th", "=", provinceNameTh)
      .executeTakeFirst();

    const regionId = (row as any)?.region_id;
    return regionId == null ? null : Number(regionId);
  } catch {
    return null;
  }
}

async function getPatientsCountByProvince(args: {
  fact: { schema: string; table: string };
  start: Date;
  end: Date;
  provinceNameTh: string;
  disease: string;
}): Promise<number> {
  const resolved = await resolveDiseaseCode(args.disease);
  if (!resolved) return 0;

  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0) return 0;

  const FACT = fq(args.fact.schema, args.fact.table);
  const PROV = fq(PROVINCES_SCHEMA, PROVINCES_TABLE);

  // A) join province_id
  try {
    const row = await (db as any)
      .selectFrom(`${FACT} as ic` as any)
      .innerJoin(`${PROV} as p` as any, "p.province_id", "ic.province_id")
      .select(sql<number>`COUNT(*)::int`.as("patients"))
      .where("p.province_name_th", "=", args.provinceNameTh)
      .where("ic.disease_code", "in", diseaseIn as any)
      .where("ic.onset_date_parsed", ">=", args.start)
      .where("ic.onset_date_parsed", "<=", args.end)
      .executeTakeFirst();

    return Number((row as any)?.patients ?? 0);
  } catch {}

  // B) fallback: ic.province
  try {
    const row = await (db as any)
      .selectFrom(`${FACT} as ic` as any)
      .select(sql<number>`COUNT(*)::int`.as("patients"))
      .where("ic.province", "=", args.provinceNameTh as any)
      .where("ic.disease_code", "in", diseaseIn as any)
      .where("ic.onset_date_parsed", ">=", args.start)
      .where("ic.onset_date_parsed", "<=", args.end)
      .executeTakeFirst();

    return Number((row as any)?.patients ?? 0);
  } catch {}

  // C) fallback: ic.province_name_th
  const row = await (db as any)
    .selectFrom(`${FACT} as ic` as any)
    .select(sql<number>`COUNT(*)::int`.as("patients"))
    .where("ic.province_name_th", "=", args.provinceNameTh as any)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where("ic.onset_date_parsed", ">=", args.start)
    .where("ic.onset_date_parsed", "<=", args.end)
    .executeTakeFirst();

  return Number((row as any)?.patients ?? 0);
}

async function top5ByRegionId(args: {
  fact: { schema: string; table: string };
  start: Date;
  end: Date;
  regionId: number;
  disease: string;
}): Promise<Row[]> {
  const resolved = await resolveDiseaseCode(args.disease);
  if (!resolved) return [];

  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0) return [];

  const FACT = fq(args.fact.schema, args.fact.table);
  const PROV = fq(PROVINCES_SCHEMA, PROVINCES_TABLE);

  // A) join province_id
  try {
    const rows = await (db as any)
      .selectFrom(`${FACT} as ic` as any)
      .innerJoin(`${PROV} as p` as any, "p.province_id", "ic.province_id")
      .select([
        "p.province_name_th as province",
        sql<number>`COUNT(*)::int`.as("patients"),
      ])
      .where("p.region_id", "=", args.regionId)
      .where("ic.disease_code", "in", diseaseIn as any)
      .where("ic.onset_date_parsed", ">=", args.start)
      .where("ic.onset_date_parsed", "<=", args.end)
      .groupBy("p.province_name_th")
      .orderBy("patients", "desc")
      .limit(5)
      .execute();

    return (rows as any[]).map((r, i) => ({
      province: String(r.province),
      patients: Number(r.patients ?? 0),
      rank: i + 1,
    }));
  } catch {}

  // B) fallback join ด้วยชื่อจังหวัด
  const rows = await (db as any)
    .selectFrom(`${FACT} as ic` as any)
    .innerJoin(`${PROV} as p` as any, (join: any) =>
      join.on(sql`p.province_name_th = ic.province`)
    )
    .select([
      "p.province_name_th as province",
      sql<number>`COUNT(*)::int`.as("patients"),
    ])
    .where("p.region_id", "=", args.regionId)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where("ic.onset_date_parsed", ">=", args.start)
    .where("ic.onset_date_parsed", "<=", args.end)
    .groupBy("p.province_name_th")
    .orderBy("patients", "desc")
    .limit(5)
    .execute();

  return (rows as any[]).map((r, i) => ({
    province: String(r.province),
    patients: Number(r.patients ?? 0),
    rank: i + 1,
  }));
}

// ------------------------- Handler -------------------------

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const disease = (sp.get("disease") || sp.get("diseaseCode") || "").trim();
    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = (sp.get("mainProvince") ?? "").trim();
    const compareProvince = (sp.get("compareProvince") ?? "").trim();

    if (!mainProvince || !compareProvince || !disease) {
      return NextResponse.json<APIResp>(
        {
          ok: false,
          sameRegion: false,
          mainRows: [],
          compareRows: [],
          error: "ต้องระบุ mainProvince, compareProvince และ disease ให้ครบ",
        },
        { status: 400 }
      );
    }

    const startYMD = parseYMDOrFallback(start_date, "2024-01-01");
    const endYMD = parseYMDOrFallback(end_date, "2024-12-31");
    const start = ymdToUTCStart(startYMD);
    const end = ymdToUTCEnd(endYMD);

    const fact = await resolveFactTableByDisease(disease);
    if (!fact) {
      return NextResponse.json<APIResp>(
        {
          ok: true,
          sameRegion: false,
          mainRows: [],
          compareRows: [],
          note: "ไม่พบ fact table ของโรคนี้ใน public.disease_fact_tables (หรือยังไม่ได้เปิดใช้งาน is_active=true)",
        },
        { status: 200 }
      );
    }

    const [mRegionId, cRegionId] = await Promise.all([
      getRegionIdByProvinceName(mainProvince),
      getRegionIdByProvinceName(compareProvince),
    ]);

    const sameRegion = mRegionId != null && cRegionId != null && mRegionId === cRegionId;

    let mainRows: Row[] = [];
    let compareRows: Row[] = [];
    let note = "";

    const [mainSelectedPatients, compareSelectedPatients] = await Promise.all([
      getPatientsCountByProvince({ fact, start, end, provinceNameTh: mainProvince, disease }),
      getPatientsCountByProvince({ fact, start, end, provinceNameTh: compareProvince, disease }),
    ]);

    const mainSelected = { province: mainProvince, patients: mainSelectedPatients };
    const compareSelected = { province: compareProvince, patients: compareSelectedPatients };

    if (mRegionId == null) {
      mainRows = [{ province: mainProvince, patients: mainSelectedPatients, rank: 1, isMain: true }];
      compareRows = [];
      note = "ไม่พบ region_id ของจังหวัดหลักในตาราง ref.provinces_moph";
    } else if (sameRegion) {
      const combined = await top5ByRegionId({ fact, start, end, regionId: mRegionId, disease });
      upsertSelected(combined, mainSelected, { isMain: true });
      upsertSelected(combined, compareSelected, { isCompare: true });

      mainRows = ensureLimit5WithSelected(combined, [mainProvince, compareProvince]);
      compareRows = [];

      note = "จังหวัดหลักและจังหวัดที่เปรียบเทียบอยู่ภูมิภาคเดียวกัน (API จะรวมเป็นกราฟเดียว)";
    } else {
      const rowsMain = await top5ByRegionId({ fact, start, end, regionId: mRegionId, disease });
      upsertSelected(rowsMain, mainSelected, { isMain: true });
      mainRows = ensureLimit5WithSelected(rowsMain, [mainProvince]);

      if (cRegionId == null) {
        compareRows = [
          { province: compareProvince, patients: compareSelectedPatients, rank: 1, isCompare: true },
        ];
        note = "ไม่พบ region_id ของจังหวัดที่เปรียบเทียบในตาราง ref.provinces_moph";
      } else {
        const rowsCompare = await top5ByRegionId({ fact, start, end, regionId: cRegionId, disease });
        upsertSelected(rowsCompare, compareSelected, { isCompare: true });
        compareRows = ensureLimit5WithSelected(rowsCompare, [compareProvince]);
      }
    }

    return NextResponse.json<APIResp>(
      { ok: true, sameRegion, mainRows, compareRows, note },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
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
