import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";

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

function daysInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const d = Math.floor(ms / 86400000) + 1;
  return Math.max(1, d);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const province = params.get("province");

    if (!province || !province.trim()) {
      return NextResponse.json(
        { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
        { status: 200 }
      );
    }

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json(
        { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
        { status: 200 }
      );
    }

    // ผู้เสียชีวิตในช่วงวันที่
    const inRange = await db
      .selectFrom("influenza_cases")
      .select((eb) => [
        eb.fn.count("death_date_parsed").as("total_deaths"),
      ])
      .where("province_id", "=", provinceId)
      .where("death_date_parsed", "is not", null)
      .where("death_date_parsed", ">=", startDate)
      .where("death_date_parsed", "<=", endDate)
      .executeTakeFirst();

    const totalDeaths = Number(inRange?.total_deaths ?? 0);

    // เฉลี่ยต่อวัน (ปัดเศษเหมือนเดิมที่ใช้ ROUND)
    const days = daysInclusive(startDate, endDate);
    const avgDeathsPerDay = Math.round(totalDeaths / days);

    // ผู้เสียชีวิตสะสมทั้งหมด (ของจังหวัดนั้น)
    const cum = await db
      .selectFrom("influenza_cases")
      .select((eb) => [eb.fn.count("death_date_parsed").as("cumulative_deaths")])
      .where("province_id", "=", provinceId)
      .where("death_date_parsed", "is not", null)
      .executeTakeFirst();

    const cumulativeDeaths = Number(cum?.cumulative_deaths ?? 0);

    return NextResponse.json(
      { totalDeaths, avgDeathsPerDay, cumulativeDeaths },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (deaths-summary):", error);
    return NextResponse.json(
      { totalDeaths: 0, avgDeathsPerDay: 0, cumulativeDeaths: 0 },
      { status: 200 }
    );
  }
}
