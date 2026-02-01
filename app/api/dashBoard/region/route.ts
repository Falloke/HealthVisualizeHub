// app/api/dashBoard/region/route.ts
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

function parseIntOrNull(input: string | null) {
  const s = (input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-09-09");

    // optional
    const diseaseId = parseIntOrNull(params.get("disease_id"));

    // ✅ region_id -> region_name_th จาก ref.regions_moph
    const regions = await db
      .selectFrom(sql`"ref"."regions_moph"`.as("r"))
      .select([
        sql<number>`r.region_id`.as("regionId"),
        sql<string>`r.region_name_th`.as("region"),
        sql<number>`r.display_order`.as("displayOrder"),
      ])
      .execute();

    const regionNameById = new Map<number, string>();
    const regionOrderById = new Map<number, number>();

    for (const r of regions as any[]) {
      const id = Number(r.regionId);
      regionNameById.set(id, String(r.region));
      regionOrderById.set(id, Number(r.displayOrder ?? 999));
    }

    // ✅ ดึงผลรวมระดับภูมิภาคจาก MV
    let q = db
      .selectFrom("mv_daily_region as m")
      .select([
        "m.region_id as regionId",
        sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"),
        sql<number>`COALESCE(SUM(m.daily_deaths),0)`.as("deaths"),
      ])
      .where("m.onset_date", ">=", startDate)
      .where("m.onset_date", "<=", endDate)
      .groupBy("m.region_id");

    if (diseaseId != null) q = q.where("m.disease_id", "=", diseaseId);

    const rows = await q.execute();

    const result = rows
      .map((r: any) => {
        const rid = Number(r.regionId);
        return {
          regionId: rid,
          region: regionNameById.get(rid) || "ไม่ทราบภูมิภาค",
          patients: Number(r.patients ?? 0),
          deaths: Number(r.deaths ?? 0),
          _order: regionOrderById.get(rid) ?? 999,
        };
      })
      .sort((a, b) => a._order - b._order)
      .map(({ _order, ...rest }) => rest);

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ API ERROR (region):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
