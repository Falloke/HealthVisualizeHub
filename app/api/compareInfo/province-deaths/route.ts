// D:\HealtRiskHub\app\api\compareInfo\province-deaths\route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely4/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProvinceDeaths = { province: string; deaths: number };
type APIResp = { ok: boolean; main?: ProvinceDeaths; compare?: ProvinceDeaths; error?: string };

// d01_influenza
const D01_TABLE = (process.env.DB_D01_TABLE || "d01_influenza").trim();
const D01_PROVINCE_COL = (process.env.DB_D01_PROVINCE_COL || "province").trim();
const D01_DEATH_COL = (process.env.DB_D01_DEATH_COL || "death_date_parsed").trim();

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

async function queryProvinceDeaths(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<ProvinceDeaths> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  assertIdent(D01_TABLE, "d01 table");
  assertIdent(D01_PROVINCE_COL, "d01 province col");
  assertIdent(D01_DEATH_COL, "d01 death col");

  const row = await (db as any)
    .selectFrom(sql`${sql.ref(D01_TABLE)}`.as("ic"))
    .select(sql<number>`COUNT(*)`.as("deaths"))
    .where(sql`${refCol("ic", D01_PROVINCE_COL)} = ${opts.provinceNameTh}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} IS NOT NULL`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} >= ${start}`)
    .where(sql`${refCol("ic", D01_DEATH_COL)} <= ${end}`)
    .executeTakeFirst();

  return { province: opts.provinceNameTh, deaths: Number((row as any)?.deaths ?? 0) };
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
      mainProvince ? queryProvinceDeaths({ start_date, end_date, provinceNameTh: mainProvince }) : Promise.resolve(undefined),
      compareProvince ? queryProvinceDeaths({ start_date, end_date, provinceNameTh: compareProvince }) : Promise.resolve(undefined),
    ]);

    return NextResponse.json<APIResp>(
      { ok: true, ...(main ? { main } : {}), ...(compare ? { compare } : {}) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-deaths):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
