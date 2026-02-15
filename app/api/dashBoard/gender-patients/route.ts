import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// -------------------- utils --------------------
function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

async function resolveProvinceName(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const found = await (db as any)
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  const found = await (db as any)
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select(sql<string>`p.province_name_th`.as("province_name_th"))
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (found?.province_name_th ?? "").trim() || null;
}

// -------------------- route --------------------
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    // define missing variables
    const startDate = startYMD;
    const endDate = endYMD;
    const province = (params.get("province") ?? "").trim();

    const provinceName = await resolveProvinceName(province);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select(["ic.gender as gender", sql<number>`COUNT(*)`.as("patients")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .groupBy("ic.gender")
      .execute();

    let male = 0;
    let female = 0;
    let unknown = 0;

    for (const r of rows) {
      const g = String((r as any).gender ?? "").trim();
      if (g === "M" || g === "ชาย") male += Number((r as any).patients ?? 0);
      else if (g === "F" || g === "หญิง") female += Number((r as any).patients ?? 0);
      else unknown += Number((r as any).patients ?? 0);
    }

    // คืนรูปแบบเดิมให้ UI ใช้ต่อ
    return NextResponse.json([{ province: provinceName, male, female, unknown }]);
  } catch (err) {
    console.error("❌ API ERROR (gender-patients):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
