// E:\HealtRiskHub\app\api\saved-searches\route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/connect-db";
import { auth } from "@/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** helper: แปลง "", null, undefined -> undefined (ให้ zod จัดการง่าย) */
const emptyToUndef = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

/** วันที่แบบสตริง YYYY-MM-DD */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD");

const createSchema = z
  .object({
    searchName: z.string().trim().min(1, "กรุณากรอกชื่อการค้นหา"),
    disease: z.string().trim().min(1, "กรุณาระบุชื่อโรค"),

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

// ---------- GET: รายการทั้งหมดหรือรายการเดียว (ผ่าน ?id=) ----------
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    // ไม่ล็อกอิน → ให้ 401 เพื่อให้ Sidebar ซ่อน block “ค้นหาที่บันทึกไว้”
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id);
    if (!userIdNum) {
      // user.id เป็นรูปแบบอื่น (เช่น uuid) → ถือว่าไม่มี saved search
      console.warn(
        "[saved-searches] invalid session userId:",
        session.user.id
      );
      return NextResponse.json([], {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    // ---------- ดึงรายการเดียว ----------
    if (idParam) {
      let idBig: bigint;
      try {
        idBig = BigInt(idParam);
      } catch {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }

      const row = await prisma.savedSearch.findFirst({
        where: { id: idBig, userId: userIdNum },
      });

      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(
        {
          id: Number(row.id),
          searchName: row.searchName,
          diseaseName: row.diseaseName ?? "",
          province: row.province ?? "",
          provinceAlt: row.provinceAlt ?? "",
          startDate: row.startDate
            ? row.startDate.toISOString().slice(0, 10)
            : "",
          endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : "",
          color: row.color ?? "",
          createdAt: row.createdAt.toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // ---------- ดึงทั้งหมดของผู้ใช้ ----------
    const rows = await prisma.savedSearch.findMany({
      where: { userId: userIdNum },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const data = rows.map((r) => ({
      id: Number(r.id),
      searchName: r.searchName,
      diseaseName: r.diseaseName ?? "",
      province: r.province ?? "",
      provinceAlt: r.provinceAlt ?? "",
      startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
      endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
      color: r.color ?? "",
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/saved-searches error:", err);
    // ❗ แทนที่จะส่ง 500 (แล้ว Sidebar ขึ้นกล่องแดง) ส่ง [] กลับไปเลย
    return NextResponse.json([], {
      headers: { "Cache-Control": "no-store" },
      status: 200,
    });
  }
}

// ---------- POST: สร้างรายการใหม่ ----------
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id);
    if (!userIdNum) {
      return NextResponse.json(
        { error: "Invalid session userId" },
        { status: 400 }
      );
    }

    const json = await req.json();
    const body = createSchema.parse(json);

    const created = await prisma.savedSearch.create({
      data: {
        userId: userIdNum,
        searchName: body.searchName,
        diseaseName: body.disease,
        province: body.province ?? null,
        provinceAlt: body.diseaseProvince ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        color: body.color ?? null,
      },
    });

    return NextResponse.json(
      {
        id: Number(created.id),
        searchName: created.searchName,
        startDate:
          created.startDate?.toISOString().slice(0, 10) ??
          body.startDate ??
          "",
        endDate:
          created.endDate?.toISOString().slice(0, 10) ?? body.endDate ?? "",
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
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ---------- DELETE: ลบเฉพาะของผู้ใช้คนนั้น ----------
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id);
    if (!userIdNum) {
      return NextResponse.json(
        { error: "Invalid session userId" },
        { status: 400 }
      );
    }

    const idStr = req.nextUrl.searchParams.get("id");
    if (!idStr) {
      return NextResponse.json(
        { error: "Missing id" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
