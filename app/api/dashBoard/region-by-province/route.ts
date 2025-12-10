import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";
import provinces from "@/public/data/Thailand-ProvinceName.json";

type ProvinceRegion = {
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH: string;
};

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const start_date = params.get("start_date") || "2024-01-01";
    const end_date = params.get("end_date") || "2024-12-31";
    const selectedProvince = (params.get("province") || "").trim();

    if (!selectedProvince) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const provinceList = provinces as ProvinceRegion[];
    const region = provinceList.find(
      (p) => p.ProvinceNameThai === selectedProvince
    )?.Region_VaccineRollout_MOPH;

    if (!region) {
      return NextResponse.json(
        { error: "ไม่พบภูมิภาคของจังหวัดนี้" },
        { status: 404 }
      );
    }

    const provincesInRegion = provinceList
      .filter((p) => p.Region_VaccineRollout_MOPH === region)
      .map((p) => p.ProvinceNameThai);

    // ดึงยอดผู้ป่วย/เสียชีวิตของทุกจังหวัดในภูมิภาคนั้น
    const rows = await db
      .selectFrom("d01_influenza")
      .select([
        "province",
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`COUNT(death_date_parsed)`.as("deaths"),
      ])
      .where("onset_date_parsed", ">=", new Date(start_date))
      .where("onset_date_parsed", "<=", new Date(end_date))
      .where("province", "in", provincesInRegion)
      .groupBy("province")
      .execute();

    const normalized = rows.map((r) => ({
      province: r.province,
      patients: Number(r.patients ?? 0),
      deaths: Number(r.deaths ?? 0),
      region,
    }));

    // ข้อมูลของจังหวัดที่เลือก (ถ้าไม่มีใน rows ให้เป็นศูนย์)
    const selectedRow =
      normalized.find((x) => x.province === selectedProvince) ??
      { province: selectedProvince, patients: 0, deaths: 0, region };

    // === คำนวณอันดับของจังหวัดที่เลือก (ตามจำนวนผู้ป่วย) ===
    const byPatientsDesc = [...normalized].sort(
      (a, b) => b.patients - a.patients
    );
    const selectedIdx = byPatientsDesc.findIndex(
      (x) => x.province === selectedProvince
    );
    const selectedPatientsRank = selectedIdx >= 0 ? selectedIdx + 1 : undefined;

    // Top 5 ของภาค (ไม่รวมจังหวัดที่เลือก เพื่อให้แท่ง Top 1–5 คงที่)
    const others = normalized.filter((x) => x.province !== selectedProvince);
    const topPatients = [...others]
      .sort((a, b) => b.patients - a.patients)
      .slice(0, 5);
    const topDeaths = [...others]
      .sort((a, b) => b.deaths - a.deaths)
      .slice(0, 5);

    // ถ้า “จังหวัดที่เลือก” อยู่นอก Top-5 ให้แนบ object นี้ไปด้วย
    // front-end จะใช้แสดงเป็นแท่งที่ 6 พร้อมบอกรายละเอียดอันดับ
    const selectedProvinceExtra =
      selectedPatientsRank && selectedPatientsRank > 5
        ? {
            province: selectedProvince,
            patients: selectedRow.patients,
            rank: selectedPatientsRank,
            region,
          }
        : undefined;

    return NextResponse.json(
      {
        region,
        selected: { ...selectedRow, patientsRank: selectedPatientsRank }, // คงฟิลด์เดิม + เพิ่ม rank เสริม
        topPatients,
        topDeaths,
        // 👉 ฟิลด์ใหม่ (สำหรับกราฟ Top5 + แท่งที่ 6 ถ้าอยู่นอก Top5)
        selectedProvince: selectedProvinceExtra,
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (region-by-province):", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
