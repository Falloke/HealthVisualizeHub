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

async function resolveProvinceNameOrNull(provinceParam: string): Promise<string | null> {
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
      return NextResponse.json({ totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 }, { status: 200 });
    }

    const provinceName = await resolveProvinceNameOrNull(province);
    if (!provinceName) {
      return NextResponse.json({ totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 }, { status: 200 });
    }

    const inRange = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select((eb: any) => [eb.fn.countAll().as("total_patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .executeTakeFirst();

    const totalPatients = Number((inRange as any)?.total_patients ?? 0);
    const avgPatientsPerDay = Math.round(totalPatients / daysInclusive(startDate, endDate));

    const cum = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select((eb: any) => [eb.fn.countAll().as("cumulative_patients")])
      .where("ic.province", "=", provinceName)
      .executeTakeFirst();

    const cumulativePatients = Number((cum as any)?.cumulative_patients ?? 0);

    return NextResponse.json({ totalPatients, avgPatientsPerDay, cumulativePatients }, { status: 200 });
  } catch (error) {
    console.error("❌ API ERROR (patients-summary):", error);
    return NextResponse.json({ totalPatients: 0, avgPatientsPerDay: 0, cumulativePatients: 0 }, { status: 200 });
  }
}
