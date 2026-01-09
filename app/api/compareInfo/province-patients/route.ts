// app/api/compareInfo/province-patients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export const runtime = "nodejs";

type ProvinceSummary = { province: string; region?: string | null; patients: number };
type APIResp = { ok: boolean; main?: ProvinceSummary; compare?: ProvinceSummary; error?: string };

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

async function queryProvincePatients(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<ProvinceSummary> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  const row = await db
    .selectFrom("provinces as p")
    .leftJoin("influenza_cases as ic", (join) =>
      join
        .onRef("ic.province_id", "=", "p.province_id")
        .on("ic.onset_date_parsed", ">=", start)
        .on("ic.onset_date_parsed", "<=", end)
    )
    .select([
      "p.province_name_th as province",
      "p.region_id as region_id",
      sql<number>`COUNT(ic.id)`.as("patients"),
    ])
    .where("p.province_name_th", "=", opts.provinceNameTh)
    .groupBy(["p.province_name_th", "p.region_id"])
    .executeTakeFirst();

  return {
    province: opts.provinceNameTh,
    // ตอนนี้ schema มีแค่ region_id ยังไม่มีตารางชื่อภาค
    region: row?.region_id != null ? String(row.region_id) : null,
    patients: Number(row?.patients ?? 0),
  };
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
      mainProvince ? queryProvincePatients({ start_date, end_date, provinceNameTh: mainProvince }) : Promise.resolve(undefined),
      compareProvince ? queryProvincePatients({ start_date, end_date, provinceNameTh: compareProvince }) : Promise.resolve(undefined),
    ]);

    return NextResponse.json<APIResp>(
      { ok: true, ...(main ? { main } : {}), ...(compare ? { compare } : {}) },
      { status: 200, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/province-patients):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
