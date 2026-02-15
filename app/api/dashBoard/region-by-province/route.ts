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

function safeIdent(name: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return name;
}

function resolveFactTableByDisease(diseaseParam: string) {
  const d = (diseaseParam || "D01").trim().toLowerCase();

  // ปรับ mapping ได้ตามจริงในระบบคุณ
  if (d === "d01" || d.includes("infl")) return "d01_influenza";
  if (d === "d02" || d.includes("deng")) return "d02_dengue";
  if (d === "d03" || d.includes("monkey")) return "d03_monkeypox";

  // fallback
  return "d01_influenza";
}

/**
 * province รองรับ:
 * - ตัวเลข province_no
 * - ชื่อไทย province_name_th
 */
async function resolveProvinceFromRef(provinceParam: string) {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

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
    return row ?? null;
  }

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

  return row ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startDate = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseYMDOrFallback(params.get("end_date"), "2024-12-31");
    const provinceParam = (params.get("province") ?? "").trim();
    const diseaseParam = (params.get("disease") ?? "D01").trim(); // ✅ default แล้ว

    if (!provinceParam) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const selected = await resolveProvinceFromRef(provinceParam);
    if (!selected?.province_name_th) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${provinceParam}` }, { status: 404 });
    }

    const regionMoph = String(selected.region_moph ?? "").trim() || "ไม่ทราบภูมิภาค";

    const factTable = safeIdent(resolveFactTableByDisease(diseaseParam));
    const factRef = sql.ref(factTable);

    const topDeaths = await (db as any)
      .selectFrom(sql`${factRef}`.as("ic"))
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
      .where(sql`ic.onset_date_parsed::date`, ">=", startDate)
      .where(sql`ic.onset_date_parsed::date`, "<=", endDate)
      .groupBy(sql`p.province_name_th`)
      .groupBy(sql`p.region_moph`)
      .orderBy("deaths", "desc")
      .orderBy("patients", "desc")
      .limit(5)
      .execute();

    const topPatients = await (db as any)
      .selectFrom(sql`${factRef}`.as("ic"))
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
      .where(sql`ic.onset_date_parsed::date`, ">=", startDate)
      .where(sql`ic.onset_date_parsed::date`, "<=", endDate)
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
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ API ERROR (region-by-province):", error);
    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
