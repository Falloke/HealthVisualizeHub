// app/api/compareInfo/gender-deaths/route.ts
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

type GenderCounts = {
  male: number;
  female: number;
  unknown: number;
};

type GenderSummary = {
  province: string;
} & GenderCounts;

type APIResp = {
  ok: boolean;
  main?: GenderSummary;
  compare?: GenderSummary;
  error?: string;
};

async function queryGenderDeaths(opts: {
  start_date: string;
  end_date: string;
  province: string;
}): Promise<GenderCounts> {
  const { start_date, end_date, province } = opts;

  const rows = await db
    .selectFrom("d01_influenza")
    .select([
      "gender",
      sql<number>`COUNT(death_date_parsed)`.as("deaths"),
    ])
    .where("death_date_parsed", ">=", new Date(start_date))
    .where("death_date_parsed", "<=", new Date(end_date))
    .where("province", "=", province)
    .groupBy("gender")
    .execute();

  let male = 0;
  let female = 0;
  let unknown = 0;

  for (const r of rows as Array<{ gender: string | null; deaths: number }>) {
    const g = (r.gender ?? "").trim();
    const v = Number(r.deaths ?? 0);

    if (g === "M" || g === "ชาย") {
      male = v;
    } else if (g === "F" || g === "หญิง") {
      female = v;
    } else {
      unknown += v;
    }
  }

  return { male, female, unknown };
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const start_date = params.get("start_date") || "2024-01-01";
    const end_date = params.get("end_date") || "2024-12-31";
    const mainProvince = params.get("mainProvince");
    const compareProvince = params.get("compareProvince");

    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        {
          ok: false,
          error: "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด",
        },
        { status: 400 }
      );
    }

    const result: APIResp = { ok: true };

    if (mainProvince) {
      const counts = await queryGenderDeaths({
        start_date,
        end_date,
        province: mainProvince,
      });
      result.main = {
        province: mainProvince,
        ...counts,
      };
    }

    if (compareProvince) {
      const counts = await queryGenderDeaths({
        start_date,
        end_date,
        province: compareProvince,
      });
      result.compare = {
        province: compareProvince,
        ...counts,
      };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("❌ API ERROR (compareInfo/gender-deaths):", err);
    return NextResponse.json<APIResp>(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
