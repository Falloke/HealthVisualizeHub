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

// mapping ชื่อคอลัมน์วันเสียชีวิต (กัน schema เปลี่ยน)
const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
// ถ้าคอลัมน์เป็น timestamptz แล้วอยากเทียบเป็น date ให้ตั้ง "date"
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim(); // เช่น "date"

// ✅ กลุ่มอายุ
const ageGroups = [
  { label: "0-4", min: 0, max: 4 },
  { label: "5-9", min: 5, max: 9 },
  { label: "10-14", min: 10, max: 14 },
  { label: "15-19", min: 15, max: 19 },
  { label: "20-24", min: 20, max: 24 },
  { label: "25-44", min: 25, max: 44 },
  { label: "45-59", min: 45, max: 59 },
  { label: "60+", min: 60, max: 200 },
];

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

<<<<<<< HEAD
/** ✅ helper: รองรับ cast วันตาม env */
function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
}

/** ✅ helper: รองรับชื่อ param disease ได้หลายแบบ */
function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

/** ✅ resolve table จาก disease_fact_tables */
async function resolveFactTable(diseaseCode: string) {
  const fallback = { schema: "public", table: "d01_influenza" };

  if (!diseaseCode) return fallback;

  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active"])
    .where("disease_code", "=", diseaseCode)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  const ok = (s: string) => /^[a-z0-9_]+$/i.test(s);

  if (!schema || !table || !ok(schema) || !ok(table)) return fallback;

  return { schema, table };
=======
/**
 * ✅ ใช้ ref.provinces_moph แทน provinces
 * - รับ province ได้ทั้งเลข (province_no) หรือชื่อไทย (province_name_th)
 */
async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const found = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  const found = await db
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

    const startDate = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const provinceName = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    if (!provinceName) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

<<<<<<< HEAD
    // ✅ ถ้าไม่มีโรค -> คืน 0 ทุกช่วงอายุ (เพื่อไม่ให้กราฟพัง/ค้าง)
    if (!diseaseCode) {
      const empty = ageGroups.map((g) => ({ ageRange: g.label, deaths: 0 }));
      return NextResponse.json(empty, { status: 200 });
    }

    const { schema, table } = await resolveFactTable(diseaseCode);

    // ✅ date expression (รองรับ cast)
    const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

    // ✅ Query นับผู้เสียชีวิตรายอายุ
    const rows = await (db as any)
      .withSchema(schema)
      .selectFrom(`${table} as ic` as any)
      .select([
        sql<number>`COUNT(*)::int`.as("deaths"),
        sql<number>`ic.age_y`.as("age_y"),
      ])
      .where("ic.province", "=", provinceName)
      .where("ic.disease_code", "=", diseaseCode)
      .where(sql<boolean>`${deathDate} IS NOT NULL`)
      .where(deathDate, ">=", startDate)
      .where(deathDate, "<=", endDate)
      .where("ic.age_y", "is not", null)
      .groupBy(sql`ic.age_y`)
=======
    const provinceName = await resolveProvinceName(province);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    // 📍 method_f/g: ผู้เสียชีวิตของจังหวัดนั้น (นับจาก death_date_parsed)
    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(ic.death_date_parsed)`.as("deaths"), "ic.age_y as age_y"])
      .where("ic.province", "=", provinceName)
      .where("ic.death_date_parsed", "is not", null)
      .where("ic.death_date_parsed", ">=", startDate)
      .where("ic.death_date_parsed", "<=", endDate)
      .where("ic.age_y", "is not", null)
      .groupBy("ic.age_y")
>>>>>>> feature/Method_F&Method_G
      .execute();

    const grouped: Record<string, number> = {};
    for (const g of ageGroups) grouped[g.label] = 0;

<<<<<<< HEAD
    for (const row of rows as any[]) {
      const age = Number(row.age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number(row.deaths || 0);
=======
    for (const row of rows) {
      const age = Number((row as any).age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number((row as any).deaths ?? 0);
>>>>>>> feature/Method_F&Method_G
    }

    // ✅ คืนผลเรียงตาม ageGroups เสมอ
    const result = ageGroups.map((g) => ({
      ageRange: g.label,
      deaths: grouped[g.label] ?? 0,
    }));

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (age-group-deaths):", error);
<<<<<<< HEAD
    return NextResponse.json([], {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
=======
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
>>>>>>> feature/Method_F&Method_G
  }
}
