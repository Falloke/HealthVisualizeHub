import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

/**
 * รองรับ province เป็น:
 * - เลข (province_no ของ ref.provinces_moph)
 * - ชื่อไทย (province_name_th)
 */
async function resolveProvinceFromRef(provinceParam: string) {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  // เป็นเลข: province_no
  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_no"),
        sql<string>`p.province_name_th`.as("province_name_th"),
        sql<string>`p.region_moph`.as("region_moph"),
        sql<number | null>`p.region_id`.as("region_id"),
      ])
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (row ?? null) as any;
  }

  // เป็นชื่อไทย: province_name_th
  const row = await db
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select([
      sql<number>`p.province_no`.as("province_no"),
      sql<string>`p.province_name_th`.as("province_name_th"),
      sql<string>`p.region_moph`.as("region_moph"),
      sql<number | null>`p.region_id`.as("region_id"),
    ])
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (row ?? null) as any;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const provinceParam = (params.get("province") ?? "").trim();

    if (!provinceParam) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    // 1) หา “ภูมิภาค” ของจังหวัดที่เลือกจาก ref.provinces_moph
    const selected = await resolveProvinceFromRef(provinceParam);
    if (!selected?.province_name_th) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${provinceParam}` }, { status: 404 });
    }

    const regionMoph = String(selected.region_moph ?? "").trim() || "ไม่ทราบภูมิภาค";

    // 2) ดึง Top 5 “ผู้เสียชีวิตสะสม” ภายในภูมิภาคเดียวกัน (ช่วงวันที่)
    // join ด้วยชื่อจังหวัด โดย trim ฝั่ง ic กันช่องว่างหลุด
    const topDeaths = await (db as any)
      .selectFrom("d01_influenza as ic")
      .innerJoin(sql`ref.provinces_moph`.as("p"), (join: any) =>
        join.on(sql<string>`btrim(ic.province)`, "=", sql<string>`p.province_name_th`)
      )
      .select([
        sql<string>`p.province_name_th`.as("province"),
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`COUNT(ic.death_date_parsed)`.as("deaths"),
        sql<string>`p.region_moph`.as("region"),
      ])
      .where(sql<string>`p.region_moph`, "=", regionMoph)
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .groupBy(sql`p.province_name_th`)
      .groupBy(sql`p.region_moph`)
      .orderBy("deaths", "desc")
      .orderBy("patients", "desc")
      .limit(5)
      .execute();

    // 3) เผื่อให้กราฟอีกตัวใช้ได้ด้วย (Top 5 ผู้ป่วยในภูมิภาคเดียวกัน)
    const topPatients = await (db as any)
      .selectFrom("d01_influenza as ic")
      .innerJoin(sql`ref.provinces_moph`.as("p"), (join: any) =>
        join.on(sql<string>`btrim(ic.province)`, "=", sql<string>`p.province_name_th`)
      )
      .select([
        sql<string>`p.province_name_th`.as("province"),
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`COUNT(ic.death_date_parsed)`.as("deaths"),
        sql<string>`p.region_moph`.as("region"),
      ])
      .where(sql<string>`p.region_moph`, "=", regionMoph)
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .groupBy(sql`p.province_name_th`)
      .groupBy(sql`p.region_moph`)
      .orderBy("patients", "desc")
      .orderBy("deaths", "desc")
      .limit(5)
      .execute();

    return NextResponse.json(
      {
        region: regionMoph,
        selectedProvince: {
          province: selected.province_name_th,
          province_no: selected.province_no ?? null,
          region_id: selected.region_id ?? null,
        },
        topDeaths,
        topPatients,
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (region-by-province):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
