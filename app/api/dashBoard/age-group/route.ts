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

// กลุ่มอายุ
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

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

<<<<<<< HEAD
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
  // fallback เดิมกันกราฟพัง
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

  // ✅ กัน injection แบบชัวร์ (อนุญาตเฉพาะ a-z0-9_)
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

  // ส่งเป็นเลข -> province_no
  if (/^\d+$/.test(p)) {
    const found = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  // ส่งเป็นชื่อไทย -> เช็คชื่อมาตรฐานจาก ref.provinces_moph
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

    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");

    // ✅ province ต้องมี แต่ถ้าไม่มีให้คืน [] (กันกราฟพัง)
    const provinceRaw = (params.get("province") || "").trim();

    // ✅ disease optional
    const diseaseCode = pickDisease(params);

    if (!provinceRaw) {
      return NextResponse.json([], {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

<<<<<<< HEAD
    // ✅ ถ้าเลือก "ทุกจังหวัด" ให้ไม่กรอง province
    const isAllProvince =
      provinceRaw === "ทุกจังหวัด" ||
      provinceRaw === "ทั้งหมด" ||
      provinceRaw.toLowerCase() === "all";

    // ✅ resolve fact table
    const { schema, table } = await resolveFactTable(diseaseCode);

    // ✅ Query หลัก (dynamic table)
    let q = (db as any)
      .withSchema(schema)
      .selectFrom(`${table} as ic` as any)
      .select([
        sql<number>`COUNT(*)::int`.as("patients"),
        sql<number>`ic.age_y`.as("age_y"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.age_y", "is not", null);

    // ✅ กรองจังหวัด ถ้าไม่ใช่ทุกจังหวัด
    if (!isAllProvince) {
      q = q.where("ic.province", "=", provinceRaw);
    }

    // ✅ ถ้า table เป็นรวมหลายโรค ให้กรอง disease_code
    if (diseaseCode) {
      q = q.where("ic.disease_code", "=", diseaseCode);
    }

    const rows = await q.groupBy("ic.age_y").execute();
=======
    const provinceName = await resolveProvinceName(province);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    // 📍 method_f/g: นับผู้ป่วยแยกตามอายุจาก d01_influenza (denormalized)
    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(*)`.as("patients"), "ic.age_y as age_y"])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .where("ic.age_y", "is not", null)
      .groupBy("ic.age_y")
      .execute();
>>>>>>> feature/Method_F&Method_G

    // 📊 Map age → group
    const grouped: Record<string, number> = {};
    for (const g of ageGroups) grouped[g.label] = 0;

<<<<<<< HEAD
    for (const row of rows as any[]) {
      const age = Number(row.age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number(row.patients || 0);
=======
    for (const row of rows) {
      const age = Number((row as any).age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number((row as any).patients ?? 0);
>>>>>>> feature/Method_F&Method_G
    }

    const result = Object.entries(grouped).map(([ageRange, patients]) => ({
      ageRange,
      patients,
    }));

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (age-group):", error);
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
