import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
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
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const province = params.get("province");

    if (!province || !province.trim()) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

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
      .execute();

    let male = 0;
    let female = 0;

    for (const r of rows) {
      const g = String((r as any).gender ?? "").trim();
      if (g === "M" || g === "ชาย") male += Number((r as any).deaths ?? 0);
      else if (g === "F" || g === "หญิง") female += Number((r as any).deaths ?? 0);
    }

    return NextResponse.json([
      { gender: "ชาย", value: male },
      { gender: "หญิง", value: female },
    ]);
  } catch (err) {
    console.error("❌ API ERROR (gender-deaths):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
