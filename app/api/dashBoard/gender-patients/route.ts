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

async function resolveProvinceId(provinceParam: string) {
  const p = provinceParam.trim();

  // ส่งเป็นเลข -> province_id
  if (/^\d+$/.test(p)) return Number(p);

  // ส่งเป็นชื่อจังหวัดไทย -> map เป็น province_id
  const found = await db
    .selectFrom("provinces")
    .select("province_id")
    .where("province_name_th", "=", p)
    .executeTakeFirst();

  return found?.province_id ?? null;
}

/** ✅ mapping คอลัมน์วันเริ่มป่วยตาม schema (ไม่แตะ DB) */
const CASE_DATE_COL = process.env.DB_CASE_DATE_COL || "onset_date_parsed";
const CASE_DATE_CAST = (process.env.DB_CASE_DATE_CAST || "").trim();

function dateExpr(tableAlias: string, col: string, cast: string) {
  const ref = sql.ref(`${tableAlias}.${col}`);
  if (!cast) return ref;
  return sql`${ref}::${sql.raw(cast)}`;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const startDate = parseDateOrFallback(params.get("start_date"), "2024-01-01");
    const endDate = parseDateOrFallback(params.get("end_date"), "2024-12-31");
    const province = params.get("province");

    if (!province || !province.trim()) {
      return NextResponse.json({ error: "ต้องระบุ province" }, { status: 400 });
    }

    const provinceId = await resolveProvinceId(province);
    if (!provinceId) {
      return NextResponse.json({ error: `ไม่พบจังหวัด: ${province}` }, { status: 404 });
    }

    const caseDate = dateExpr("ic", CASE_DATE_COL, CASE_DATE_CAST);

    // 📊 Query ผู้ป่วย grouped by gender
    const rows = await db
      .selectFrom("influenza_cases as ic")
      .select(["ic.gender as gender", sql<number>`COUNT(*)`.as("patients")])
      .where(caseDate, ">=", startDate)
      .where(caseDate, "<=", endDate)
      .where("ic.province_id", "=", provinceId)
      .groupBy("ic.gender")
      .execute();

    let male = 0;
    let female = 0;
    let unknown = 0;

    for (const r of rows as any[]) {
      const g = String(r.gender ?? "").trim().toLowerCase();
      if (g === "m" || g === "male" || g === "ชาย") male += Number(r.patients);
      else if (g === "f" || g === "female" || g === "หญิง") female += Number(r.patients);
      else unknown += Number(r.patients);
    }

    // เก็บ province ที่ส่งมาเดิมไว้ให้ UI ใช้ต่อเหมือนเดิม
    return NextResponse.json([{ province, male, female, unknown }]);
  } catch (err) {
    console.error("❌ API ERROR (gender-patients):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
