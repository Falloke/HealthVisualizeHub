import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

type RefProvince = {
  province_no: number;
  province_name_th: string;
  region_id: number | null;
  region_moph: string;
};

async function resolveProvince(provinceParam: string): Promise<RefProvince | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  // เลข -> province_no
  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_no"),
        sql<string>`p.province_name_th`.as("province_name_th"),
        sql<number | null>`p.region_id`.as("region_id"),
        sql<string>`p.region_moph`.as("region_moph"),
      ])
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (row ?? null) as any;
  }

  // ชื่อ -> province_name_th
  const row = await db
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select([
      sql<number>`p.province_no`.as("province_no"),
      sql<string>`p.province_name_th`.as("province_name_th"),
      sql<number | null>`p.region_id`.as("region_id"),
      sql<string>`p.region_moph`.as("region_moph"),
    ])
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (row ?? null) as any;
}

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(p.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(p.get("end_date"), "2024-12-31");
    const province = p.get("province")?.trim();

    if (!province) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const prov = await resolveProvince(province);
    if (!prov) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const patientsRow = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(*)`.as("patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", prov.province_name_th)
      .executeTakeFirst();

    const deathsRow = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([sql<number>`COUNT(ic.death_date_parsed)`.as("deaths")])
      .where("ic.death_date_parsed", "is not", null)
      .where("ic.death_date_parsed", ">=", startDate)
      .where("ic.death_date_parsed", "<=", endDate)
      .where("ic.province", "=", prov.province_name_th)
      .executeTakeFirst();

    return NextResponse.json(
      {
        province: prov.province_name_th,
        regionId: prov.region_id ?? null,
        patients: Number((patientsRow as any)?.patients ?? 0),
        deaths: Number((deathsRow as any)?.deaths ?? 0),
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (province-summary):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
