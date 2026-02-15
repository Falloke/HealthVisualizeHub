import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
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
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startDate = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const provinceParam = (params.get("province") || "").trim();
    const diseaseCode = (params.get("disease") || "").trim() || null;

    if (!provinceParam) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const provinceName = await resolveProvinceName(provinceParam);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${provinceParam}` }, { status: 404 });
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
      .execute();

    const grouped: Record<string, number> = {};
    for (const g of ageGroups) grouped[g.label] = 0;

    for (const row of rows) {
      const age = Number((row as any).age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number((row as any).deaths ?? 0);
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
