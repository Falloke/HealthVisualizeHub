// D:\HealtRiskHub\lib\kysely3\resolveDiseaseId.ts
import db from "@/lib/kysely3/db";
import { sql } from "kysely";

/**
 * Resolver แบบทน:
 * - ตารางโรคอาจอยู่ public.diseases (ไม่ใช่ ref.diseases)
 * - PK อาจชื่อ id หรือ disease_id
 * - code อาจชื่อ disease_code หรือ code
 */
const DISEASE_TABLE = (process.env.DB_DISEASE_TABLE || "diseases").trim();
const ENV_ID_COL = (process.env.DB_DISEASE_ID_COL || "disease_id").trim();
const ENV_CODE_COL = (process.env.DB_DISEASE_CODE_COL || "disease_code").trim();

type RowOut = { disease_id: number };

async function tryResolve(idCol: string, codeCol: string, diseaseCode: string) {
  const row = await db
    // ใช้ any เพื่อให้เลือก table/column แบบ dynamic
    .selectFrom(DISEASE_TABLE as any)
    .select([sql.ref(idCol).as("disease_id")])
    .where(sql.ref(codeCol) as any, "=", diseaseCode)
    .executeTakeFirst();

  const v = (row as unknown as RowOut | undefined)?.disease_id;
  return typeof v === "number" ? v : null;
}

export async function resolveDiseaseId(diseaseCode: string) {
  const code = (diseaseCode || "").trim();
  if (!code) return null;

  // ✅ ลองตาม ENV ก่อน แล้วค่อย fallback
  const attempts: Array<[string, string]> = [
    [ENV_ID_COL, ENV_CODE_COL],
    ["disease_id", "disease_code"],
    ["id", "disease_code"],
    ["disease_id", "code"],
    ["id", "code"],
  ];

  for (const [idCol, codeCol] of attempts) {
    try {
      const id = await tryResolve(idCol, codeCol, code);
      if (id != null) return id;
    } catch {
      // เงียบไว้เพื่อให้ลองตัวถัดไป
    }
  }

  return null;
}
