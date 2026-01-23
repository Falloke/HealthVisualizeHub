import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type GenderCounts = { male: number; female: number; unknown: number };
type GenderSummary = { province: string } & GenderCounts;

type APIResp = {
  ok: boolean;
  main?: GenderSummary;
  compare?: GenderSummary;
  error?: string;
};

// -------------------- Date helpers --------------------
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

// -------------------- Disease helpers --------------------
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
    const n = String(Number(digits));
    const pad2 = n.padStart(2, "0");
    const pad3 = n.padStart(3, "0");

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

async function resolveDiseaseCode(diseaseParam: string) {
  const raw = (diseaseParam || "").trim();
  if (!raw) return null;

  const candidates = diseaseCandidates(raw);

  const byCode = await db
    .selectFrom("diseases")
    .select(["code"])
    .where("code", "in", candidates as any)
    .executeTakeFirst();

  if ((byCode as any)?.code) return String((byCode as any).code);

  const byName = await db
    .selectFrom("diseases")
    .select(["code"])
    .where((eb) =>
      eb.or([
        eb("name_th", "in", candidates as any),
        eb("name_en", "in", candidates as any),
      ])
    )
    .executeTakeFirst();

  if ((byName as any)?.code) return String((byName as any).code);

  return raw;
}

// -------------------- fact table resolver --------------------
function isSafeIdent(s: string) {
  return /^[a-z0-9_]+$/i.test(String(s || "").trim());
}

async function resolveFactTableByDisease(
  diseaseParam: string
): Promise<{ schema: string; table: string } | null> {
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

// -------------------- Query --------------------
async function queryGenderPatients(opts: {
  start_date: string;
  end_date: string;
  provinceNameTh: string;
  disease: string;
}): Promise<GenderCounts> {
  const startYMD = parseYMDOrFallback(opts.start_date, "2024-01-01");
  const endYMD = parseYMDOrFallback(opts.end_date, "2024-12-31");

  const startDate = ymdToUTCStart(startYMD);
  const endDate = ymdToUTCEnd(endYMD);

  const fact = await resolveFactTableByDisease(opts.disease);
  if (!fact) return { male: 0, female: 0, unknown: 0 };

  const resolved = await resolveDiseaseCode(opts.disease);
  if (!resolved) return { male: 0, female: 0, unknown: 0 };

  const diseaseIn = diseaseCandidates(resolved);
  if (diseaseIn.length === 0) return { male: 0, female: 0, unknown: 0 };

  const g = sql`LOWER(TRIM(COALESCE(ic.gender, '')))`;

  const row = await (db as any)
    .withSchema(fact.schema)
    .selectFrom(`${fact.table} as ic` as any)
    .select(() => [
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('m','male','ชาย'))::int`.as("male"),
      sql<number>`COUNT(*) FILTER (WHERE ${g} IN ('f','female','หญิง'))::int`.as(
        "female"
      ),
      sql<number>`COUNT(*) FILTER (
        WHERE ${g} NOT IN ('m','male','ชาย','f','female','หญิง')
      )::int`.as("unknown"),
    ])
    .where("ic.province", "=", opts.provinceNameTh)
    .where("ic.disease_code", "in", diseaseIn as any)
    .where("ic.onset_date_parsed", ">=", startDate)
    .where("ic.onset_date_parsed", "<=", endDate)
    .executeTakeFirst();

  return {
    male: Number((row as any)?.male ?? 0),
    female: Number((row as any)?.female ?? 0),
    unknown: Number((row as any)?.unknown ?? 0),
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    const start_date = sp.get("start_date") ?? "2024-01-01";
    const end_date = sp.get("end_date") ?? "2024-12-31";
    const mainProvince = (sp.get("mainProvince") ?? "").trim();
    const compareProvince = (sp.get("compareProvince") ?? "").trim();
    const disease = (sp.get("disease") || sp.get("diseaseCode") || "").trim();

    if (!mainProvince || !compareProvince || !disease) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince, compareProvince และ disease ให้ครบ" },
        { status: 400 }
      );
    }

    const [mainCounts, compareCounts] = await Promise.all([
      queryGenderPatients({ start_date, end_date, provinceNameTh: mainProvince, disease }),
      queryGenderPatients({
        start_date,
        end_date,
        provinceNameTh: compareProvince,
        disease,
      }),
    ]);

    return NextResponse.json<APIResp>(
      {
        ok: true,
        main: { province: mainProvince, ...mainCounts },
        compare: { province: compareProvince, ...compareCounts },
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e: any) {
    console.error("❌ API ERROR (compareInfo/gender-patients):", e);
    return NextResponse.json<APIResp>(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
