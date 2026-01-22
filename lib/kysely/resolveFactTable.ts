// lib/kysely/resolveFactTable.ts
import db from "@/lib/kysely/db";

/** รองรับทั้ง D01, d01, 01 */
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
    set.add(`D${pad2}`);
    set.add(`d${pad2}`);
    set.add(pad2);
  }

  return Array.from(set);
}

/**
 * ✅ ดึง table_name + schema_name จาก disease_fact_tables ตาม disease_code
 * ตัวอย่าง:
 *  - D01 -> public.d01_influenza
 *  - D04 -> public.d04_testttt
 */
export async function resolveFactTableByDisease(disease: string) {
  const diseaseIn = diseaseCandidates(disease);
  if (diseaseIn.length === 0) throw new Error("ไม่พบ disease code");

  // ✅ ดึง mapping ที่ active เท่านั้น
  const row = await (db as any)
    .selectFrom("disease_fact_tables")
    .select(["table_name", "schema_name"])
    .where("is_active", "=", true)
    .where("disease_code", "in", diseaseIn as any)
    .executeTakeFirst();

  const table = (row as any)?.table_name;
  const schema = (row as any)?.schema_name || "public";

  if (!table) {
    throw new Error(
      `ไม่พบ mapping ของโรค (${disease}) ใน disease_fact_tables`
    );
  }

  // ✅ กัน injection
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error("table_name ไม่ถูกต้อง");
  if (!/^[a-z0-9_]+$/i.test(schema)) throw new Error("schema_name ไม่ถูกต้อง");

  return `${schema}.${table}`;
}
