// lib/kysely/resolveFactTable.ts
import db from "@/lib/kysely/db";

export type FactTableRef = {
  schema: string;
  table: string;
  fq: string; // schema.table
};

/** รองรับทั้ง D01, d01, 01, 1, 001 */
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

    // เลขล้วน
    set.add(n);
    set.add(pad2);
    set.add(pad3);

    // มี D/d นำหน้า
    set.add(`D${n}`);
    set.add(`D${pad2}`);
    set.add(`D${pad3}`);

    set.add(`d${n}`);
    set.add(`d${pad2}`);
    set.add(`d${pad3}`);
  }

  return Array.from(set).filter(Boolean);
}

/** ✅ กัน injection */
function safeIdentOrThrow(v: unknown, name: string) {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`${name} ว่าง`);
  if (!/^[a-z0-9_]+$/i.test(s)) throw new Error(`${name} ไม่ถูกต้อง`);
  return s;
}

/**
 * ✅ ดึง table_name + schema_name จาก disease_fact_tables ตาม disease_code (active เท่านั้น)
 * คืนเป็น { schema, table, fq }
 */
export async function resolveFactTableRefByDisease(disease: string): Promise<FactTableRef> {
  const diseaseIn = diseaseCandidates(disease);
  if (diseaseIn.length === 0) throw new Error("ไม่พบ disease code");

  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["table_name", "schema_name"])
    .where("is_active", "=", true)
    .where("disease_code", "in", diseaseIn as any)
    .executeTakeFirst();

  if (!row?.table_name) {
    throw new Error(`ไม่พบ mapping ของโรค (${disease}) ใน disease_fact_tables`);
  }

  const schema = safeIdentOrThrow(row.schema_name ?? "public", "schema_name");
  const table = safeIdentOrThrow(row.table_name, "table_name");
  return { schema, table, fq: `${schema}.${table}` };
}

/**
 * ✅ ของเดิมยังใช้ได้: คืนเป็น "schema.table"
 */
export async function resolveFactTableByDisease(disease: string) {
  const ref = await resolveFactTableRefByDisease(disease);
  return ref.fq;
}
