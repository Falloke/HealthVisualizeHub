import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely/db";

export const runtime = "nodejs";

type AgeRow = { ageRange: string; patients: number };

type RowMerged = {
  ageRange: string;
  mainPatients: number;
  comparePatients: number;
};

const AGE_ORDER = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-44", "45-59", "60+"] as const;
const AGE_SET = new Set<string>(AGE_ORDER as unknown as string[]);

function parseDateOrThrow(v: string, name: string): Date {
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${name}: ${v}`);
  return d;
}

function normalizeAgeRange(v: unknown): string {
  return String(v ?? "").trim();
}

function orderIndex(range: string): number {
  const i = (AGE_ORDER as unknown as string[]).indexOf(range);
  return i === -1 ? 999 : i;
}

function mergeAgeData(main: AgeRow[], compare: AgeRow[]): RowMerged[] {
  const mainMap = new Map<string, number>();
  const compareMap = new Map<string, number>();
  const extra = new Set<string>();

  for (const r of main ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.patients ?? 0);
    mainMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  for (const r of compare ?? []) {
    const k = normalizeAgeRange(r.ageRange);
    const v = Number(r.patients ?? 0);
    compareMap.set(k, Number.isFinite(v) ? v : 0);
    if (!AGE_SET.has(k)) extra.add(k);
  }

  const base: RowMerged[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    mainPatients: mainMap.get(k) ?? 0,
    comparePatients: compareMap.get(k) ?? 0,
  }));

  const extras = Array.from(extra.values())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({
      ageRange: k,
      mainPatients: mainMap.get(k) ?? 0,
      comparePatients: compareMap.get(k) ?? 0,
    }));

  return base.concat(extras);
}

/** ✅ รองรับ D01 / 01 / 1 / 001 / d01 */
function diseaseCandidates(raw: string) {
  const v = (raw || "").trim();
  if (!v) return [];

  const set = new Set<string>();
  set.add(v);
  set.add(v.toUpperCase());
  set.add(v.toLowerCase());

  let digits: string | null = null;
  const m = v.match(/^d(\d+)$/i);
  if (m?.[1]) digits = m[1];
  if (!digits && /^\d+$/.test(v)) digits = v;

  if (digits) {
    const n = String(Number(digits)); // "01" -> "1"
    const pad2 = n.padStart(2, "0"); // "1" -> "01"
    const pad3 = n.padStart(3, "0"); // "1" -> "001"

    set.add(n);
    set.add(pad2);
    set.add(pad3);

    set.add(`D${n}`);
    set.add(`D${pad2}`);
    set.add(`D${pad3}`);

    set.add(`d${n}`);
    set.add(`d${pad2}`);
    set.add(`d${pad3}`);
  }

  return Array.from(set).filter(Boolean);
}

/** ✅ resolve code จากตาราง diseases (code/name_th/name_en) */
async function resolveDiseaseCode(diseaseParam: string) {
  const raw = (diseaseParam || "").trim();
  if (!raw) return null;

  const candidates = diseaseCandidates(raw);

  // 1) match ด้วย code
  const byCode = await db
    .selectFrom("diseases")
    .select(["code"])
    .where("code", "in", candidates)
    .executeTakeFirst();

  if ((byCode as any)?.code) return String((byCode as any).code);

  // 2) match ด้วยชื่อ TH/EN
  const byName = await db
    .selectFrom("diseases")
    .select(["code"])
    .where((eb) =>
      eb.or([
        eb("name_th", "in", candidates),
        eb("name_en", "in", candidates),
      ])
    )
    .executeTakeFirst();

  if ((byName as any)?.code) return String((byName as any).code);

  // 3) fallback เป็น raw
  return raw;
}

/** ✅ ป้องกัน SQL injection: schema/table ต้องเป็น identifier ปลอดภัย */
function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(String(s || "").trim());
}

/** ✅ resolve fact table จาก public.disease_fact_tables */
async function resolveFactTableByDisease(diseaseParam: string): Promise<{ schema: string; table: string } | null> {
  const resolved = await resolveDiseaseCode(diseaseParam);
  if (!resolved) return null;

  const candidates = diseaseCandidates(resolved);
  if (candidates.length === 0) return null;

  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["schema_name", "table_name", "is_active"])
    .where("disease_code", "in", candidates as any)
    .where("is_active", "=", true)
    .executeTakeFirst();

  const schema = String((row as any)?.schema_name || "").trim();
  const table = String((row as any)?.table_name || "").trim();

  if (!schema || !table) return null;
  if (!isSafeIdent(schema) || !isSafeIdent(table)) return null;

  return { schema, table };
}

async function queryAgePatients(args: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<AgeRow[]> {
  const start = parseDateOrThrow(args.start_date, "start_date");
  const end = parseDateOrThrow(args.end_date, "end_date");

  const fact = await resolveFactTableByDisease(args.disease);
  if (!fact) return [];

  // ✅ ทำ candidates เผื่อ data เก็บหลายแบบ
  const resolved = await resolveDiseaseCode(args.disease);
  if (!resolved) return [];
  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0) return [];

  const ageCase = sql<string>`
    CASE
      WHEN ic.age_y BETWEEN 0 AND 4 THEN '0-4'
      WHEN ic.age_y BETWEEN 5 AND 9 THEN '5-9'
      WHEN ic.age_y BETWEEN 10 AND 14 THEN '10-14'
      WHEN ic.age_y BETWEEN 15 AND 19 THEN '15-19'
      WHEN ic.age_y BETWEEN 20 AND 24 THEN '20-24'
      WHEN ic.age_y BETWEEN 25 AND 44 THEN '25-44'
      WHEN ic.age_y BETWEEN 45 AND 59 THEN '45-59'
      WHEN ic.age_y >= 60 THEN '60+'
      ELSE NULL
    END
  `.as("ageRange");

  const rows = await (db as any)
    .withSchema(fact.schema)
    .selectFrom(`${fact.table} as ic` as any)
    .select([ageCase, sql<number>`COUNT(*)::int`.as("patients")])
    .where("ic.province", "=", args.provinceNameTh)
    .where("ic.onset_date_parsed", ">=", start)
    .where("ic.onset_date_parsed", "<=", end)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where(sql`ic.age_y IS NOT NULL`)
    .groupBy("ageRange")
    .execute();

  // ทำให้ “ครบทุกช่วง” เสมอ
  const map = new Map<string, number>();
  for (const r of rows as any[]) {
    const k = String(r.ageRange ?? "").trim();
    if (!k) continue;
    map.set(k, Number(r.patients ?? 0));
  }

  const ordered: AgeRow[] = (AGE_ORDER as unknown as string[]).map((k) => ({
    ageRange: k,
    patients: map.get(k) ?? 0,
  }));

  const extras = Array.from(map.keys())
    .filter((k) => !AGE_SET.has(k))
    .sort((a, b) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map((k) => ({ ageRange: k, patients: map.get(k) ?? 0 }));

  return ordered.concat(extras);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "";
    const end_date = sp.get("end_date") ?? "";
    const mainProvince = sp.get("mainProvince") ?? "";
    const compareProvince = sp.get("compareProvince") ?? "";
    const disease = (sp.get("disease") || sp.get("diseaseCode") || "").trim();

    if (!start_date || !end_date || !mainProvince || !compareProvince || !disease) {
      return NextResponse.json(
        {
          error:
            "missing required query params (start_date,end_date,mainProvince,compareProvince,disease)",
        },
        { status: 400 }
      );
    }

    const [mainRows, compareRows] = await Promise.all([
      queryAgePatients({ start_date, end_date, provinceNameTh: mainProvince, disease }),
      queryAgePatients({ start_date, end_date, provinceNameTh: compareProvince, disease }),
    ]);

    const merged = mergeAgeData(mainRows, compareRows);

    return NextResponse.json(merged, {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    console.error("❌ [compareInfo/age-group] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
