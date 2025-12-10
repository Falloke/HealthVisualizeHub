// app/api/compareInfo/province-deaths/route.ts
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

type ProvinceDeaths = {
  province: string;
  deaths: number;
};

type APIResp = {
  ok: boolean;
  main?: ProvinceDeaths;
  compare?: ProvinceDeaths;
  error?: string;
};

// ดึงจำนวน "ผู้เสียชีวิตสะสม" ของจังหวัดเดียว (ตามช่วงวันที่ที่กำหนด)
async function queryProvinceDeaths(opts: {
  start_date: string;
  end_date: string;
  province: string;
}): Promise<ProvinceDeaths> {
  const { start_date, end_date, province } = opts;

  const rows = await db
    .selectFrom("d01_influenza")
    .select([
      "province",
      sql<number>`COUNT(death_date_parsed)`.as("deaths"),
    ])
    .where("death_date_parsed", ">=", new Date(start_date))
    .where("death_date_parsed", "<=", new Date(end_date))
    .where("province", "=", province)
    .groupBy("province")
    .execute();

  const first = rows[0] as { province?: string | null; deaths?: number } | undefined;

  return {
    province,
    deaths: Number(first?.deaths ?? 0),
  };
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
          error:
            "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด",
        },
        { status: 400 }
      );
    }

    const result: APIResp = { ok: true };

    if (mainProvince) {
      const main = await queryProvinceDeaths({
        start_date,
        end_date,
        province: mainProvince,
      });
      result.main = main;
    }

    if (compareProvince) {
      const compare = await queryProvinceDeaths({
        start_date,
        end_date,
        province: compareProvince,
      });
      result.compare = compare;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("❌ API ERROR (compareInfo/province-deaths):", err);
    return NextResponse.json<APIResp>(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
