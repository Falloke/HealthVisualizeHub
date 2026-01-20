import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";

// ✅ ใช้ตัว db ที่โปรเจกต์ใช้อยู่
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ปรับได้ตามต้องการ (MB)
const MAX_UPLOAD_MB = Number(process.env.ADMIN_IMPORT_MAX_MB || 200);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// จำกัด error ที่ส่งกลับ (กัน response ใหญ่)
const MAX_ERROR_RETURN = 500;

// batch insert size
const BATCH_SIZE = 2000;

type ImportErrorItem = { line: number; message: string };

type ImportResp =
  | {
      ok: true;
      inserted: number;
      skipped: number;
      totalRows: number;
      warnings?: string[];
      tableName: string;
      diseaseCode: string;
    }
  | {
      ok: false;
      error: string;
      errors?: ImportErrorItem[];
      detail?: string;
    };

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function normalizeHeader(s: string): string {
  return String(s || "")
    .replace(/^\uFEFF/, "") // ✅ BOM
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** CSV line parser ที่รองรับ quoted fields (") แบบพื้นฐาน */
function parseCSVLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // ถ้าเจอ "" ใน quoted -> เป็น "
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** แปลงเป็น string|null */
function toNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;

  const lo = s.toLowerCase();
  if (s === "-" || lo === "null" || lo === "n/a" || lo === "na") return null;

  return s;
}

/** แปลงเลข (int) */
function toNullableInt(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return Number.isFinite(i) ? i : null;
}

/** เช็คว่าวันที่ valid จริง */
function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
    return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** สร้าง ISO yyyy-mm-dd */
function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(
    2,
    "0"
  )}-${String(d).padStart(2, "0")}`;
}

/** Parse วันที่ให้เป็น ISO yyyy-mm-dd รองรับหลายฟอร์แมต */
function parseDateFlexible(input: unknown): string | null {
  if (input == null) return null;

  // Excel serial number
  if (typeof input === "number" && Number.isFinite(input)) {
    const n = input;
    if (n > 20000 && n < 90000) {
      const ms = (n - 25569) * 86400 * 1000;
      const dt = new Date(ms);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // ตัดเวลา (ถ้ามี)
  const s = raw.split(" ")[0].trim();

  // ISO yyyy-mm-dd (รองรับปีพ.ศ.)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    let y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    if (y >= 2400) y -= 543;
    return isValidYMD(y, mo, d) ? toISO(y, mo, d) : null;
  }

  // yyyy/m/d
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    let y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);

    if (y >= 2400) y -= 543;
    return isValidYMD(y, mo, d) ? toISO(y, mo, d) : null;
  }

  // d/m/yyyy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);

    if (y >= 2400) y -= 543;
    return isValidYMD(y, mo, d) ? toISO(y, mo, d) : null;
  }

  // d-m-yyyy
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);

    if (y >= 2400) y -= 543;
    return isValidYMD(y, mo, d) ? toISO(y, mo, d) : null;
  }

  // Excel serial เป็น string
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 20000 && n < 90000) {
      const ms = (n - 25569) * 86400 * 1000;
      const dt = new Date(ms);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }

  return null;
}

type D02Row = {
  id?: number;
  disease_code: string;
  gender?: string | null;
  age_y?: number | null;
  nationality?: string | null;
  occupation?: string | null;
  province?: string | null;
  district?: string | null;

  onset_date?: string | null;
  treated_date?: string | null;
  diagnosis_date?: string | null;
  death_date?: string | null;

  onset_date_parsed: string; // ✅ required
  treated_date_parsed?: string | null;
  diagnosis_date_parsed?: string | null;
  death_date_parsed?: string | null;
};

function pick(obj: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

// ✅ validate diseaseCode เช่น D01, D02, D10
function normalizeDiseaseCode(input: unknown): string | null {
  const s = String(input ?? "").trim().toUpperCase();
  if (!s) return null;
  if (!/^D\d{2}$/.test(s)) return null;
  return s;
}

// ✅ validate tableName เช่น d01_influenza (ห้ามมี schema/จุด)
function normalizeTableName(input: unknown): string | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes(".")) return null; // กัน public.xxx
  if (!/^[a-z0-9_]+$/.test(s)) return null;
  // ป้องกันชื่อสุ่มๆ แนะนำให้เริ่ม dxx_
  if (!/^d\d{2}_/.test(s)) return null;
  return s;
}

/**
 * ✅ กัน error: no partition of relation "xxx" found for row
 * ถ้า target table เป็น partitioned parent (relkind='p') และยังไม่มี DEFAULT partition
 * => สร้าง DEFAULT partition ให้อัตโนมัติ
 */
async function ensureDefaultPartitionIfNeeded(trx: any, tableName: string) {
  // เช็คว่าเป็น partitioned parent หรือไม่
  const parent = await sql<{ relkind: string }>`
    SELECT c.relkind
    FROM pg_class c
    WHERE c.oid = ${sql.raw(`to_regclass('${tableName}')`)}::oid
  `.execute(trx);

  const relkind = parent.rows?.[0]?.relkind;
  if (relkind !== "p") return; // ไม่ใช่ partitioned parent => ไม่ต้องทำอะไร

  // เช็คว่ามี default partition อยู่แล้วหรือยัง
  const hasDefault = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_inherits i
      JOIN pg_class child ON child.oid = i.inhrelid
      JOIN pg_class parent ON parent.oid = i.inhparent
      WHERE parent.relname = ${tableName}
        AND child.relispartition = true
        AND pg_get_expr(child.relpartbound, child.oid) = 'DEFAULT'
    ) AS "exists"
  `.execute(trx);

  if (hasDefault.rows?.[0]?.exists) return;

  // ✅ สร้าง DEFAULT partition
  // ชื่อ: <tableName>_default เช่น d04_test_default
  const defaultPartitionName = `${tableName}_default`;

  await sql.raw(
    `CREATE TABLE IF NOT EXISTS "${defaultPartitionName}"
     PARTITION OF "${tableName}" DEFAULT;`
  ).execute(trx);
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const form = await req.formData();

    const file = form.get("file");
    const skipBadRows =
      String(form.get("skipBadRows") ?? "true").toLowerCase() !== "false";

    // ✅ รับค่าจาก frontend
    const diseaseCodeSelected = normalizeDiseaseCode(form.get("diseaseCode"));
    const tableName = normalizeTableName(form.get("tableName"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "ต้องแนบไฟล์ CSV" } satisfies ImportResp,
        { status: 400 }
      );
    }

    if (!diseaseCodeSelected) {
      return NextResponse.json(
        {
          ok: false,
          error: "กรุณาเลือกรหัสโรค (diseaseCode) เช่น D01",
        } satisfies ImportResp,
        { status: 400 }
      );
    }

    if (!tableName) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "กรุณาระบุชื่อ table ปลายทาง (tableName) เช่น d01_influenza",
        } satisfies ImportResp,
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: `ไฟล์ใหญ่เกินไป (เกิน ${MAX_UPLOAD_MB}MB)`,
        } satisfies ImportResp,
        { status: 413 }
      );
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return NextResponse.json(
        { ok: false, error: "ไฟล์ว่าง หรือไม่มีข้อมูล" } satisfies ImportResp,
        { status: 400 }
      );
    }

    // เดา delimiter: ถ้า header มี ; มากกว่า , ให้ใช้ ;
    const headerLine = lines[0];
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semiCount = (headerLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ";" : ",";

    const headersRaw = parseCSVLine(lines[0], delimiter).map(normalizeHeader);

    const errors: ImportErrorItem[] = [];
    const rowsToInsert: D02Row[] = [];

    // start from line 2 (index 1) = ข้อมูลแถวแรก
    for (let i = 1; i < lines.length; i++) {
      const lineNo = i + 1; // 1-based
      const cols = parseCSVLine(lines[i], delimiter);

      const rowObj: Record<string, string> = {};
      for (let c = 0; c < headersRaw.length; c++) {
        const key = headersRaw[c] || `col_${c}`;
        rowObj[key] = cols[c] ?? "";
      }

      // ✅ disease_code: ใช้จาก "ที่เลือกในหน้าเว็บ"
      const disease_code = diseaseCodeSelected;

      const id = toNullableInt(pick(rowObj, "id")) ?? undefined;

      const onset_date_raw = toNullableString(pick(rowObj, "onset_date"));
      const treated_date_raw = toNullableString(pick(rowObj, "treated_date"));
      const diagnosis_date_raw = toNullableString(pick(rowObj, "diagnosis_date"));
      const death_date_raw = toNullableString(pick(rowObj, "death_date"));

      // ✅ onset_date_parsed: หาได้จากหลายคอลัมน์
      const onset_parsed =
        parseDateFlexible(pick(rowObj, "onset_date_parsed")) ??
        parseDateFlexible(onset_date_raw) ??
        parseDateFlexible(pick(rowObj, "diagnosis_date_parsed")) ??
        parseDateFlexible(diagnosis_date_raw) ??
        parseDateFlexible(pick(rowObj, "treated_date_parsed")) ??
        parseDateFlexible(treated_date_raw);

      if (!onset_parsed) {
        errors.push({
          line: lineNo,
          message:
            "หา onset_date_parsed ไม่ได้ (ต้องมี onset_date หรือ onset_date_parsed ที่แปลงเป็นวันที่ได้)",
        });
        continue;
      }

      const treated_parsed =
        parseDateFlexible(pick(rowObj, "treated_date_parsed")) ??
        parseDateFlexible(treated_date_raw);

      const diagnosis_parsed =
        parseDateFlexible(pick(rowObj, "diagnosis_date_parsed")) ??
        parseDateFlexible(diagnosis_date_raw);

      const death_parsed =
        parseDateFlexible(pick(rowObj, "death_date_parsed")) ??
        parseDateFlexible(death_date_raw);

      const gender = toNullableString(pick(rowObj, "gender"));
      const age_y = toNullableInt(pick(rowObj, "age_y")) ?? null;

      const rec: D02Row = {
        ...(id != null ? { id } : {}),
        disease_code,
        gender,
        age_y,
        nationality: toNullableString(pick(rowObj, "nationality")),
        occupation: toNullableString(pick(rowObj, "occupation")),
        province: toNullableString(pick(rowObj, "province")),
        district: toNullableString(pick(rowObj, "district")),

        onset_date: onset_date_raw,
        treated_date: treated_date_raw,
        diagnosis_date: diagnosis_date_raw,
        death_date: death_date_raw,

        onset_date_parsed: onset_parsed,
        treated_date_parsed: treated_parsed,
        diagnosis_date_parsed: diagnosis_parsed,
        death_date_parsed: death_parsed,
      };

      rowsToInsert.push(rec);
    }

    const totalRows = lines.length - 1;
    const badCount = errors.length;

    if (badCount > 0 && !skipBadRows) {
      return NextResponse.json(
        {
          ok: false,
          error: "ข้อมูลบางแถวไม่ผ่านตรวจสอบ",
          errors: errors.slice(0, MAX_ERROR_RETURN),
        } satisfies ImportResp,
        { status: 422 }
      );
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "ไม่มีแถวที่ผ่านตรวจสอบให้ import",
          errors: errors.slice(0, MAX_ERROR_RETURN),
        } satisfies ImportResp,
        { status: 422 }
      );
    }

    // ✅ Insert แบบ batch + transaction + กันชน PK
    await db.transaction().execute(async (trx) => {
      // ✅ สำคัญมาก: กัน no partition found
      await ensureDefaultPartitionIfNeeded(trx, tableName);

      for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
        const batch = rowsToInsert.slice(i, i + BATCH_SIZE);

        await (trx as any)
          .insertInto(tableName) // ✅ dynamic table
          .values(batch as any)
          .onConflict((oc: any) => oc.doNothing())
          .execute();
      }
    });

    return NextResponse.json(
      {
        ok: true,
        inserted: rowsToInsert.length,
        skipped: badCount,
        totalRows,
        warnings:
          badCount > 0
            ? [`มี ${badCount.toLocaleString()} แถวที่ไม่ผ่านตรวจสอบ (ถูกข้าม)`]
            : [],
        tableName,
        diseaseCode: diseaseCodeSelected,
      } satisfies ImportResp,
      { status: 200 }
    );
  } catch (e) {
    console.error("[admin/disease-tables/import] error:", getErrorMessage(e));
    return NextResponse.json(
      {
        ok: false,
        error: "Import ล้มเหลว",
        detail: getErrorMessage(e),
      } satisfies ImportResp,
      { status: 500 }
    );
  }
}
