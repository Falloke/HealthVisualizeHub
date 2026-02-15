// D:\HealtRiskHub\app\api\compareInfo\province-patients\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProvinceSummary = { province: string; region?: string | null; patients: number };
type APIResp = { ok: boolean; main?: ProvinceSummary; compare?: ProvinceSummary; error?: string };

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

async function queryProvincePatients(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<ProvinceSummary> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_ONSET_COL, "d01 onset col");

  const row = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select(sql<number>`COUNT(*)`.as("patients"))
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${opts.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_ONSET_COL)} <= ${end}`)
    .executeTakeFirst();

  const region = await getRegionByProvinceName(opts.provinceNameTh);

  return {
    province: opts.provinceNameTh,
    region,
    patients: Number((row as any)?.patients ?? 0),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = (sp.get("start_date") ?? "2024-01-01").trim();
    const end_date = (sp.get("end_date") ?? "2024-12-31").trim();
    const mainProvince = (sp.get("mainProvince") ?? "").trim();
    const compareProvince = (sp.get("compareProvince") ?? "").trim();

    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด" },
        { status: 400 }
      );
    }

    const [main, compare] = await Promise.all([
      mainProvince ? queryProvincePatients({ start_date, end_date, provinceNameTh: mainProvince }) : Promise.resolve(undefined),
      compareProvince ? queryProvincePatients({ start_date, end_date, provinceNameTh: compareProvince }) : Promise.resolve(undefined),
    ]);

    return NextResponse.json<APIResp>(
      { ok: true, ...(main ? { main } : {}), ...(compare ? { compare } : {}) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-patients):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
