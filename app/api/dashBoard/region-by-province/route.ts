import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

export const runtime = "nodejs";

function parseDateOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(fallback);
  return d;
}

async function resolveProvince(provinceParam: string) {
  const p = provinceParam.trim();

  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom("provinces")
      .select(["province_id", "province_name_th", "region_id"])
      .where("province_id", "=", Number(p))
      .executeTakeFirst();
    return row ?? null;
  }

  const row = await db
    .selectFrom("provinces")
    .select(["province_id", "province_name_th", "region_id"])
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return row ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const selectedProvinceParam = (params.get("province") || "").trim();

    if (!selectedProvinceParam) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const selectedProv = await resolveProvince(selectedProvinceParam);
    if (!selectedProv) {
      return NextResponse.json(
        { error: `ไม่พบจังหวัด: ${selectedProvinceParam}` },
        { status: 404 }
      );
    }

    const regionId = selectedProv.region_id;
    if (regionId == null) {
      return NextResponse.json(
        { error: "จังหวัดนี้ไม่มี region_id" },
        { status: 404 }
      );
    }

    // หาจังหวัดทั้งหมดในภาคเดียวกัน
    const provincesInRegion = await db
      .selectFrom("provinces")
      .select(["province_id", "province_name_th"])
      .where("region_id", "=", regionId)
      .execute();

    const provinceIds = provincesInRegion.map((x) => x.province_id);

    // ดึงยอดผู้ป่วย/เสียชีวิตของทุกจังหวัดในภาคนั้น
    const rows = await db
      .selectFrom("influenza_cases as ic")
      .innerJoin("provinces as p", "p.province_id", "ic.province_id")
      .select([
        "p.province_name_th as province",
        sql<number>`COUNT(*)`.as("patients"),
        sql<number>`COUNT(ic.death_date_parsed)`.as("deaths"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province_id", "in", provinceIds)
      .groupBy("p.province_name_th")
      .execute();

    const normalized = rows.map((r) => ({
      province: String(r.province),
      patients: Number(r.patients ?? 0),
      deaths: Number(r.deaths ?? 0),
      regionId,
    }));

    const selectedRow =
      normalized.find((x) => x.province === selectedProv.province_name_th) ?? {
        province: selectedProv.province_name_th,
        patients: 0,
        deaths: 0,
        regionId,
      };

    // === คำนวณอันดับของจังหวัดที่เลือก (ตามจำนวนผู้ป่วย) ===
    const byPatientsDesc = [...normalized].sort((a, b) => b.patients - a.patients);
    const selectedIdx = byPatientsDesc.findIndex(
      (x) => x.province === selectedProv.province_name_th
    );
    const selectedPatientsRank = selectedIdx >= 0 ? selectedIdx + 1 : undefined;

    // Top 5 ของภาค (ไม่รวมจังหวัดที่เลือก)
    const others = normalized.filter((x) => x.province !== selectedProv.province_name_th);

    const topPatients = [...others].sort((a, b) => b.patients - a.patients).slice(0, 5);
    const topDeaths = [...others].sort((a, b) => b.deaths - a.deaths).slice(0, 5);

    const selectedProvinceExtra =
      selectedPatientsRank && selectedPatientsRank > 5
        ? {
            province: selectedProv.province_name_th,
            patients: selectedRow.patients,
            rank: selectedPatientsRank,
            regionId,
          }
        : undefined;

    return NextResponse.json(
      {
        regionId,
        selected: { ...selectedRow, patientsRank: selectedPatientsRank },
        topPatients,
        topDeaths,
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
