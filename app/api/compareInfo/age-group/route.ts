// app/api/compareInfo/age-group/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgeRow = { ageRange: string; patients: number };

type RowMerged = {
  ageRange: string;
  mainPatients: number;
  comparePatients: number;
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
        mainPatients: 0,
        comparePatients: 0,
      } as RowMerged);
    row.mainPatients = Number(r.patients ?? 0);
    map.set(key, row);
  }

  for (const r of compare) {
    const key = r.ageRange.trim();
    const row =
      map.get(key) ??
      ({
        ageRange: key,
        mainPatients: 0,
        comparePatients: 0,
      } as RowMerged);
    row.comparePatients = Number(r.patients ?? 0);
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
  const env = process.env.NEXT_PUBLIC_BASE_URL;

  return env && env.trim().length > 0 ? env : `${proto}://${host}`;
}

async function fetchAgeGroup(args: {
  baseUrl: string;
  start_date: string;
  end_date: string;
  province: string;
}): Promise<AgeRow[]> {
  const { baseUrl, start_date, end_date, province } = args;

  const url = new URL(
    `/api/dashBoard/age-group?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
      province
    )}`,
    baseUrl
  );

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `Failed to fetch age-group for ${province}`);
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
      fetchAgeGroup({ baseUrl, start_date, end_date, province: mainProvince }),
      fetchAgeGroup({
        baseUrl,
        start_date,
        end_date,
        province: compareProvince,
      }),
    ]);

    const merged = mergeAgeData(mainRows ?? [], compareRows ?? []);

    return NextResponse.json(merged, { status: 200 });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
