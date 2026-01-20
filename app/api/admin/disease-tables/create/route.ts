// app/api/admin/disease-tables/create/route.ts
import { NextResponse } from "next/server";
import { sql } from "kysely";

// ✅ โปรเจกต์คุณอยู่ที่ lib/kysely3/db.ts (default export)
import kysely3 from "@/lib/kysely3/db";

export const runtime = "nodejs";

type Body = {
  tableName: string; // เช่น d02_dengue หรือ d04_test
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
    throw new Error("ชื่อ table ต้องขึ้นต้นด้วย d เช่น d02_influenza");
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
    throw new Error(
      `ชื่อ table ต้องขึ้นต้นด้วย "${prefix}" เพราะคุณเลือกโรค ${diseaseCode}`
    );
  }
}

// กันชื่อยาวเกิน 63 (constraint/index/seq)
function safeName(name: string, max = 63) {
  if (name.length <= max) return name;
  return name.slice(0, max);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const tableName = normalizeTableName(body.tableName);
    const diseaseCode = normalizeDiseaseCode(body.diseaseCode);

    // ✅ ตรวจให้ prefix tableName ตรงกับ diseaseCode (ตาม requirement คุณ)
    enforcePrefixMatch(tableName, diseaseCode);

    // ✅ ตั้งชื่อ object ให้ไม่ซ้ำ + ไม่ยาวเกิน
    const seqName = safeName(`${tableName}_id_seq`);
    const pkName = safeName(`${tableName}_pkey`);
    const fkName = safeName(`${tableName}_disease_fk`);
    const idxName = safeName(`idx_${tableName}_disease_code`);

    // ✅ identifiers
    const tableId = sql.id("public", tableName);
    const seqId = sql.id("public", seqName);
    const diseasesId = sql.id("public", "diseases");

    // ✅ สำคัญมาก: DEFAULT nextval('public.xxx_id_seq'::regclass) ต้องเป็น raw string
    // เพราะถ้าใช้ parameter ($1) มักทำให้ SQL compile ไม่ได้/ชน type
    const seqRegclass = sql.raw(`'public.${seqName}'::regclass`);

    await kysely3.transaction().execute(async (trx) => {
      // 1) CREATE SEQUENCE
      await sql`CREATE SEQUENCE IF NOT EXISTS ${seqId};`.execute(trx);

      // 2) CREATE TABLE (เหมือน public.d01_influenza)
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
            REFERENCES ${diseasesId} (code)
            ON DELETE RESTRICT
            ON UPDATE CASCADE
        )
        PARTITION BY RANGE (onset_date_parsed);
      `.execute(trx);

      // 2.1) (ตัวเลือกเสริม) ผูก sequence ให้เป็นของคอลัมน์ id
      // ไม่จำเป็นแต่ดีต่อการดูแล
      await sql`
        ALTER SEQUENCE ${seqId}
        OWNED BY ${tableId}.id;
      `.execute(trx);

      // 3) CREATE INDEX
      await sql`
        CREATE INDEX IF NOT EXISTS ${sql.id(idxName)}
        ON ONLY ${tableId} USING btree (disease_code);
      `.execute(trx);
    });

    return NextResponse.json({
      ok: true,
      table: `public.${tableName}`,
      sequence: `public.${seqName}`,
      index: idxName,
      diseaseCode: diseaseCode ?? null,
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
