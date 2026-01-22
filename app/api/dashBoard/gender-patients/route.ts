import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// -------------------- utils --------------------
function parseYMDOrFallback(input: string | null, fallback: string) {
  const raw = (input && input.trim()) || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  return raw;
}

function ymdToUTCStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function ymdToUTCEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`);
}

function pickDisease(params: URLSearchParams) {
  return (
    (params.get("disease") ||
      params.get("diseaseCode") ||
      params.get("disease_code") ||
      "")!
  ).trim();
}

/**
 * ✅ รองรับ D01, d01, 1, 01, 001
 * (เผื่อบาง API ส่งมาไม่เหมือนกัน)
 */
function diseaseCandidates(raw: string) {
  const v = (raw || "").trim();
  if (!v) return [];

  const set = new Set<string>();
  set.add(v);
  set.add(v.toUpperCase());

  let digits: string | null = null;
  const m = v.match(/^d(\d+)$/i);
  if (m?.[1]) digits = m[1];
  if (!digits && /^\d+$/.test(v)) digits = v;

  if (digits) {
    const n = String(Number(digits));
    const pad2 = n.padStart(2, "0");
    const pad3 = n.padStart(3, "0");

    set.add(n);
    set.add(pad2);
    set.add(pad3);

    set.add(`D${n}`);
    set.add(`D${pad2}`);
    set.add(`D${pad3}`);
  }

  return Array.from(set);
}

function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(s);
}

/** ✅ resolve table จาก disease_fact_tables */
async function resolveFactTable(diseaseCodeRaw: string): Promise<{ schema: string; table: string } | null> {
  const candidates = diseaseCandidates(diseaseCodeRaw);
  if (candidates.length === 0) return null;

  // 👉 เลือกตัวที่ตรงจริงก่อน เช่น D01
  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active", "disease_code"])
    .where("disease_code", "in", candidates as any)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  if (!schema || !table) return null;
  if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

  return { schema, table };
}

// -------------------- route --------------------
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const startYMD = parseYMDOrFallback(params.get("start_date"), "2024-01-01");
    const endYMD = parseYMDOrFallback(params.get("end_date"), "2024-12-31");

    const startDate = ymdToUTCStart(startYMD);
    const endDate = ymdToUTCEnd(endYMD);

    const provinceRaw = (params.get("province") || "").trim();
    const diseaseCode = pickDisease(params);

    // ✅ ยังไม่เลือกจังหวัด -> คืน 0
    if (!provinceRaw) {
      return NextResponse.json(
        [{ province: "", male: 0, female: 0, unknown: 0 }],
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ✅ ยังไม่เลือกโรค -> คืน 0
    if (!diseaseCode) {
      return NextResponse.json(
        [{ province: provinceRaw, male: 0, female: 0, unknown: 0 }],
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const fact = await resolveFactTable(diseaseCode);
    if (!fact) {
      return NextResponse.json(
        [{ province: provinceRaw, male: 0, female: 0, unknown: 0 }],
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const rows = await (db as any)
      .withSchema(fact.schema)
      .selectFrom(`${fact.table} as ic` as any)
      .select([
        sql<string>`ic.gender`.as("gender"),
        sql<number>`COUNT(*)::int`.as("patients"),
      ])
      .where("ic.onset_date_parsed", ">=", startDate)
      .where("ic.onset_date_parsed", "<=", endDate)
      .where("ic.province", "=", provinceRaw)
      .where("ic.disease_code", "in", diseaseCandidates(diseaseCode) as any)
      .groupBy(sql`ic.gender`)
      .execute();

    let male = 0;
    let female = 0;
    let unknown = 0;

    for (const r of rows as any[]) {
      const g = String(r.gender ?? "").trim().toLowerCase();
      if (g === "m" || g === "male" || g === "ชาย") male += Number(r.patients || 0);
      else if (g === "f" || g === "female" || g === "หญิง") female += Number(r.patients || 0);
      else unknown += Number(r.patients || 0);
    }

    return NextResponse.json(
      [{ province: provinceRaw, male, female, unknown }],
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ API ERROR (gender-patients):", err);
    return NextResponse.json(
      [{ province: "", male: 0, female: 0, unknown: 0 }],
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
