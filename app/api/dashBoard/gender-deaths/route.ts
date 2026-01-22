import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim(); // เช่น "date"

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

// ✅ แปลง YMD เป็น Date แบบ UTC (กัน timezone shift)
function ymdToUTCStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}
function ymdToUTCEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`);
}

function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
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

/** ✅ resolve table จาก disease_fact_tables */
async function resolveFactTable(diseaseCode: string): Promise<{ schema: string; table: string } | null> {
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

    // ✅ ถ้าคอลัมน์วันเสียชีวิตเป็น timestamptz -> ใช้ Date
    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const provinceName = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    // ✅ ยังไม่เลือกจังหวัด -> คืน 0
    if (!provinceName) {
      return NextResponse.json(
        [
          { gender: "ชาย", value: 0 },
          { gender: "หญิง", value: 0 },
        ],
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ ยังไม่เลือกโรค -> คืน 0
    if (!diseaseCode) {
      return NextResponse.json(
        [
          { gender: "ชาย", value: 0 },
          { gender: "หญิง", value: 0 },
        ],
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ resolve fact table
    const fact = await resolveFactTable(diseaseCode);
    if (!fact) {
      return NextResponse.json(
        [
          { gender: "ชาย", value: 0 },
          { gender: "หญิง", value: 0 },
        ],
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

    // ✅ ถ้า cast เป็น date ให้เทียบ string ชัวร์สุด
    const compareStart = DEATH_DATE_CAST ? startYMD : startDate;
    const compareEnd = DEATH_DATE_CAST ? endYMD : endDate;

    const rows = await db
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<string>`ic.gender`.as("gender"),
        sql<number>`COUNT(*)::int`.as("deaths"),
      ])
      .where("ic.province", "=", provinceName)
      .where("ic.disease_code", "=", diseaseCode)
      .where(sql<boolean>`${deathDate} IS NOT NULL`)
      .where(deathDate, ">=", compareStart as any)
      .where(deathDate, "<=", compareEnd as any)
      .groupBy(sql`ic.gender`)
      .execute();

    let male = 0;
    let female = 0;

    for (const r of rows as any[]) {
      const g = String(r.gender ?? "").trim().toLowerCase();
      if (g === "m" || g === "male" || g === "ชาย") male += Number(r.deaths || 0);
      else if (g === "f" || g === "female" || g === "หญิง") female += Number(r.deaths || 0);
    }

    return NextResponse.json(
      [
        { gender: "ชาย", value: male },
        { gender: "หญิง", value: female },
      ],
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (gender-deaths):", err);
    return NextResponse.json(
      [
        { gender: "ชาย", value: 0 },
        { gender: "หญิง", value: 0 },
      ],
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
