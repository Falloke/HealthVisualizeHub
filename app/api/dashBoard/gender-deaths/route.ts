import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
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
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const provinceParam = (params.get("province") ?? "").trim();
    const provinceName = await resolveProvinceName(provinceParam);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${provinceParam}` }, { status: 404 });
    }

    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select(["ic.gender as gender", sql<number>`COUNT(ic.death_date_parsed)`.as("deaths")])
      .where("ic.province", "=", provinceName)
      .where("ic.death_date_parsed", "is not", null)
      .where("ic.death_date_parsed", ">=", startYMD)
      .where("ic.death_date_parsed", "<=", endYMD)
      .groupBy("ic.gender")
      .execute();

    let male = 0;
    let female = 0;

    for (const r of rows) {
      const g = String((r as any).gender ?? "").trim();
      if (g === "M" || g === "ชาย") male += Number((r as any).deaths ?? 0);
      else if (g === "F" || g === "หญิง") female += Number((r as any).deaths ?? 0);
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
