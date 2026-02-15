import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RegionRow = {
  region: string;
  patients: number;
  deaths: number;
};

function parseDateOrFallback(input: string | null, fallback: string): Date {
  const raw = (input ?? "").trim() || fallback;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return new Date(fallback);
  return d;
}

function assertIdent(name: string, label: string): string {
  const v = (name ?? "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) {
    throw new Error(`invalid ${label}: ${name}`);
  }
  return v;
}

/**
 * หมายเหตุ
 * - endpoint นี้ทำกราฟรายภูมิภาคของ "ทั้งประเทศ" ในช่วงวันที่เลือก
 * - ถ้าต้องการกรองเฉพาะจังหวัด ให้ไปทำ endpoint แยก
 * - ที่นี่จงใจ "ไม่กรอง province" เพื่อให้ได้ครบทุกภูมิภาคสำหรับ GraphByProvince
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(sp.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(sp.get("end_date"), "2024-12-31");

    // รองรับ table จาก env เช่น method_f.d01_influenza หรือ d01_influenza
    const rawTable = (process.env.DB_D01_TABLE || "d01_influenza").trim();
    const refSchema = assertIdent(process.env.DB_REF_SCHEMA || "ref", "ref schema");
    const refTable = assertIdent(
      process.env.DB_REF_PROVINCES_TABLE || "provinces_moph",
      "ref provinces table"
    );
    const provinceCol = assertIdent(process.env.DB_D01_PROVINCE_COL || "province", "province col");
    const onsetCol = assertIdent(
      process.env.DB_D01_ONSET_COL || "onset_date_parsed",
      "onset col"
    );
    const deathCol = assertIdent(
      process.env.DB_DEATH_DATE_COL || "death_date_parsed",
      "death col"
    );

    // แยก schema.table
    const d01Parts = rawTable.split(".").map((s) => s.trim()).filter(Boolean);
    const d01Table =
      d01Parts.length === 2
        ? sql`${sql.ref(`${assertIdent(d01Parts[0], "d01 schema")}.${assertIdent(d01Parts[1], "d01 table")}`)}`
        : sql`${sql.ref(assertIdent(d01Parts[0], "d01 table"))}`;

    const pTable = sql`${sql.ref(`${refSchema}.${refTable}`)}`;

    const rows = await (db as any)
      .selectFrom(d01Table.as("ic"))
      .innerJoin(pTable.as("p"), (join: any) =>
        join.onRef(`ic.${provinceCol}` as any, "=", "p.province_name_th")
      )
      .select([
        sql<string>`COALESCE(p.region_moph, 'ไม่ระบุภูมิภาค')`.as("region"),
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`
          SUM(
            CASE WHEN ${sql.ref(`ic.${deathCol}`)} IS NOT NULL THEN 1 ELSE 0 END
          )
        `.as("deaths"),
      ])
      .where(sql.ref(`ic.${onsetCol}`), ">=", startDate)
      .where(sql.ref(`ic.${onsetCol}`), "<=", endDate)
      .groupBy(sql`COALESCE(p.region_moph, 'ไม่ระบุภูมิภาค')`)
      .orderBy(sql`COALESCE(p.region_moph, 'ไม่ระบุภูมิภาค')`)
      .execute();

    const data: RegionRow[] = (rows as Array<any>).map((r) => ({
      region: String(r?.region ?? "").trim(),
      patients: Number(r?.patients ?? 0),
      deaths: Number(r?.deaths ?? 0),
    }));

    return NextResponse.json(data, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    console.error("api error /api/dashBoard/region", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "internal server error" },
      { status: 500 }
    );
  }
}
