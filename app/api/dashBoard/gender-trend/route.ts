// app/api/dashBoard/gender-trend/route.ts
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

export const runtime = "nodejs";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

async function resolveProvinceId(provinceParam: string) {
  const p = provinceParam.trim();

  if (/^\d+$/.test(p)) return Number(p);

  const found = await db
    .selectFrom("provinces")
    .select("province_id")
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return found?.province_id ?? null;
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

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json(
        { error: `ไม่พบจังหวัด: ${province}` },
        { status: 404 }
      );
    }

    // 📊 query นับผู้ป่วย grouped by เดือน + เพศ
    const monthExpr = sql<string>`TO_CHAR(onset_date_parsed, 'YYYY-MM')`;

    const rows = await db
      .selectFrom("influenza_cases")
      .select([
        monthExpr.as("month"),
        "gender",
        sql<number>`COUNT(*)`.as("count"),
      ])
      .where("onset_date_parsed", ">=", startDate)
      .where("onset_date_parsed", "<=", endDate)
      .where("province_id", "=", provinceId)
      .groupBy(monthExpr)
      .groupBy("gender")
      .orderBy(monthExpr)
      .execute();

    // แปลงเป็น { month, male, female }
    const monthlyData: Record<string, { male: number; female: number }> = {};

    for (const r of rows) {
      const month = String(r.month);
      if (!monthlyData[month]) monthlyData[month] = { male: 0, female: 0 };

      const g = (r.gender || "").trim();
      if (g === "M" || g === "ชาย") monthlyData[month].male += Number(r.count);
      else if (g === "F" || g === "หญิง")
        monthlyData[month].female += Number(r.count);
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
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
