// app/api/admin/preventions/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import db from "@/lib/kysely/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

/**
 * POST /api/admin/preventions
 * body: { name_th: string }
 *
 * สร้างวิธีป้องกันใหม่ ให้ DB เป็นคน gen id เอง
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const name_th = String(body.name_th ?? "").trim();

  if (!name_th) {
    return NextResponse.json(
      { error: "กรุณากรอกชื่อวิธีป้องกัน (name_th)" },
      { status: 400 }
    );
  }

  try {
    const inserted = await db
      .insertInto("preventions")
      .values({ name_th })
      .returning(["id", "name_th"])
      .executeTakeFirst();

    if (!inserted) {
      throw new Error("insert preventions ไม่สำเร็จ (ไม่มีแถวที่ถูกสร้าง)");
    }

    return NextResponse.json(inserted, { status: 201 });
  } catch (e) {
    console.error("[admin/preventions] POST error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "สร้างวิธีป้องกันใหม่ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/preventions?id=3
 * ลบวิธีป้องกันออกจาก master + ความสัมพันธ์กับโรคทั้งหมด
 */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  const id = Number(rawId);

  if (!rawId || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "ต้องระบุ id (เลขจำนวนเต็มบวก)" },
      { status: 400 }
    );
  }

  try {
    const deleted = await db.transaction().execute(async (trx) => {
      // ลบความสัมพันธ์กับโรคทั้งหมดก่อน
      await trx
        .deleteFrom("disease_preventions")
        .where("prevention_id", "=", id)
        .execute();

      // ลบจาก master preventions
      return await trx
        .deleteFrom("preventions")
        .where("id", "=", id)
        .returning(["id"])
        .executeTakeFirst();
    });

    if (!deleted) {
      return NextResponse.json(
        { error: `ไม่พบวิธีป้องกัน id ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/preventions] DELETE error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "ลบวิธีป้องกันไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
