import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const patientsRow = await db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([sql<number>`COUNT(*)::int`.as("patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", province)
      .where("ic.disease_code", "=", disease)
      .executeTakeFirst();

    // ☠️ ผู้เสียชีวิตในช่วงวันที่
    const deathsRow = await db
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
      .executeTakeFirst();

    return NextResponse.json(
      {
        province,
        regionId: null,
        patients: Number((patientsRow as any)?.patients ?? 0),
        deaths: Number((deathsRow as any)?.deaths ?? 0),
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (province-summary):", err);
    return NextResponse.json(
      { province: "", regionId: null, patients: 0, deaths: 0 },
      { status: 200 }
    );
  }
}
