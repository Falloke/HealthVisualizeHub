// app/api/saved-searches/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/connect-db";
import { auth } from "@/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** helper: แปลง "", null, undefined -> undefined */
const emptyToUndef = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

/** วันที่แบบสตริง YYYY-MM-DD */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD");

/** diseaseCode เช่น D01, D04 */
const diseaseCodeStr = z
  .string()
  .trim()
  .regex(/^D\d{2}$/i, "รูปแบบรหัสโรคต้องเป็น D01, D02, ...")
  .transform((s) => s.toUpperCase());

/**
 * ✅ Schema ใหม่:
 * - diseaseCode เป็นหลัก
 * - diseaseName optional (ชื่อไทย/ชื่อ custom)
 * - รองรับ legacy: disease (อาจเป็น code หรือชื่อ)
 */
const createSchema = z
  .object({
    searchName: z.string().trim().min(1, "กรุณากรอกชื่อการค้นหา"),

    diseaseCode: z.preprocess(emptyToUndef, diseaseCodeStr.optional()),
    diseaseName: z.preprocess(emptyToUndef, z.string().trim().optional()),
    disease: z.preprocess(emptyToUndef, z.string().trim().optional()),

    province: z.preprocess(emptyToUndef, z.string().trim().optional()),
    diseaseProvince: z.preprocess(emptyToUndef, z.string().trim().optional()),

    startDate: z.preprocess(emptyToUndef, dateStr.optional()),
    endDate: z.preprocess(emptyToUndef, dateStr.optional()),

    color: z.preprocess(
      emptyToUndef,
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "สีต้องเป็น #RRGGBB")
        .optional()
    ),
  })
  .refine(
    (v) => {
      if (!v.startDate || !v.endDate) return true;
      return new Date(v.startDate) <= new Date(v.endDate);
    },
    { message: "วันเริ่มต้นต้องไม่เกินวันสิ้นสุด", path: ["endDate"] }
  );

/** ---------- Helpers ---------- */

function extractDiseaseCodeFromAny(raw?: string): string {
  const s = String(raw ?? "").trim();

  if (/^D\d{2}$/i.test(s)) return s.toUpperCase();

  const m = s.match(/\b(D\d{2})\b/i);
  if (m?.[1]) return m[1].toUpperCase();

  const n = s.match(/\b(\d{1,2})\b/);
  if (n?.[1]) return `D${n[1].padStart(2, "0")}`;

  return "";
}

function toDateStr(d: any) {
  try {
    return d ? new Date(d).toISOString().slice(0, 10) : "";
  } catch {
    return "";
  }
}

function toIso(d: any) {
  try {
    return d ? new Date(d).toISOString() : "";
  } catch {
    return "";
  }
}

function biToNum(v: any) {
  try {
    return typeof v === "bigint" ? Number(v) : Number(v);
  } catch {
    return 0;
  }
}

/** หาโรคจาก code -> ชื่อไทย */
async function getDiseaseNameTHByCode(code: string): Promise<string> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^D\d{2}$/.test(c)) return "";

  try {
    const rows = await prisma.$queryRaw<Array<{ name_th: string | null }>>`
      SELECT name_th
      FROM public.diseases
      WHERE code = ${c}
      LIMIT 1
    `;
    return String(rows?.[0]?.name_th ?? "").trim();
  } catch {
    return "";
  }
}

/** หา code จากชื่อไทย (map legacy) */
async function getDiseaseCodeByNameTH(nameTh: string): Promise<string> {
  const n = String(nameTh ?? "").trim();
  if (!n) return "";

  try {
    const rows = await prisma.$queryRaw<Array<{ code: string | null }>>`
      SELECT code
      FROM public.diseases
      WHERE name_th = ${n}
      LIMIT 1
    `;
    const code = String(rows?.[0]?.code ?? "").trim().toUpperCase();
    return /^D\d{2}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

/**
 * ✅ หา disease_code สุดท้ายที่จะบันทึก
 * priority:
 * 1) diseaseCode
 * 2) extract จาก disease (legacy)
 * 3) map diseaseName (ชื่อไทย) -> code
 * 4) map disease (ถ้าเป็นชื่อไทย) -> code
 */
async function resolveFinalDiseaseCode(input: {
  diseaseCode?: string;
  diseaseName?: string;
  disease?: string;
}): Promise<string> {
  const byNew = extractDiseaseCodeFromAny(input.diseaseCode);
  if (byNew) return byNew;

  const byOldCode = extractDiseaseCodeFromAny(input.disease);
  if (byOldCode) return byOldCode;

  const byName = await getDiseaseCodeByNameTH(String(input.diseaseName ?? ""));
  if (byName) return byName;

  const byOldName = await getDiseaseCodeByNameTH(String(input.disease ?? ""));
  if (byOldName) return byOldName;

  return "";
}

/** ---------- GET ---------- */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id);
    if (!userIdNum) {
      console.warn("[saved-searches] invalid session userId:", session.user.id);
      return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
    }

    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    // ✅ ใช้ queryRaw join diseases เพื่อคืนชื่อไทย และ disease_code
    if (idParam) {
      let idBig: bigint;
      try {
        idBig = BigInt(idParam);
      } catch {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }

      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          s.id,
          s.search_name,
          s.province,
          s.province_alt,
          s.start_date,
          s.end_date,
          s.color,
          s.created_at,
          s.updated_at,
          s.disease_code,
          s.disease_name,
          d.name_th AS disease_name_th
        FROM public.saved_searches s
        LEFT JOIN public.diseases d
          ON d.code = s.disease_code
        WHERE s.user_id = ${userIdNum}
          AND s.id = ${idBig}
        LIMIT 1
      `;

      const row = rows?.[0];
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // ✅ diseaseName: เอาชื่อไทยจาก diseases ก่อน ถ้าไม่มีค่อย fallback disease_name (legacy/custom)
      const diseaseName =
        String(row?.disease_name_th ?? "").trim() ||
        String(row?.disease_name ?? "").trim() ||
        "";

      return NextResponse.json(
        {
          id: biToNum(row.id),
          searchName: String(row.search_name ?? ""),
          diseaseName,
          diseaseCode: String(row.disease_code ?? "").trim(),

          province: String(row.province ?? ""),
          provinceAlt: String(row.province_alt ?? ""),
          startDate: toDateStr(row.start_date),
          endDate: toDateStr(row.end_date),
          color: String(row.color ?? ""),
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        s.id,
        s.search_name,
        s.province,
        s.province_alt,
        s.start_date,
        s.end_date,
        s.color,
        s.created_at,
        s.updated_at,
        s.disease_code,
        s.disease_name,
        d.name_th AS disease_name_th
      FROM public.saved_searches s
      LEFT JOIN public.diseases d
        ON d.code = s.disease_code
      WHERE s.user_id = ${userIdNum}
      ORDER BY s.created_at DESC
      LIMIT 200
    `;

    const data = (rows ?? []).map((r) => {
      const diseaseName =
        String(r?.disease_name_th ?? "").trim() ||
        String(r?.disease_name ?? "").trim() ||
        "";

      return {
        id: biToNum(r.id),
        searchName: String(r.search_name ?? ""),
        diseaseName,
        diseaseCode: String(r.disease_code ?? "").trim(),

        province: String(r.province ?? ""),
        provinceAlt: String(r.province_alt ?? ""),
        startDate: toDateStr(r.start_date),
        endDate: toDateStr(r.end_date),
        color: String(r.color ?? ""),
        createdAt: toIso(r.created_at),
        updatedAt: toIso(r.updated_at),
      };
    });

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/saved-searches error:", err);
    return NextResponse.json([], {
      headers: { "Cache-Control": "no-store" },
      status: 200,
    });
  }
}

/** ---------- POST ---------- */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id);
    if (!userIdNum) {
      return NextResponse.json({ error: "Invalid session userId" }, { status: 400 });
    }

    const json = await req.json();
    const body = createSchema.parse(json);

    // ✅ หา disease_code ที่ถูกต้อง
    const diseaseCode = await resolveFinalDiseaseCode({
      diseaseCode: body.diseaseCode,
      diseaseName: body.diseaseName,
      disease: body.disease,
    });

    // ✅ ตั้งชื่อสำหรับเก็บ legacy/custom (ถ้าเป็นโรคในระบบจะใช้ชื่อไทยจาก DB)
    let diseaseNameToStore = String(body.diseaseName ?? body.disease ?? "").trim();
    if (diseaseCode) {
      const th = await getDiseaseNameTHByCode(diseaseCode);
      if (th) diseaseNameToStore = th;
    }

    // ถ้าไม่ได้ diseaseCode -> ถือว่า custom (อื่น ๆ) ก็เก็บ disease_name อย่างเดียวได้
    // แต่ถ้าจะ “บังคับให้ต้องเลือกโรคในระบบเสมอ” ให้เปิด if ด้านล่าง
    // if (!diseaseCode) {
    //   return NextResponse.json(
    //     { error: "กรุณาเลือกโรคให้ถูกต้อง (ต้องเป็นรหัส D01/D02/...)" },
    //     { status: 422 }
    //   );
    // }

    // ✅ insert ด้วย SQL เพื่อเขียน disease_code ได้แม้ prisma schema ยังไม่อัปเดต
    const inserted = await prisma.$queryRaw<any[]>`
      INSERT INTO public.saved_searches (
        user_id,
        search_name,
        disease_name,
        disease_code,
        province,
        province_alt,
        start_date,
        end_date,
        color
      ) VALUES (
        ${userIdNum},
        ${body.searchName.trim()},
        ${diseaseNameToStore || null},
        ${diseaseCode || null},
        ${body.province ?? null},
        ${body.diseaseProvince ?? null},
        ${body.startDate ? new Date(body.startDate) : null},
        ${body.endDate ? new Date(body.endDate) : null},
        ${body.color ?? null}
      )
      RETURNING id, search_name, start_date, end_date, disease_code
    `;

    const row = inserted?.[0];

    return NextResponse.json(
      {
        id: biToNum(row?.id),
        searchName: String(row?.search_name ?? body.searchName),

        // ✅ ของเดิมยังมี diseaseName ให้ UI ใช้
        diseaseName: diseaseNameToStore || "",
        diseaseCode: String(row?.disease_code ?? diseaseCode ?? "").trim(),

        startDate: toDateStr(row?.start_date) || body.startDate || "",
        endDate: toDateStr(row?.end_date) || body.endDate || "",
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && (err as any).name === "ZodError") {
      const zerr = err as z.ZodError;
      return NextResponse.json(
        { error: "Validation error", issues: zerr.issues },
        { status: 422 }
      );
    }
    console.error("POST /api/saved-searches error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** ---------- DELETE ---------- */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id);
    if (!userIdNum) {
      return NextResponse.json({ error: "Invalid session userId" }, { status: 400 });
    }

    const idStr = req.nextUrl.searchParams.get("id");
    if (!idStr) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    let idBig: bigint;
    try {
      idBig = BigInt(idStr);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const result = await prisma.savedSearch.deleteMany({
      where: { id: idBig, userId: userIdNum },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/saved-searches error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
