// app/api/dashBoard/patients-summary/route.ts
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
      // คืนค่า default 200 เพื่อให้ UI ไม่พัง
      return NextResponse.json(
        {
          totalPatients: 0,
          avgPatientsPerDay: 0,
          cumulativePatients: 0,
        },
        { status: 200 }
      );
    }

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json(
        {
          totalPatients: 0,
          avgPatientsPerDay: 0,
          cumulativePatients: 0,
        },
        { status: 200 }
      );
    }

    // ผู้ป่วยในช่วงวันที่
    const inRange = await db
      .selectFrom("influenza_cases")
      .select((eb) => [eb.fn.countAll().as("total_patients")])
      .where("onset_date_parsed", ">=", startDate)
      .where("onset_date_parsed", "<=", endDate)
      .where("province_id", "=", provinceId)
      .executeTakeFirst();

    const totalPatients = Number(inRange?.total_patients ?? 0);

    // เฉลี่ยต่อวัน (ปัดเศษเหมือนเดิมที่ใช้ ROUND)
    const days = daysInclusive(startDate, endDate);
    const avgPatientsPerDay = Math.round(totalPatients / days);

    // ผู้ป่วยสะสมทั้งหมด (ของจังหวัดนั้น)
    const cum = await db
      .selectFrom("influenza_cases")
      .select((eb) => [eb.fn.countAll().as("cumulative_patients")])
      .where("province_id", "=", provinceId)
      .executeTakeFirst();

    const cumulativePatients = Number(cum?.cumulative_patients ?? 0);

    return NextResponse.json(
      { totalPatients, avgPatientsPerDay, cumulativePatients },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (patients-summary):", error);
    // คืน default 200 เพื่อลด error ฝั่ง UI
    return NextResponse.json(
      {
        totalPatients: 0,
        avgPatientsPerDay: 0,
        cumulativePatients: 0,
      },
      { status: 200 }
    );
  }
}
