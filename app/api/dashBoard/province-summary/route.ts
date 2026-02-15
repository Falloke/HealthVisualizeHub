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

// ----------------------
// ✅ Helpers (YMD + UTC)
// ----------------------
function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

<<<<<<< HEAD
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
type RefProvince = {
  province_no: number;
  province_name_th: string;
  region_id: number | null;
  region_moph: string;
};

async function resolveProvince(provinceParam: string): Promise<RefProvince | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  // เลข -> province_no
  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_no"),
        sql<string>`p.province_name_th`.as("province_name_th"),
        sql<number | null>`p.region_id`.as("region_id"),
        sql<string>`p.region_moph`.as("region_moph"),
      ])
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (row ?? null) as any;
  }

  // ชื่อ -> province_name_th
  const row = await db
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select([
      sql<number>`p.province_no`.as("province_no"),
      sql<string>`p.province_name_th`.as("province_name_th"),
      sql<number | null>`p.region_id`.as("region_id"),
      sql<string>`p.region_moph`.as("region_moph"),
    ])
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (row ?? null) as any;
>>>>>>> feature/Method_F&Method_G
}

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(p.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(p.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const province = (p.get("province") || "").trim();
    const disease = pickDisease(p);

    // ✅ ถ้าไม่มีจังหวัด -> คืนค่า 0 (กันกราฟพัง)
    if (!province) {
      return NextResponse.json(
        { province: "", regionId: null, patients: 0, deaths: 0 },
        { status: 200 }
      );
    }

<<<<<<< HEAD
    // ✅ ถ้าไม่ส่งโรคมา -> คืนค่า 0 (กัน sidebar ยังไม่เลือก)
    if (!disease) {
      return NextResponse.json(
        { province, regionId: null, patients: 0, deaths: 0 },
        { status: 200 }
      );
    }

    // ✅ resolve table จาก disease_fact_tables
    const fact = await resolveFactTable(disease);
    if (!fact) {
      return NextResponse.json(
        { province, regionId: null, patients: 0, deaths: 0 },
        { status: 200 }
      );
    }

    // 🧮 ผู้ป่วยในช่วงวันที่
    const patientsRow = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", province)
      .where("ic.disease_code", "=", disease)
      .executeTakeFirst();

    // ☠️ ผู้เสียชีวิตในช่วงวันที่
    const deathsRow = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<number>`COUNT(*) FILTER (WHERE ic.death_date_parsed IS NOT NULL)::int`.as(
          "deaths"
        ),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", province)
      .where("ic.disease_code", "=", disease)
=======
    const prov = await resolveProvince(province);
    if (!prov) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const patientsRow = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(*)`.as("patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", prov.province_name_th)
      .executeTakeFirst();

    const deathsRow = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(ic.death_date_parsed)`.as("deaths")])
      .where("ic.death_date_parsed", "is not", null)
      .where("ic.death_date_parsed", ">=", startDate)
      .where("ic.death_date_parsed", "<=", endDate)
      .where("ic.province", "=", prov.province_name_th)
>>>>>>> feature/Method_F&Method_G
      .executeTakeFirst();

    return NextResponse.json(
      {
<<<<<<< HEAD
        province,
        regionId: null,
=======
        province: prov.province_name_th,
        regionId: prov.region_id ?? null,
>>>>>>> feature/Method_F&Method_G
        patients: Number((patientsRow as any)?.patients ?? 0),
        deaths: Number((deathsRow as any)?.deaths ?? 0),
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (province-summary):", err);
<<<<<<< HEAD
    return NextResponse.json(
      { province: "", regionId: null, patients: 0, deaths: 0 },
      { status: 200 }
    );
=======
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
>>>>>>> feature/Method_F&Method_G
  }
}
