// app/api/admin/disease-tables/create/route.ts
import { NextResponse } from "next/server";
import { sql } from "kysely";
import db from "@/lib/kysely/db";

export const runtime = "nodejs";

type Body = {
  tableName: string; // เช่น d02_dengue หรือ d04_testttt
  diseaseCode?: string; // เช่น D02, D04 (ส่งมาจาก UI ได้)
};

function normalizeDiseaseCode(input?: string | null) {
  const c = (input || "").trim().toUpperCase();
  if (!c) return null;

  // รองรับ D01..D99
  if (!/^D\d{2}$/.test(c)) {
    throw new Error("diseaseCode ต้องอยู่ในรูปแบบ D01..D99");
  }
  return c;
}

function normalizeTableName(input: string) {
  const name = (input || "").trim().toLowerCase();

  // ❌ ห้ามใส่ schema เช่น public.xxx
  if (name.includes(".")) {
    throw new Error("กรุณาใส่เฉพาะชื่อ table (ห้ามมี . เช่น public.xxx)");
  }

  // ✅ อนุญาตเฉพาะ a-z 0-9 _
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("ชื่อ table ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข/underscore เท่านั้น");
  }

  if (!name.startsWith("d")) {
    throw new Error("ชื่อ table ต้องขึ้นต้นด้วย d เช่น d02_dengue");
  }

  if (name.length > 63) {
    throw new Error("ชื่อ table ยาวเกินไป (เกิน 63 ตัวอักษร)");
  }

  return name;
}

function enforcePrefixMatch(tableName: string, diseaseCode: string | null) {
  if (!diseaseCode) return;

  // diseaseCode = D02 -> prefix ต้องเป็น d02_
  const nn = diseaseCode.replace("D", "").padStart(2, "0");
  const prefix = `d${nn}_`;

  if (!tableName.startsWith(prefix)) {
    throw new Error(`ชื่อ table ต้องขึ้นต้นด้วย "${prefix}" เพราะคุณเลือกโรค ${diseaseCode}`);
  }
}

// กันชื่อยาวเกิน 63 (constraint/index/seq)
function safeName(name: string, max = 63) {
  if (name.length <= max) return name;
  return name.slice(0, max);
}

function quarterPartitionsForYear(year: number) {
  // RANGE partition: [FROM, TO)
  return [
    { key: "q1", from: `${year}-01-01`, to: `${year}-04-01` },
    { key: "q2", from: `${year}-04-01`, to: `${year}-07-01` },
    { key: "q3", from: `${year}-07-01`, to: `${year}-10-01` },
    { key: "q4", from: `${year}-10-01`, to: `${year + 1}-01-01` },
  ];
}

/**
 * ✅ สำคัญ:
 * - สร้างตาราง "แม่" แบบ partitioned
 * - สร้าง partitions ลูกไว้ให้ (เช่น 2024 q1-q4)
 * - สร้าง DEFAULT partition กันข้อมูลตกหล่น (ปีอื่นๆ)
 * - ✅ NEW: Auto-map เข้าตาราง disease_fact_tables ให้อัตโนมัติ
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const tableName = normalizeTableName(body.tableName);
    const diseaseCode = normalizeDiseaseCode(body.diseaseCode);

    // ✅ ตรวจให้ prefix tableName ตรงกับ diseaseCode
    enforcePrefixMatch(tableName, diseaseCode);

    // ✅ ตั้งชื่อ object ให้ไม่ซ้ำ + ไม่ยาวเกิน
    const seqName = safeName(`${tableName}_id_seq`);
    const pkName = safeName(`${tableName}_pkey`);
    const fkName = safeName(`${tableName}_disease_fk`);
    const idxName = safeName(`idx_${tableName}_disease_code`);

    // ✅ identifiers
    const tableId = sql.id("public", tableName);
    const seqId = sql.id("public", seqName);

    // ✅ สำคัญ: DEFAULT nextval('public.xxx_id_seq'::regclass) ต้องเป็น raw string
    const seqRegclass = sql.raw(`'public.${seqName}'::regclass`);

    // ✅ FK ไปที่ diseases.code
    const diseasesId = sql.id("public", "diseases");
    const diseasesKeyColumn = sql.id("code");

    await db.transaction().execute(async (trx) => {
      // =====================================================
      // 0) ✅ สร้างตาราง mapping โรค → fact table (ถ้ายังไม่มี)
      // =====================================================
      await sql`
        CREATE TABLE IF NOT EXISTS public.disease_fact_tables (
          disease_code text PRIMARY KEY,
          table_name   text NOT NULL,
          schema_name  text NOT NULL DEFAULT 'public',
          is_active    boolean NOT NULL DEFAULT true,
          created_at   timestamptz NOT NULL DEFAULT now(),
          updated_at   timestamptz NOT NULL DEFAULT now(),

          CONSTRAINT fk_disease_fact_tables_disease
            FOREIGN KEY (disease_code)
            REFERENCES public.diseases(code)
            ON UPDATE CASCADE
            ON DELETE RESTRICT,

          CONSTRAINT chk_table_name_safe
            CHECK (table_name ~ '^[a-z0-9_]+$'),

          CONSTRAINT chk_schema_name_safe
            CHECK (schema_name ~ '^[a-z0-9_]+$')
        );
      `.execute(trx);

      await sql`
        CREATE INDEX IF NOT EXISTS idx_disease_fact_tables_active
        ON public.disease_fact_tables (is_active);
      `.execute(trx);

      // =====================================================
      // 1) CREATE SEQUENCE
      // =====================================================
      await sql`CREATE SEQUENCE IF NOT EXISTS ${seqId};`.execute(trx);

      // =====================================================
      // 2) CREATE TABLE (เหมือน public.d01_influenza)
      // =====================================================
      await sql`
        CREATE TABLE IF NOT EXISTS ${tableId} (
          id int4 DEFAULT nextval(${seqRegclass}) NOT NULL,
          disease_code text NOT NULL,
          gender text NULL,
          age_y int4 NULL,
          nationality text NULL,
          occupation text NULL,
          province text NULL,
          district text NULL,
          onset_date text NULL,
          treated_date text NULL,
          diagnosis_date text NULL,
          death_date text NULL,
          onset_date_parsed date NOT NULL,
          treated_date_parsed date NULL,
          diagnosis_date_parsed date NULL,
          death_date_parsed date NULL,
          CONSTRAINT ${sql.id(pkName)} PRIMARY KEY (onset_date_parsed, id),
          CONSTRAINT ${sql.id(fkName)} FOREIGN KEY (disease_code)
            REFERENCES ${diseasesId} (${diseasesKeyColumn})
            ON DELETE RESTRICT
            ON UPDATE CASCADE
        )
        PARTITION BY RANGE (onset_date_parsed);
      `.execute(trx);

      // =====================================================
      // 2.1) ผูก sequence ให้เป็นของคอลัมน์ id
      // =====================================================
      await sql`
        ALTER SEQUENCE ${seqId}
        OWNED BY ${tableId}.id;
      `.execute(trx);

      // =====================================================
      // 3) CREATE INDEX (เฉพาะตารางแม่)
      // =====================================================
      await sql`
        CREATE INDEX IF NOT EXISTS ${sql.id(idxName)}
        ON ONLY ${tableId} USING btree (disease_code);
      `.execute(trx);

      // =====================================================
      // 4) CREATE partitions ลูกสำหรับปี 2024
      // =====================================================
      const year = 2024;
      for (const p of quarterPartitionsForYear(year)) {
        const partName = safeName(`${tableName}_${year}_${p.key}`);
        const partId = sql.id("public", partName);

        await sql`
          CREATE TABLE IF NOT EXISTS ${partId}
          PARTITION OF ${tableId}
          FOR VALUES FROM (${sql.raw(`'${p.from}'`)}) TO (${sql.raw(`'${p.to}'`)});
        `.execute(trx);
      }

      // =====================================================
      // 5) DEFAULT partition กันข้อมูลปีอื่นหล่น
      // =====================================================
      const defaultPartName = safeName(`${tableName}_default`);
      const defaultPartId = sql.id("public", defaultPartName);

      await sql`
        CREATE TABLE IF NOT EXISTS ${defaultPartId}
        PARTITION OF ${tableId}
        DEFAULT;
      `.execute(trx);

      // =====================================================
      // ✅ 6) AUTO-MAP โรค → fact table (ไม่ต้อง map เองอีกแล้ว)
      // =====================================================
      if (diseaseCode) {
        await sql`
          INSERT INTO public.disease_fact_tables (disease_code, table_name, schema_name, is_active)
          VALUES (${diseaseCode}, ${tableName}, 'public', true)
          ON CONFLICT (disease_code)
          DO UPDATE SET
            table_name = EXCLUDED.table_name,
            schema_name = EXCLUDED.schema_name,
            is_active = true,
            updated_at = now();
        `.execute(trx);
      }
    });

    return NextResponse.json({
      ok: true,
      table: `public.${tableName}`,
      sequence: `public.${seqName}`,
      index: idxName,
      diseaseCode: diseaseCode ?? null,
      partitions: [
        `public.${tableName}_2024_q1`,
        `public.${tableName}_2024_q2`,
        `public.${tableName}_2024_q3`,
        `public.${tableName}_2024_q4`,
        `public.${tableName}_default`,
      ],
      autoMapped: diseaseCode
        ? {
            mappingTable: "public.disease_fact_tables",
            disease_code: diseaseCode,
            schema_name: "public",
            table_name: tableName,
          }
        : null,
      note:
        diseaseCode
          ? "Auto-mapped: เพิ่ม/อัปเดต disease_fact_tables ให้อัตโนมัติแล้ว"
          : "ไม่ได้ส่ง diseaseCode มา จึงยังไม่ทำ auto-map",
    });
  } catch (e: any) {
    console.error("[admin/disease-tables/create] error:", e?.message || e);
    return NextResponse.json(
      {
        ok: false,
        error: "สร้างตารางไม่สำเร็จ",
        detail: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
