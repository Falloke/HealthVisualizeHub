// app/api/compareInfo/age-group/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export const runtime = "nodejs";

type AgeRow = { ageRange: string; patients: number };

type RowMerged = {
  ageRange: string;
  mainPatients: number;
  comparePatients: number;
};

const AGE_ORDER = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-44", "45-59", "60+"] as const;
const AGE_SET = new Set<string>(AGE_ORDER as unknown as string[]);

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function normalizeAgeRange(v: unknown): string {
  return String(v ?? "").trim();
}

function orderIndex(range: string): number {
  const i = (AGE_ORDER as unknown as string[]).indexOf(range);
  return i === -1 ? 999 : i;
}

function mergeAgeData(main: AgeRow[], compare: AgeRow[]): RowMerged[] {
  const mainMap = new Map<string, number>();
  const compareMap = new Map<string, number>();
  const extra = new Set<string>();

  for (const r of main ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.patients ?? 0);
    mainMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  for (const r of compare ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.patients ?? 0);
    compareMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  const base: RowMerged[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    mainPatients: mainMap.get(k) ?? 0,
    comparePatients: compareMap.get(k) ?? 0,
  }));

  const extras = Array.from(extra.values())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({
      ageRange: k,
      mainPatients: mainMap.get(k) ?? 0,
      comparePatients: compareMap.get(k) ?? 0,
    }));

  return base.concat(extras);
}

async function queryAgePatients(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<AgeRow[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  const ageCase = sql<string>`
    CASE
      WHEN ic.age_y BETWEEN 0 AND 4 THEN '0-4'
      WHEN ic.age_y BETWEEN 5 AND 9 THEN '5-9'
      WHEN ic.age_y BETWEEN 10 AND 14 THEN '10-14'
      WHEN ic.age_y BETWEEN 15 AND 19 THEN '15-19'
      WHEN ic.age_y BETWEEN 20 AND 24 THEN '20-24'
      WHEN ic.age_y BETWEEN 25 AND 44 THEN '25-44'
      WHEN ic.age_y BETWEEN 45 AND 59 THEN '45-59'
      WHEN ic.age_y >= 60 THEN '60+'
      ELSE NULL
    END
  `.as("ageRange");

  const rows = await db
    .selectFrom("influenza_cases as ic")
    .innerJoin("provinces as p", "p.province_id", "ic.province_id")
    .select([
      ageCase,
      sql<number>`COUNT(*)`.as("patients"),
    ])
    .where("p.province_name_th", "=", args.provinceNameTh)
    .where("ic.onset_date_parsed", ">=", start)
    .where("ic.onset_date_parsed", "<=", end)
    .where(sql`ic.age_y IS NOT NULL`)
    .groupBy("ageRange")
    .execute();

  // ทำให้ “ครบทุกช่วง” เสมอ
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = String((r as any).ageRange ?? "").trim();
    if (!k) continue;
    map.set(k, Number((r as any).patients ?? 0));
  }

  const ordered: AgeRow[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    patients: map.get(k) ?? 0,
  }));

  // เผื่อมี label แปลก ๆ จากข้อมูลจริง
  const extras = Array.from(map.keys())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({ ageRange: k, patients: map.get(k) ?? 0 }));

  return ordered.concat(extras);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "";
    const end_date = sp.get("end_date") ?? "";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";

    if (!start_date || !end_date || !mainProvince || !compareProvince) {
      return NextResponse.json({ error: "missing required query params" }, { status: 400 });
    }

    const [mainRows, compareRows] = await Promise.all([
      queryAgePatients({ start_date, end_date, provinceNameTh: mainProvince }),
      queryAgePatients({ start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    const merged = mergeAgeData(mainRows, compareRows);

    return NextResponse.json(merged, {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group] error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
