import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

function ymdToUTCStart(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}

function ymdToUTCEnd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999));
}

function pickDisease(params: URLSearchParams): string | null {
  const v = (params.get("disease") || params.get("disease_code") || "").trim();
  return v || null;
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

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const provinceRaw = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    // ✅ ไม่มี province -> คืน []
    if (!provinceRaw) {
      return NextResponse.json([], {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const provinceName = await resolveProvinceName(provinceRaw);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${provinceRaw}` }, { status: 404 });
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

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ API ERROR (gender-trend):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
