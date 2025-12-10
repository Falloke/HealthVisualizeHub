// app/api/compareInfo/gender-patients/route.ts
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

/**
 * ดึงจำนวน "ผู้ป่วย" แยกตามเพศในจังหวัดหนึ่ง
 *
 * 👉 ตอนนี้ยัง **ไม่ฟิลเตอร์ตามวันที่** เพราะไม่รู้ชื่อคอลัมน์วันที่จริงใน d01_influenza
 *    ถ้ารู้ชื่อคอลัมน์ (เช่น sick_date, onset_date ฯลฯ) ค่อยมาใส่ where เพิ่มทีหลังได้
 */
async function queryGenderPatients(opts: {
  start_date: string; // ยังรับไว้เผื่อใช้ทีหลัง
  end_date: string;
  province: string;
}): Promise<GenderCounts> {
  const { province } = opts;

  const rows = await db
    .selectFrom("d01_influenza")
    .select([
      "gender",
      sql<number>`COUNT(*)`.as("patients"),
    ])
    // TODO: ถ้ารู้ชื่อคอลัมน์วันที่จริงแล้ว ค่อยใส่ filter ช่วงวันที่กลับมา
    // .where("your_date_column" as any, ">=", new Date(start_date))
    // .where("your_date_column" as any, "<=", new Date(end_date))
    .where("province", "=", province)
    .groupBy("gender")
    .execute();

  let male = 0;
  let female = 0;
  let unknown = 0;

  for (const r of rows as Array<{ gender: string | null; patients: number }>) {
    const g = (r.gender ?? "").trim();
    const v = Number(r.patients ?? 0);

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
      const counts = await queryGenderPatients({
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
      const counts = await queryGenderPatients({
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
    console.error("❌ API ERROR (compareInfo/gender-patients):", err);
    return NextResponse.json<APIResp>(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
