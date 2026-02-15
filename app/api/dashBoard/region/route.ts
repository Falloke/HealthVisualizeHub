import { NextRequest, NextResponse } from "next/server";
<<<<<<< HEAD
import db from "@/lib/kysely/db";
=======
import db from "@/lib/kysely4/db";
>>>>>>> feature/Method_F&Method_G
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

<<<<<<< HEAD
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
=======
type RegionRow = {
  region: string;
  patients: number;
  deaths: number;
};

function parseDateOrFallback(input: string | null, fallback: string): Date {
  const raw = (input ?? "").trim() || fallback;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return new Date(fallback);
  return d;
>>>>>>> feature/Method_F&Method_G
}

function assertIdent(name: string, label: string): string {
  const v = (name ?? "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) {
    throw new Error(`invalid ${label}: ${name}`);
  }
  return v;
}

/**
 * หมายเหตุ
 * - endpoint นี้ทำกราฟรายภูมิภาคของ "ทั้งประเทศ" ในช่วงวันที่เลือก
 * - ถ้าต้องการกรองเฉพาะจังหวัด ให้ไปทำ endpoint แยก
 * - ที่นี่จงใจ "ไม่กรอง province" เพื่อให้ได้ครบทุกภูมิภาคสำหรับ GraphByProvince
 */
export async function GET(request: NextRequest) {
  try {
<<<<<<< HEAD
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
    const rows = await (db as any)
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
=======
    const sp = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(sp.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(sp.get("end_date"), "2024-12-31");

    // รองรับ table จาก env เช่น method_f.d01_influenza หรือ d01_influenza
    const rawTable = (process.env.DB_D01_TABLE || "d01_influenza").trim();
    const refSchema = assertIdent(process.env.DB_REF_SCHEMA || "ref", "ref schema");
    const refTable = assertIdent(
      process.env.DB_REF_PROVINCES_TABLE || "provinces_moph",
      "ref provinces table"
    );
    const provinceCol = assertIdent(process.env.DB_D01_PROVINCE_COL || "province", "province col");
    const onsetCol = assertIdent(
      process.env.DB_D01_ONSET_COL || "onset_date_parsed",
      "onset col"
    );
    const deathCol = assertIdent(
      process.env.DB_DEATH_DATE_COL || "death_date_parsed",
      "death col"
    );

    // แยก schema.table
    const d01Parts = rawTable.split(".").map((s) => s.trim()).filter(Boolean);
    const d01Table =
      d01Parts.length === 2
        ? sql`${sql.ref(`${assertIdent(d01Parts[0], "d01 schema")}.${assertIdent(d01Parts[1], "d01 table")}`)}`
        : sql`${sql.ref(assertIdent(d01Parts[0], "d01 table"))}`;

    const pTable = sql`${sql.ref(`${refSchema}.${refTable}`)}`;

    const rows = await (db as any)
      .selectFrom(d01Table.as("ic"))
      .innerJoin(pTable.as("p"), (join: any) =>
        join.onRef(`ic.${provinceCol}` as any, "=", "p.province_name_th")
      )
      .select([
        sql<string>`COALESCE(p.region_moph, 'ไม่ระบุภูมิภาค')`.as("region"),
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`
          SUM(
            CASE WHEN ${sql.ref(`ic.${deathCol}`)} IS NOT NULL THEN 1 ELSE 0 END
          )
        `.as("deaths"),
      ])
      .where(sql.ref(`ic.${onsetCol}`), ">=", startDate)
      .where(sql.ref(`ic.${onsetCol}`), "<=", endDate)
      .groupBy(sql`COALESCE(p.region_moph, 'ไม่ระบุภูมิภาค')`)
      .orderBy(sql`COALESCE(p.region_moph, 'ไม่ระบุภูมิภาค')`)
      .execute();

    const data: RegionRow[] = (rows as Array<any>).map((r) => ({
      region: String(r?.region ?? "").trim(),
      patients: Number(r?.patients ?? 0),
      deaths: Number(r?.deaths ?? 0),
>>>>>>> feature/Method_F&Method_G
    }));

    return NextResponse.json(data, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
<<<<<<< HEAD
  } catch (error) {
    console.error("❌ API ERROR (region):", error);
    return NextResponse.json([], { status: 200 });
=======
  } catch (err: unknown) {
    console.error("api error /api/dashBoard/region", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "internal server error" },
      { status: 500 }
    );
>>>>>>> feature/Method_F&Method_G
  }
}
