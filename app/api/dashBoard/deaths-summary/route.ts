import { NextRequest, NextResponse } from "next/server";
<<<<<<< HEAD
import db from "@/lib/kysely/db";
import { sql } from "kysely";
import { resolveDiseaseAndTable } from "@/lib/dashboard/resolveDiseaseAndTable";
=======
import db from "@/lib/kysely4/db";
import { sql } from "kysely";
>>>>>>> feature/Method_F&Method_G

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

<<<<<<< HEAD
// ✅ CONFIG via ENV
const DEATH_DATE_COL = process.env.DB_DEATH_DATE_COL || "death_date_parsed";
const DEATH_DATE_CAST = (process.env.DB_DEATH_DATE_CAST || "").trim(); // เช่น "date"

function parseYMDOrFallback(input: string | null, fallback: string) {
=======
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
>>>>>>> feature/Method_F&Method_G
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

<<<<<<< HEAD
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

function daysInclusiveYMD(startYMD: string, endYMD: string) {
  const [sy, sm, sd] = startYMD.split("-").map(Number);
  const [ey, em, ed] = endYMD.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const ms = end - start;
  const d = Math.floor(ms / 86400000) + 1;
  return Math.max(1, d);
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

<<<<<<< HEAD
    const startDate = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const provinceName = (params.get("province") || "").trim();
    const diseaseRaw = pickDisease(params);

    // ✅ เหมือนของเดิม: ถ้าไม่ส่ง province มา ให้ 0 ทั้งหมด
    if (!provinceName) {
      return NextResponse.json(
        { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
        { status: 200 }
      );
    }

    // ✅ ถ้าไม่ส่งโรคมา ก็ให้ 0 เหมือนกัน
    if (!diseaseRaw) {
      return NextResponse.json(
        { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
        { status: 200 }
      );
    }

    // ✅ resolve ตารางจากโรค
    const { factTable, diseaseCode } = await resolveDiseaseAndTable(diseaseRaw);

    const deathDate = dateExpr("ic", DEATH_DATE_COL, DEATH_DATE_CAST);

    // ✅ ผู้เสียชีวิตในช่วงวันที่
    const inRange = await sql<any>`
      SELECT COUNT(*)::int AS total_deaths
      FROM ${sql.raw(factTable)} ic
      WHERE ic.province = ${provinceName}
        AND ic.disease_code = ${diseaseCode}
        AND ${deathDate} IS NOT NULL
        AND ${deathDate} >= ${startDate}
        AND ${deathDate} <= ${endDate}
    `.execute(db);

    const totalDeaths = Number(inRange.rows?.[0]?.total_deaths ?? 0);

    const days = daysInclusiveYMD(startDate, endDate);
    const avgDeathsPerDay = Math.round(totalDeaths / days);

    // ✅ ผู้เสียชีวิตสะสมทั้งหมด (ของจังหวัดนั้น)
    const cum = await sql<any>`
      SELECT COUNT(*)::int AS cumulative_deaths
      FROM ${sql.raw(factTable)} ic
      WHERE ic.province = ${provinceName}
        AND ic.disease_code = ${diseaseCode}
        AND ${deathDate} IS NOT NULL
    `.execute(db);

    const cumulativeDeaths = Number(cum.rows?.[0]?.cumulative_deaths ?? 0);
=======
    if (!province || !province.trim()) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

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
      .execute();

    const grouped: Record<string, number> = {};
    for (const g of ageGroups) grouped[g.label] = 0;

    for (const row of rows) {
      const age = Number((row as any).age_y);
      if (!Number.isFinite(age)) continue;

      const group = ageGroups.find((g) => age >= g.min && age <= g.max);
      if (group) grouped[group.label] += Number((row as any).deaths ?? 0);
    }

    const result = Object.entries(grouped).map(([ageRange, deaths]) => ({
      ageRange,
      deaths,
    }));
>>>>>>> feature/Method_F&Method_G

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (age-group-deaths):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
