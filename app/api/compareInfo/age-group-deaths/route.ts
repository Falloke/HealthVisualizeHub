// app/api/compareInfo/age-group-deaths/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AgeRow = { ageRange: string; deaths: number };

type RowMerged = {
  ageRange: string;
  mainDeaths: number;
  compareDeaths: number;
};

const AGE_ORDER = [
  "0-4",
  "5-9",
  "10-14",
  "15-19",
  "20-24",
  "25-44",
  "45-59",
  "60+",
];

function orderIndex(range: string): number {
  const i = AGE_ORDER.indexOf(range.trim());
  return i === -1 ? 999 : i;
}

function mergeAgeData(main: AgeRow[], compare: AgeRow[]): RowMerged[] {
  const map = new Map<string, RowMerged>();

  for (const r of main) {
    const key = r.ageRange.trim();
    const row =
      map.get(key) ??
      ({
        ageRange: key,
        mainDeaths: 0,
        compareDeaths: 0,
      } as RowMerged);
    row.mainDeaths = Number(r.deaths ?? 0);
    map.set(key, row);
  }

  for (const r of compare) {
    const key = r.ageRange.trim();
    const row =
      map.get(key) ??
      ({
        ageRange: key,
        mainDeaths: 0,
        compareDeaths: 0,
      } as RowMerged);
    row.compareDeaths = Number(r.deaths ?? 0);
    map.set(key, row);
  }

  return Array.from(map.values()).sort(
    (a, b) => orderIndex(a.ageRange) - orderIndex(b.ageRange)
  );
}

function buildBaseUrl(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const envBase = process.env.NEXT_PUBLIC_BASE_URL;
  return envBase && envBase.trim().length > 0 ? envBase : `${proto}://${host}`;
}

async function fetchAgeDeaths(args: {
  baseUrl: string;
  start_date: string;
  end_date: string;
  province: string;
}): Promise<AgeRow[]> {
  const { baseUrl, start_date, end_date, province } = args;

  const url = new URL(
    `/api/dashBoard/age-group-deaths?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
      province
    )}`,
    baseUrl
  );

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text || `Failed to fetch age-group-deaths for ${province}`
    );
  }
  return text ? (JSON.parse(text) as AgeRow[]) : [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const start_date = searchParams.get("start_date") ?? "";
    const end_date = searchParams.get("end_date") ?? "";
    const mainProvince = searchParams.get("mainProvince") ?? "";
    const compareProvince = searchParams.get("compareProvince") ?? "";

    if (!start_date || !end_date || !mainProvince || !compareProvince) {
      return NextResponse.json(
        { error: "missing required query params" },
        { status: 400 }
      );
    }

    const baseUrl = buildBaseUrl(req);

    const [mainRows, compareRows] = await Promise.all([
      fetchAgeDeaths({ baseUrl, start_date, end_date, province: mainProvince }),
      fetchAgeDeaths({
        baseUrl,
        start_date,
        end_date,
        province: compareProvince,
      }),
    ]);

    const merged = mergeAgeData(mainRows ?? [], compareRows ?? []);

    return NextResponse.json(merged, { status: 200 });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group-deaths] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}