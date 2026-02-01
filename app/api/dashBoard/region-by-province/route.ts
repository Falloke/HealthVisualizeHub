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

/**
 * ✅ Resolve จังหวัดจาก ref.provinces_moph
 */
async function resolveProvince(provinceParam: string) {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const row = await db
      .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_id"),
        sql<string>`p.province_name_th`.as("province_name_th"),
        sql<number>`p.region_id`.as("region_id"),
      ])
      .where(sql`p.province_no`, "=", Number(p))
      .executeTakeFirst();
    return row as any;
  }

  const row = await db
    .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
    .select([
      sql<number>`p.province_no`.as("province_id"),
      sql<string>`p.province_name_th`.as("province_name_th"),
      sql<number>`p.region_id`.as("region_id"),
    ])
    .where(sql`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return row as any;
}

function parseIntOrNull(input: string | null) {
  const s = (input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** รองรับ disease_id เป็นเลข หรือจะไม่ส่งมาก็ได้ */
async function resolveDiseaseId(params: URLSearchParams) {
  const diseaseId = parseIntOrNull(params.get("disease_id"));
  if (diseaseId != null) return diseaseId;

  const code = (params.get("disease_code") || params.get("disease") || "").trim();
  if (!code) return null;

  const row = await db
    .selectFrom("diseases")
    .select(["disease_id"])
    .where("disease_code", "=", code)
    .executeTakeFirst();

  return row?.disease_id ?? null;
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

    const diseaseId = await resolveDiseaseId(params);

    // ✅ จังหวัดทั้งหมดในภาคเดียวกัน (จาก ref.provinces_moph)
    const provincesInRegion = await db
      .selectFrom(sql`"ref"."provinces_moph"`.as("p"))
      .select([
        sql<number>`p.province_no`.as("province_id"),
        sql<string>`p.province_name_th`.as("province_name_th"),
      ])
      .where(sql`p.region_id`, "=", regionId)
      .execute();

    const provinceIds = (provincesInRegion as any[]).map((x) => Number(x.province_id));

    // ✅ รวมยอดผู้ป่วย/เสียชีวิตจาก MV รายวันระดับจังหวัด
    // ✅ ระบุ schema ชัดเจน: method_e.mv_daily_province
    let q = db
      .selectFrom(sql`"method_e"."mv_daily_province"`.as("m"))
      .innerJoin(sql`"ref"."provinces_moph"`.as("p"), sql`p.province_no`, "m.province_id")
      .select([
        sql<string>`p.province_name_th`.as("province"),
        sql<number>`COALESCE(SUM(m.daily_patients),0)`.as("patients"),
        sql<number>`COALESCE(SUM(m.daily_deaths),0)`.as("deaths"),
      ])
      .where("m.onset_date", ">=", startDate)
      .where("m.onset_date", "<=", endDate)
      .where("m.province_id", "in", provinceIds)
      .groupBy(sql`p.province_name_th`);

    if (diseaseId != null) q = q.where("m.disease_id", "=", diseaseId);

    const rows = await q.execute();

    const normalized = (rows as any[]).map((r) => ({
      province: String(r.province),
      patients: Number(r.patients ?? 0),
      deaths: Number(r.deaths ?? 0),
      region: String(regionId),
      regionId,
    }));

    const selectedRow =
      normalized.find((x) => x.province === selectedProv.province_name_th) ?? {
        province: selectedProv.province_name_th,
        patients: 0,
        deaths: 0,
        region: String(regionId),
        regionId,
      };

    // อันดับตามผู้ป่วย
    const byPatientsDesc = [...normalized].sort((a, b) => b.patients - a.patients);
    const selectedIdx = byPatientsDesc.findIndex(
      (x) => x.province === selectedProv.province_name_th
    );
    const selectedPatientsRank = selectedIdx >= 0 ? selectedIdx + 1 : undefined;

    // ---- Top 5 (ไม่รวมจังหวัดที่เลือก) สำหรับกราฟผู้ป่วย ----
    const others = normalized.filter((x) => x.province !== selectedProv.province_name_th);
    const topPatients = [...others].sort((a, b) => b.patients - a.patients).slice(0, 5);

    // ---- ✅ Top 5 ตามผู้เสียชีวิต: ต้อง “รวมจังหวัดที่เลือก” ด้วย ----
    const deathsList = [...others, selectedRow]; // ใส่ selected กลับเข้ามา
    const topDeaths = [...deathsList].sort((a, b) => b.deaths - a.deaths).slice(0, 5);

    const selectedProvinceExtra =
      selectedPatientsRank && selectedPatientsRank > 5
        ? {
            province: selectedProv.province_name_th,
            patients: selectedRow.patients,
            rank: selectedPatientsRank,
            region: String(regionId),
          }
        : undefined;

    return NextResponse.json(
      {
        regionId,
        region: String(regionId),
        selected: {
          ...selectedRow,
          patientsRank: selectedPatientsRank,
          region: String(regionId),
        },
        topPatients,
        topDeaths, // ✅ เพิ่มให้กราฟ deaths ใช้
        selectedProvince: selectedProvinceExtra,
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (region-by-province):", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
