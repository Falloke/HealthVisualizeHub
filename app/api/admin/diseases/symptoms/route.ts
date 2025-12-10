// app/api/admin/diseases/symptoms/route.ts
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
 * GET /api/admin/diseases/symptoms?code=D01
 * {
 *   selected: number[];           // id ที่ผูกกับโรคนี้ (จาก disease_symptoms)
 *   options: { id, name_th }[];   // master symptoms ทั้งหมด
 * }
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "ต้องระบุ code" }, { status: 400 });
  }

  try {
    const selectedRows = await db
      .selectFrom("disease_symptoms")
      .select(["symptom_id as id"])
      .where("disease_code", "=", code)
      .orderBy("symptom_id", "asc")
      .execute();

    const options = await db
      .selectFrom("symptoms")
      .select(["id", "name_th"])
      .orderBy("id", "asc")
      .execute();

    return NextResponse.json({
      selected: selectedRows.map((r) => r.id),
      options,
    });
  } catch (e) {
    console.error("[admin/diseases/symptoms] GET error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "โหลดข้อมูลอาการไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/diseases/symptoms?code=D01
 * body: { items: number[] }  // id ของ symptoms ที่เลือก
 */
export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "ต้องระบุ code" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const items: number[] = Array.isArray(body.items)
    ? body.items
        .map((x: any) => Number(x))
        .filter((x: number) => Number.isInteger(x) && x > 0)
    : [];

  try {
    await db.transaction().execute(async (trx) => {
      // ลบของเดิมทั้งหมดของโรคนี้ก่อน
      await trx
        .deleteFrom("disease_symptoms")
        .where("disease_code", "=", code)
        .execute();

      // แทรกใหม่ ถ้ามี
      if (items.length > 0) {
        await trx
          .insertInto("disease_symptoms")
          .values(
            items.map((id) => ({
              disease_code: code,
              symptom_id: id,
            }))
          )
          .execute();
      }
    });

    return new NextResponse("ok");
  } catch (e) {
    console.error("[admin/diseases/symptoms] PUT error:", getErrorMessage(e));
    return NextResponse.json(
      {
        error:
          "บันทึกอาการไม่สำเร็จ (ตรวจสอบว่า ID อาการอยู่ในตาราง symptoms แล้วหรือยัง)",
      },
      { status: 400 }
    );
  }
}
