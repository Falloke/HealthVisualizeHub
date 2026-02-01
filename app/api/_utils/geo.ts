// app/api/_utils/geo.ts
import { sql, type Kysely } from "kysely";

function sanitizeTableName(name: string) {
  if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return name;
}
function tableSql(name: string) {
  const safe = sanitizeTableName(name);
  const parts = safe.split(".");
  const quoted = parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
  return sql.raw(quoted);
}

// ✅ ของคุณอยู่ schema ref แน่ ๆ
const PROVINCE_TABLE = "ref.provinces_moph";
const REGIONS_TABLE = "ref.regions_moph";

export async function resolveProvinceNo(db: Kysely<any>, provinceParam: string) {
  const p = (provinceParam || "").trim();
  if (!p) return null;

  // ส่งมาเป็นเลข -> province_no
  if (/^\d+$/.test(p)) return Number(p);

  const r = await sql<{ id: number }>`
    SELECT province_no as id
    FROM ${tableSql(PROVINCE_TABLE)}
    WHERE province_name_th = ${p}
    LIMIT 1
  `.execute(db);

  return r.rows?.[0]?.id ?? null;
}

export async function getProvinceMeta(db: Kysely<any>, provinceNo: number) {
  const r = await sql<{
    province_no: number;
    province_name_th: string;
    region_id: number | null;
    region_moph: string;
  }>`
    SELECT province_no, province_name_th, region_id, region_moph
    FROM ${tableSql(PROVINCE_TABLE)}
    WHERE province_no = ${provinceNo}
    LIMIT 1
  `.execute(db);

  return r.rows?.[0] ?? null;
}

export async function getRegionMeta(db: Kysely<any>, regionId: number) {
  const r = await sql<{
    region_id: number;
    region_name_th: string;
    display_order: number | null;
  }>`
    SELECT region_id, region_name_th, display_order
    FROM ${tableSql(REGIONS_TABLE)}
    WHERE region_id = ${regionId}
    LIMIT 1
  `.execute(db);

  return r.rows?.[0] ?? null;
}
