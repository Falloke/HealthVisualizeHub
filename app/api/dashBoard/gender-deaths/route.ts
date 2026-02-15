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

const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim(); // เช่น "date"

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

<<<<<<< HEAD
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
async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const found = await (db as any)
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  const found = await (db as any)
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select(sql<string>`p.province_name_th`.as("province_name_th"))
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (found?.province_name_th ?? "").trim() || null;
>>>>>>> feature/Method_F&Method_G
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

<<<<<<< HEAD
    // ✅ ถ้าคอลัมน์วันเสียชีวิตเป็น timestamptz -> ใช้ Date
    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const provinceName = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    // ✅ ยังไม่เลือกจังหวัด -> คืน 0
    if (!provinceName || !diseaseCode) {
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

    const rows = await (db as any)
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
=======
    const provinceName = await resolveProvinceName(province);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select(["ic.gender as gender", sql<number>`COUNT(ic.death_date_parsed)`.as("deaths")])
      .where("ic.province", "=", provinceName)
      .where("ic.death_date_parsed", "is not", null)
      .where("ic.death_date_parsed", ">=", startDate)
      .where("ic.death_date_parsed", "<=", endDate)
      .groupBy("ic.gender")
>>>>>>> feature/Method_F&Method_G
      .execute();

    let male = 0;
    let female = 0;

<<<<<<< HEAD
    for (const r of rows as any[]) {
      const g = String(r.gender ?? "").trim().toLowerCase();
      if (g === "m" || g === "male" || g === "ชาย")
        male += Number(r.deaths || 0);
      else if (g === "f" || g === "female" || g === "หญิง")
        female += Number(r.deaths || 0);
=======
    for (const r of rows) {
      const g = String((r as any).gender ?? "").trim();
      if (g === "M" || g === "ชาย") male += Number((r as any).deaths ?? 0);
      else if (g === "F" || g === "หญิง") female += Number((r as any).deaths ?? 0);
>>>>>>> feature/Method_F&Method_G
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
<<<<<<< HEAD
    return NextResponse.json(
      [
        { gender: "ชาย", value: 0 },
        { gender: "หญิง", value: 0 },
      ],
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
=======
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
>>>>>>> feature/Method_F&Method_G
  }
}
