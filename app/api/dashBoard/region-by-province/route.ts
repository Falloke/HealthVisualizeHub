import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";
import provinces from "@/public/data/Thailand-ProvinceName.json";
import { resolveDiseaseCode } from "@/lib/dashboard/dbExpr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProvinceRegion = {
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH: string;
};

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

function normalizeRegionName(name: string) {
  const s = String(name || "").trim();
  if (!s) return "";
  if (s.includes("กรุงเทพ")) return "กรุงเทพมหานครและปริมณฑล";
  return s;
}

async function resolveRegionIdByName(regionNameTh: string): Promise<string | null> {
  const name = normalizeRegionName(regionNameTh);
  if (!name) return null;

  try {
    const row = await (db as any)
      .selectFrom("regions_moph")
      .select(["region_id", "region_name_th"])
      .where(sql<boolean>`LOWER(TRIM(region_name_th)) = LOWER(TRIM(${name}))`)
      .executeTakeFirst();

    if ((row as any)?.region_id != null) return String((row as any).region_id);
  } catch {
    // ignore
  }
  return null;
}

function buildProvinceRegionMap() {
  const map: Record<string, string> = {};
  (provinces as ProvinceRegion[]).forEach((p) => {
    const prov = String(p.ProvinceNameThai ?? "").trim();
    const reg = normalizeRegionName(String(p.Region_VaccineRollout_MOPH ?? "").trim());
    if (prov) map[prov] = reg || "ไม่ทราบภูมิภาค";
  });
  return map;
}

function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(s);
}

async function resolveFactTable(
  diseaseCode: string
): Promise<{ schema: string; table: string } | null> {
  if (!diseaseCode) return null;

  const row = await (db as any)
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

    const province = String(params.get("province") || "").trim();
    const diseaseParam = pickDisease(params);

    if (!province) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }
    if (!diseaseParam) {
      return NextResponse.json({ error: "ต้องระบุ disease" }, { status: 400 });
    }

    // ✅ กันปัญหา D01 / 01 / 1 ไม่ match
    const diseaseCode = await resolveDiseaseCode(db as any, diseaseParam);
    if (!diseaseCode) {
      return NextResponse.json(
        { region: "", regionId: "", topPatients: [], topDeaths: [] },
        { status: 200 }
      );
    }

    // ✅ resolve fact table จาก disease_fact_tables
    const fact = await resolveFactTable(diseaseCode);
    if (!fact) {
      return NextResponse.json(
        { region: "", regionId: "", topPatients: [], topDeaths: [] },
        { status: 200 }
      );
    }

    // ✅ หา “ภูมิภาคของจังหวัดที่เลือก”
    const provinceRegionMap = buildProvinceRegionMap();
    const regionName = provinceRegionMap[province] || "ไม่ทราบภูมิภาค";
    const regionId = (await resolveRegionIdByName(regionName)) || "";

    // ✅ รายชื่อจังหวัดทั้งหมดในภูมิภาคเดียวกัน
    const provincesInRegion = Object.keys(provinceRegionMap).filter(
      (p) => provinceRegionMap[p] === regionName
    );

    if (provincesInRegion.length === 0) {
      return NextResponse.json(
        {
          region: regionName,
          regionId,
          topPatients: [],
          topDeaths: [],
          selected: {
            province,
            patients: 0,
            patientsRank: undefined,
            region: regionName,
            regionId,
          },
          selectedProvince: {
            province,
            patients: 0,
            rank: 0,
            region: regionName,
            regionId,
          },
        },
        { status: 200 }
      );
    }

    // ✅ Top 5 ผู้ป่วยสะสมในภูมิภาคเดียวกัน
    const topPatientsRows = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<string>`ic.province`.as("province"),
        sql<number>`COUNT(*)::int`.as("patients"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", diseaseCode)
      .where("ic.province", "in", provincesInRegion)
      .groupBy(sql`ic.province`)
      .orderBy(sql`COUNT(*)`, "desc")
      .limit(5)
      .execute();

    // ✅ Top 5 ผู้เสียชีวิตสะสมในภูมิภาคเดียวกัน
    const topDeathsRows = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<string>`ic.province`.as("province"),
        sql<number>`COUNT(*) FILTER (WHERE ic.death_date_parsed IS NOT NULL)::int`.as(
          "deaths"
        ),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", diseaseCode)
      .where("ic.province", "in", provincesInRegion)
      .groupBy(sql`ic.province`)
      .orderBy(sql`COUNT(*) FILTER (WHERE ic.death_date_parsed IS NOT NULL)`, "desc")
      .limit(5)
      .execute();

    // ✅ ผู้ป่วยของจังหวัดที่เลือก
    const selectedRow = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", diseaseCode)
      .where("ic.province", "=", province)
      .executeTakeFirst();

    const selectedPatients = Number((selectedRow as any)?.patients ?? 0);

    // ✅ ดึงทั้งหมดเพื่อหา rank จริง
    const allPatientsInRegion = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<string>`ic.province`.as("province"),
        sql<number>`COUNT(*)::int`.as("patients"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.disease_code", "=", diseaseCode)
      .where("ic.province", "in", provincesInRegion)
      .groupBy(sql`ic.province`)
      .orderBy(sql`COUNT(*)`, "desc")
      .execute();

    let selectedRank = 0;
    for (let i = 0; i < allPatientsInRegion.length; i++) {
      if (String((allPatientsInRegion[i] as any)?.province ?? "").trim() === province) {
        selectedRank = i + 1;
        break;
      }
    }

    const topPatients = topPatientsRows.map((r: any) => ({
      province: String(r.province ?? ""),
      patients: Number(r.patients ?? 0),
      region: regionName,
      regionId,
    }));

    const topDeaths = topDeathsRows.map((r: any) => ({
      province: String(r.province ?? ""),
      deaths: Number(r.deaths ?? 0),
      region: regionName,
      regionId,
    }));

    const selected = {
      province,
      patients: selectedPatients,
      patientsRank: selectedRank || undefined,
      region: regionName,
      regionId,
    };

    const selectedProvince = {
      province,
      patients: selectedPatients,
      rank: selectedRank || 0,
      region: regionName,
      regionId,
    };

    return NextResponse.json(
      {
        region: regionName,
        regionId,
        topPatients,
        topDeaths,
        selected,
        selectedProvince,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ API ERROR (region-by-province):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
