import { NextRequest, NextResponse } from "next/server";
<<<<<<< HEAD
import db from "@/lib/kysely/db";
=======
import db from "@/lib/kysely4/db";
>>>>>>> feature/Method_F&Method_G
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

<<<<<<< HEAD
function ymdToUTCStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}
function ymdToUTCEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`);
}

function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(s);
}

async function resolveFactTable(
  diseaseCode: string
): Promise<{ schema: string; table: string } | null> {
  if (!diseaseCode) return null;

  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active"])
    .where("disease_code", "=", diseaseCode)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  if (!schema || !table) return null;
  if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

  return { schema, table };
=======
async function resolveProvinceName(provinceParam: string): Promise<string | null> {
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
>>>>>>> feature/Method_F&Method_G
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const provinceRaw = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    // ✅ ไม่มี province -> คืน []
    if (!provinceRaw) {
      return NextResponse.json([], {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

<<<<<<< HEAD
    // ✅ ไม่มีโรค -> คืน []
    if (!diseaseCode) {
      return NextResponse.json([], {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fact = await resolveFactTable(diseaseCode);
    if (!fact) {
      return NextResponse.json([], {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 📌 monthExpr จาก onset_date_parsed
    const monthExpr = sql<string>`TO_CHAR(ic.onset_date_parsed, 'YYYY-MM')`;

    const rows = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        monthExpr.as("month"),
        sql<string>`ic.gender`.as("gender"),
        sql<number>`COUNT(*)::int`.as("count"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceRaw)
      .where("ic.disease_code", "=", diseaseCode)
      .groupBy(monthExpr)
      .groupBy(sql`ic.gender`)
      .orderBy(monthExpr)
=======
    const provinceName = await resolveProvinceName(province);
    if (!provinceName) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const monthExpr = sql<string>`TO_CHAR(ic.onset_date_parsed, 'YYYY-MM')`;

    const rows = await (db as any)
      .selectFrom("d01_influenza as ic")
      .select([monthExpr.as("month"), "ic.gender as gender", sql<number>`COUNT(*)`.as("count")])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceName)
      .groupBy(monthExpr)
      .groupBy("ic.gender")
      .orderBy("month")
>>>>>>> feature/Method_F&Method_G
      .execute();

    const monthlyData: Record<string, { male: number; female: number }> = {};

<<<<<<< HEAD
    for (const r of rows as any[]) {
      const month = String(r.month);
      if (!monthlyData[month]) monthlyData[month] = { male: 0, female: 0 };

      const g = String(r.gender ?? "").trim().toLowerCase();
      if (g === "m" || g === "male" || g === "ชาย") {
        monthlyData[month].male += Number(r.count || 0);
      } else if (g === "f" || g === "female" || g === "หญิง") {
        monthlyData[month].female += Number(r.count || 0);
      }
=======
    for (const r of rows) {
      const month = String((r as any).month);
      if (!monthlyData[month]) monthlyData[month] = { male: 0, female: 0 };

      const g = String((r as any).gender ?? "").trim();
      if (g === "M" || g === "ชาย") monthlyData[month].male += Number((r as any).count ?? 0);
      else if (g === "F" || g === "หญิง") monthlyData[month].female += Number((r as any).count ?? 0);
>>>>>>> feature/Method_F&Method_G
    }

    const result = Object.keys(monthlyData)
      .sort()
      .map((m) => ({
        month: m,
        male: monthlyData[m].male,
        female: monthlyData[m].female,
      }));

    return NextResponse.json(result, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ API ERROR (gender-trend):", err);
<<<<<<< HEAD
    return NextResponse.json([], {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
=======
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
>>>>>>> feature/Method_F&Method_G
  }
}
