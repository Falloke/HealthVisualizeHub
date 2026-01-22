import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";
import provinces from "@/public/data/Thailand-ProvinceName.json";

type ProvinceRegion = {
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH: string;
};

export const runtime = "nodejs";

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

function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(s);
}

async function resolveFactTable(
  diseaseCode: string
): Promise<{ schema: string; table: string } | null> {
  if (!diseaseCode) return null;

  const row = await db
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active"])
    .where("disease_code", "=", diseaseCode)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  if (!schema || !table) return null;
  if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

  return { schema, table };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const disease = pickDisease(params);

    // ✅ ถ้าไม่ส่งโรคมา -> คืน [] (กันหน้าแตก)
    if (!disease) {
      return NextResponse.json([], { status: 200 });
    }

    const fact = await resolveFactTable(disease);
    if (!fact) {
      return NextResponse.json([], { status: 200 });
    }

    // ✅ ผู้ป่วย + ผู้เสียชีวิต grouped by จังหวัด
    const rows = await db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<string>`ic.province`.as("province"),
        sql<number>`COUNT(*)::int`.as("patients"),
        sql<number>`COUNT(*) FILTER (WHERE ic.death_date_parsed IS NOT NULL)::int`.as(
          "deaths"
        ),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", disease)
      .where("ic.province", "is not", null)
      .groupBy(sql`ic.province`)
      .execute();

    // 🗺️ Mapping จังหวัด → ภูมิภาค
    const provinceRegionMap: Record<string, string> = {};
    (provinces as ProvinceRegion[]).forEach((p) => {
      provinceRegionMap[String(p.ProvinceNameThai || "").trim()] =
        String(p.Region_VaccineRollout_MOPH || "").trim();
    });

    // 🔄 Group by region
    const regionData: Record<string, { patients: number; deaths: number }> = {};

    for (const r of rows as any[]) {
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
    return NextResponse.json([], { status: 200 });
  }
}
