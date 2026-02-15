import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely4/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SummaryResp = {
  totalPatients: number;
  avgPatientsPerDay: number;
  cumulativePatients: number;
};

function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test((s ?? "").trim());
}

function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

function pickStartDate(params: URLSearchParams, fallback: string) {
  return parseYMDOrFallback(
    params.get("start_date") || params.get("startDate") || params.get("start"),
    fallback
  );
}

function pickEndDate(params: URLSearchParams, fallback: string) {
  return parseYMDOrFallback(
    params.get("end_date") || params.get("endDate") || params.get("end"),
    fallback
  );
}

function daysInclusiveYMD(startYMD: string, endYMD: string) {
  const [sy, sm, sd] = startYMD.split("-").map(Number);
  const [ey, em, ed] = endYMD.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const ms = end - start;
  const d = Math.floor(ms / 86400000) + 1;
  return Math.max(1, d);
}

/**
 * รองรับ province เป็น:
 * - เลข (province_no)
 * - ชื่อไทย (province_name_th)
 */
async function resolveProvinceNameOrNull(provinceParam: string): Promise<string | null> {
  const p = (provinceParam ?? "").trim();
  if (!p) return null;

  if (/^\d+$/.test(p)) {
    const found = await db
      .selectFrom(sql`ref.provinces_moph`.as("p"))
      .select(sql<string>`p.province_name_th`.as("province_name_th"))
      .where(sql<number>`p.province_no`, "=", Number(p))
      .executeTakeFirst();

    return (found?.province_name_th ?? "").trim() || null;
  }

  const found = await db
    .selectFrom(sql`ref.provinces_moph`.as("p"))
    .select(sql<string>`p.province_name_th`.as("province_name_th"))
    .where(sql<string>`p.province_name_th`, "=", p)
    .executeTakeFirst();

  return (found?.province_name_th ?? "").trim() || null;
}

/**
 * map disease -> schema.table จาก disease_fact_tables
 * ถ้าไม่เจอ จะ fallback ตามโค้ดพื้นฐาน
 */
async function resolveFactTable(
  diseaseCode: string
): Promise<{ schema: string; table: string } | null> {
  const d = (diseaseCode ?? "").trim();
  if (!d) return null;

  try {
    const row = await (db as any)
      .selectFrom("disease_fact_tables as dft")
      .select(["dft.schema_name as schema_name", "dft.table_name as table_name", "dft.is_active as is_active"])
      .where("dft.disease_code", "=", d)
      .where("dft.is_active", "=", true)
      .executeTakeFirst();

    const schema = String((row as any)?.schema_name ?? "").trim();
    const table = String((row as any)?.table_name ?? "").trim();

    if (!schema || !table) return null;
    if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

    return { schema, table };
  } catch {
    // ตาราง map อาจยังไม่มีในบาง env
    return null;
  }
}

function fallbackTableFromDisease(diseaseCode: string): { schema: string; table: string } {
  const d = (diseaseCode ?? "").trim().toUpperCase();

  // ปรับ mapping เพิ่มเองได้ตามโปรเจกต์
  if (d === "D01" || d.includes("INFLUENZA") || d.includes("FLU")) {
    return { schema: "public", table: "d01_influenza" };
  }

  // default fallback
  return { schema: "public", table: "d01_influenza" };
}

async function getCountsFromFactTable(opts: {
  schema: string;
  table: string;
  provinceName: string;
  startDate: string;
  endDate: string;
}) {
  const schema = opts.schema.trim();
  const table = opts.table.trim();

  if (!isSafeIdent(schema) || !isSafeIdent(table)) {
    throw new Error(`Invalid schema/table: ${schema}.${table}`);
  }

  const fqTable = sql`${sql.ref(`${schema}.${table}`)}`;
  const provinceName = opts.provinceName.trim();

  // ✅ in-range (ผู้ป่วยในช่วงวันที่เลือก)
  const inRange = await (db as any)
    .selectFrom(fqTable.as("ic"))
    .select((eb: any) => [eb.fn.countAll().as("total_patients")])
    .where(sql`DATE(${sql.ref("ic.onset_date_parsed")}) >= ${opts.startDate}`)
    .where(sql`DATE(${sql.ref("ic.onset_date_parsed")}) <= ${opts.endDate}`)
    .where(sql`btrim(${sql.ref("ic.province")}) = ${provinceName}`)
    .executeTakeFirst();

  const totalPatients = Number((inRange as any)?.total_patients ?? 0);

  // ✅ cumulative (สะสมทั้งตารางของจังหวัดนั้น)
  const cum = await (db as any)
    .selectFrom(fqTable.as("ic"))
    .select((eb: any) => [eb.fn.countAll().as("cumulative_patients")])
    .where(sql`btrim(${sql.ref("ic.province")}) = ${provinceName}`)
    .executeTakeFirst();

  const cumulativePatients = Number((cum as any)?.cumulative_patients ?? 0);

  return { totalPatients, cumulativePatients };
}

export async function GET(request: NextRequest) {
  const zero: SummaryResp = {
    totalPatients: 0,
    avgPatientsPerDay: 0,
    cumulativePatients: 0,
  };

  try {
    const params = request.nextUrl.searchParams;

    const provinceParam = (
      params.get("province") ||
      params.get("prov") ||
      params.get("p") ||
      ""
    ).trim();

    if (!provinceParam) {
      return NextResponse.json(zero, { status: 200 });
    }

    const todayYMD = new Date().toISOString().slice(0, 10);
    const startDate = pickStartDate(params, todayYMD);
    const endDate = pickEndDate(params, todayYMD);

    const provinceName = await resolveProvinceNameOrNull(provinceParam);
    if (!provinceName) {
      return NextResponse.json(zero, { status: 200 });
    }

    const diseaseCode = pickDisease(params) || "D01";

    // 1) ลองจาก disease_fact_tables
    // 2) ถ้าไม่เจอ fallback
    const resolved =
      (await resolveFactTable(diseaseCode)) || fallbackTableFromDisease(diseaseCode);

    const { totalPatients, cumulativePatients } = await getCountsFromFactTable({
      schema: resolved.schema,
      table: resolved.table,
      provinceName,
      startDate,
      endDate,
    });

    const avgPatientsPerDay = Math.round(
      totalPatients / daysInclusiveYMD(startDate, endDate)
    );

    return NextResponse.json(
      { totalPatients, avgPatientsPerDay, cumulativePatients },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("❌ API ERROR (patients-summary):", error);
    return NextResponse.json(zero, { status: 200 });
  }
}
