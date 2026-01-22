import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

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

async function resolveFactTable(diseaseCode: string): Promise<{ schema: string; table: string } | null> {
  if (!diseaseCode) return null;

  const row = await db
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

    const rows = await db
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
      .execute();

    const monthlyData: Record<string, { male: number; female: number }> = {};

    for (const r of rows as any[]) {
      const month = String(r.month);
      if (!monthlyData[month]) monthlyData[month] = { male: 0, female: 0 };

      const g = String(r.gender ?? "").trim().toLowerCase();
      if (g === "m" || g === "male" || g === "ชาย") {
        monthlyData[month].male += Number(r.count || 0);
      } else if (g === "f" || g === "female" || g === "หญิง") {
        monthlyData[month].female += Number(r.count || 0);
      }
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
    return NextResponse.json([], {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
