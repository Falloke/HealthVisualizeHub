// app/api/compareInfo/gender-patients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely3/db";

export const runtime = "nodejs";

type GenderCounts = { male: number; female: number; unknown: number };
type GenderSummary = { province: string } & GenderCounts;

type APIResp = {
  ok: boolean;
  main?: GenderSummary;
  compare?: GenderSummary;
  error?: string;
};

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

async function queryGenderPatients(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
}): Promise<GenderCounts> {
  const start = parseDateOrThrow(opts.start_date, "start_date");
  const end = parseDateOrThrow(opts.end_date, "end_date");

  const g = sql`LOWER(TRIM(COALESCE(ic.gender, '')))`;

  const row = await db
    .selectFrom("influenza_cases as ic")
    .innerJoin("provinces as p", "p.province_id", "ic.province_id")
    .select(() => [
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))`.as("female"),
      sql<number>`COUNT(*) FILTER (
        WHERE ${g} NOT IN ('m','male','ชาย','f','female','หญิง')
      )`.as("unknown"),
    ])
    .where("p.province_name_th", "=", opts.provinceNameTh)
    .where("ic.onset_date_parsed", ">=", start)
    .where("ic.onset_date_parsed", "<=", end)
    .executeTakeFirst();

  return {
    male: Number(row?.male ?? 0),
    female: Number(row?.female ?? 0),
    unknown: Number(row?.unknown ?? 0),
  };
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

    const [mainCounts, compareCounts] = await Promise.all([
      queryGenderPatients({ start_date, end_date, provinceNameTh: mainProvince }),
      queryGenderPatients({ start_date, end_date, provinceNameTh: compareProvince }),
    ]);

    return NextResponse.json<APIResp>(
      {
        ok: true,
        main: { province: mainProvince, ...mainCounts },
        compare: { province: compareProvince, ...compareCounts },
      },
      { status: 200, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-patients):", e);
    return NextResponse.json<APIResp>({ ok: false, error: e?.message ?? "Internal Server Error" }, { status: 500 });
  }
}
