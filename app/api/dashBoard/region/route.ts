import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";
import provinces from "@/public/data/Thailand-ProvinceName.json";

type ProvinceRegion = {
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH: string;
};

export const runtime = "nodejs";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-09-09");

    // 🩺 Query: ผู้ป่วย + ผู้เสียชีวิต grouped by province_id
    const rows = await db
      .selectFrom("influenza_cases as ic")
      .innerJoin("provinces as p", "p.province_id", "ic.province_id")
      .select([
        "p.province_name_th as province",
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`COUNT(ic.death_date_parsed)`.as("deaths"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .groupBy("p.province_name_th")
      .execute();

    // 🗺️ Mapping จังหวัด → ภูมิภาค
    const provinceRegionMap: Record<string, string> = {};
    (provinces as ProvinceRegion[]).forEach((p) => {
      provinceRegionMap[p.ProvinceNameThai] = p.Region_VaccineRollout_MOPH;
    });

    // 🔄 Group by region
    const regionData: Record<string, { patients: number; deaths: number }> = {};
    for (const r of rows) {
      const provName = String(r.province || "").trim();
      const region = provinceRegionMap[provName] || "ไม่ทราบภูมิภาค";

      if (!regionData[region]) regionData[region] = { patients: 0, deaths: 0 };
      regionData[region].patients += Number(r.patients ?? 0);
      regionData[region].deaths += Number(r.deaths ?? 0);
    }

    const result = Object.keys(regionData).map((region) => ({
      region,
      patients: regionData[region].patients,
      deaths: regionData[region].deaths,
    }));

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (region):", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
