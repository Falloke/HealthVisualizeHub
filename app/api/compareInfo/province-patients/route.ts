// D:\HealtRiskHub\app\api\compareInfo\province-patients\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
<<<<<<< HEAD
import db from "@/lib/kysely/db";
=======
import db from "@/lib/kysely4/db";
>>>>>>> feature/Method_F&Method_G

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProvinceSummary = {
  province: string;
  region?: string | null;
  patients: number;
};

<<<<<<< HEAD
type APIResp = {
  ok: boolean;
  main?: ProvinceSummary;
  compare?: ProvinceSummary;
  error?: string;
};

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

  // ✅ ไม่เจอใน diseases ก็คืน raw (กันพัง)
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

// ----------------------
// ✅ Main query
// ----------------------
=======
// ref.provinces_moph
const REF_SCHEMA = (process.env.DB_REF_SCHEMA || "ref").trim();
const REF_PROVINCES_TABLE = (process.env.DB_REF_PROVINCES_TABLE || "provinces_moph").trim();
const REF_PROVINCE_NAME_COL = (process.env.DB_REF_PROVINCE_NAME_COL || "province_name_th").trim();
const REF_REGION_COL = (process.env.DB_REF_REGION_COL || "region_id").trim(); // ถ้าใน DB ชื่อไม่ใช่ region_id ให้ตั้ง env

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

async function getRegionByProvinceName(provinceNameTh: string): Promise<string | null> {
  assertIdent(REF_SCHEMA, "ref schema");
  assertIdent(REF_PROVINCES_TABLE, "ref table");
  assertIdent(REF_PROVINCE_NAME_COL, "ref province name col");
  assertIdent(REF_REGION_COL, "ref region col");

  const refTable = sql`${sql.ref(`${REF_SCHEMA}.${REF_PROVINCES_TABLE}`)}`;

  const row = await (db as any)
    .selectFrom(refTable.as("p"))
    .select(sql<any>`${refCol("p", REF_REGION_COL)}`.as("region"))
    .where(sql`${refCol("p", REF_PROVINCE_NAME_COL)} = ${provinceNameTh}`)
    .executeTakeFirst();

  const region = (row as any)?.region;
  return region != null ? String(region) : null;
}

>>>>>>> feature/Method_F&Method_G
async function queryProvincePatients(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<ProvinceSummary> {
  const startYMD = parseYMDOrFallback(opts.start_date, "2024-01-01");
  const endYMD = parseYMDOrFallback(opts.end_date, "2024-12-31");

<<<<<<< HEAD
  const startDate = ymdToUTCStart(startYMD);
  const endDate = ymdToUTCEnd(endYMD);

  const fact = await resolveFactTableByDisease(opts.disease);
  if (!fact) return { province: opts.provinceNameTh, region: null, patients: 0 };

  const resolved = await resolveDiseaseCode(opts.disease);
  if (!resolved) return { province: opts.provinceNameTh, region: null, patients: 0 };

  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0)
    return { province: opts.provinceNameTh, region: null, patients: 0 };

  const row = await (db as any)
    .selectFrom(`${fq(fact.schema, fact.table)} as ic` as any)
    .select(sql<number>`COUNT(*)::int`.as("patients"))
    .where("ic.province", "=", opts.provinceNameTh)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where("ic.onset_date_parsed", ">=", startDate)
    .where("ic.onset_date_parsed", "<=", endDate)
=======
  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_ONSET_COL, "d01 onset col");

  const row = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select(sql<number>`COUNT(*)`.as("patients"))
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${opts.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} <= ${end}`)
>>>>>>> feature/Method_F&Method_G
    .executeTakeFirst();

  const region = await getRegionByProvinceName(opts.provinceNameTh);

  return {
    province: opts.provinceNameTh,
<<<<<<< HEAD
    region: null, // ✅ schema ใหม่ไม่เก็บ region
=======
    region,
>>>>>>> feature/Method_F&Method_G
    patients: Number((row as any)?.patients ?? 0),
  };
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

    if (!disease) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ disease" },
        { status: 400 }
      );
    }
=======
    const start_date = (sp.get("start_date") ?? "2024-01-01").trim();
    const end_date = (sp.get("end_date") ?? "2024-12-31").trim();
    const mainProvince = (sp.get("mainProvince") ?? "").trim();
    const compareProvince = (sp.get("compareProvince") ?? "").trim();
>>>>>>> feature/Method_F&Method_G

    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด" },
        { status: 400 }
      );
    }

    const [main, compare] = await Promise.all([
      mainProvince
        ? queryProvincePatients({ start_date, end_date, provinceNameTh: mainProvince, disease })
        : Promise.resolve(undefined),
      compareProvince
        ? queryProvincePatients({
            start_date,
            end_date,
            provinceNameTh: compareProvince,
            disease,
          })
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json<APIResp>(
      { ok: true, ...(main ? { main } : {}), ...(compare ? { compare } : {}) },
<<<<<<< HEAD
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
=======
      { status: 200, headers: { "Cache-Control": "no-store" } }
>>>>>>> feature/Method_F&Method_G
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-patients):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
