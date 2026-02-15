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

    const monthExpr = sql<string>`TO_CHAR(ic.onset_date_parsed, 'YYYY-MM')`;

    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([monthExpr.as("month"), "ic.gender as gender", sql<number>`COUNT(*)`.as("count")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .groupBy(monthExpr)
      .groupBy("ic.gender")
      .orderBy("month")
      .execute();

    const monthlyData: Record<string, { male: number; female: number }> = {};

    for (const r of rows) {
      const month = String((r as any).month);
      if (!monthlyData[month]) monthlyData[month] = { male: 0, female: 0 };

      const g = String((r as any).gender ?? "").trim();
      if (g === "M" || g === "ชาย") monthlyData[month].male += Number((r as any).count ?? 0);
      else if (g === "F" || g === "หญิง") monthlyData[month].female += Number((r as any).count ?? 0);
    }

    const result = Object.keys(monthlyData)
      .sort()
      .map((m) => ({
        month: m,
        male: monthlyData[m].male,
        female: monthlyData[m].female,
      }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("❌ API ERROR (gender-trend):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
