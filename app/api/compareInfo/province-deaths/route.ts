// app/api/compareInfo/province-deaths/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export const runtime = "nodejs";

type ProvinceDeaths = { province: string; deaths: number };
type APIResp = { ok: boolean; main?: ProvinceDeaths; compare?: ProvinceDeaths; error?: string };

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

async function queryProvinceDeaths(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<ProvinceDeaths> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  const row = await db
    .selectFrom("influenza_cases as ic")
    .innerJoin("provinces as p", "p.province_id", "ic.province_id")
    .select(sql<number>`COUNT(*)`.as("deaths"))
    .where("p.province_name_th", "=", opts.provinceNameTh)
    .where("ic.death_date_parsed", "is not", null)
    .where("ic.death_date_parsed", ">=", start)
    .where("ic.death_date_parsed", "<=", end)
    .executeTakeFirst();

  return { province: opts.provinceNameTh, deaths: Number(row?.deaths ?? 0) };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

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
      { status: 200, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-deaths):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
