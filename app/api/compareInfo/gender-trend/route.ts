// app/api/compareInfo/gender-trend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export const runtime = "nodejs";

type TrendData = { month: string; male: number; female: number };

type CombinedRow = {
  month: string;
  month_th: string;
  male_main?: number;
  female_main?: number;
  male_compare?: number;
  female_compare?: number;
};

type APIResp = { ok: boolean; rows?: CombinedRow[]; error?: string };

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function toThaiMonthLabel(month: string): string {
  // month: YYYY-MM
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = new Date(y, mo, 1);
  return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
}

async function queryGenderTrend(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<TrendData[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  const g = sql`LOWER(TRIM(COALESCE(ic.gender, '')))`;
  const monthKey = sql<string>`TO_CHAR(date_trunc('month', ic.onset_date_parsed), 'YYYY-MM')`.as("month");

  const rows = await db
    .selectFrom("influenza_cases as ic")
    .innerJoin("provinces as p", "p.province_id", "ic.province_id")
    .select(() => [
      monthKey,
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))`.as("female"),
    ])
    .where("p.province_name_th", "=", args.provinceNameTh)
    .where("ic.onset_date_parsed", ">=", start)
    .where("ic.onset_date_parsed", "<=", end)
    .groupBy("month")
    .orderBy("month", "asc")
    .execute();

  return rows.map((r: any) => ({
    month: String(r.month),
    male: Number(r.male ?? 0),
    female: Number(r.female ?? 0),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince และ compareProvince ให้ครบ" },
        { status: 400 }
      );
    }

    const [mainTrend, compareTrend] = await Promise.all([
      queryGenderTrend({ start_date, end_date, provinceNameTh: mainProvince }),
      queryGenderTrend({ start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    const mainMap = new Map<string, TrendData>();
    for (const r of mainTrend) mainMap.set(r.month, r);

    const compareMap = new Map<string, TrendData>();
    for (const r of compareTrend) compareMap.set(r.month, r);

    const monthSet = new Set<string>();
    for (const k of mainMap.keys()) monthSet.add(k);
    for (const k of compareMap.keys()) monthSet.add(k);

    const months = Array.from(monthSet.values()).sort(); // YYYY-MM sort ได้ตรง

    const rows: CombinedRow[] = months.map((m) => {
      const a = mainMap.get(m);
      const b = compareMap.get(m);
      return {
        month: m,
        month_th: toThaiMonthLabel(m),
        male_main: Number(a?.male ?? 0),
        female_main: Number(a?.female ?? 0),
        male_compare: Number(b?.male ?? 0),
        female_compare: Number(b?.female ?? 0),
      };
    });

    return NextResponse.json<APIResp>(
      { ok: true, rows },
      { status: 200, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-trend):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
