// app/api/admin/diseases/preventions/route.ts
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

// ------------------------------------------------------
// GET: คืนวิธีป้องกันที่เลือก + master preventions ทั้งหมด
//   GET /api/admin/diseases/preventions?code=D01
//   {
//     selected: { id: number; priority: number | null }[];
//     options:  { id: number; name_th: string }[];
//   }
// ------------------------------------------------------
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "ต้องระบุ code" }, { status: 400 });
  }

  try {
    const selected = await db
      .selectFrom("disease_preventions")
      .select(["prevention_id as id", "priority"])
      .where("disease_code", "=", code)
      .orderBy("priority", "asc")
      .orderBy("prevention_id", "asc")
      .execute();

    const options = await db
      .selectFrom("preventions")
      .select(["id", "name_th"])
      .orderBy("id", "asc")
      .execute();

    return NextResponse.json({ selected, options });
  } catch (e) {
    console.error(
      "[admin/diseases/preventions] GET error:",
      getErrorMessage(e)
    );
    return NextResponse.json(
      { error: "โหลดวิธีป้องกันไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------
// PUT: บันทึกวิธีป้องกันของโรค (แทนที่ของเดิมทั้งหมด)
//   PUT /api/admin/diseases/preventions?code=D01
//   body: { items: number[] }   // array ของ prevention_id
// ------------------------------------------------------
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

  // แปลง items ให้เป็นเลขจำนวนเต็มบวก
  const items: number[] = Array.isArray(body.items)
    ? body.items
        .map((x: any) => Number(x))
        .filter((x: number) => Number.isInteger(x) && x > 0)
    : [];

  try {
    await db.transaction().execute(async (trx) => {
      // ลบทิ้งของเดิมทั้งหมดของโรคนี้
      await trx
        .deleteFrom("disease_preventions")
        .where("disease_code", "=", code)
        .execute();

      // ถ้ามีรายการใหม่ → แทรกใหม่ทั้งหมด
      if (items.length > 0) {
        await trx
          .insertInto("disease_preventions")
          .values(
            items.map((id, idx) => ({
              disease_code: code,
              prevention_id: id,
              // ให้ priority เรียง 1,2,3,… ไปเลย
              priority: idx + 1,
            }))
          )
          .execute();
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(
      "[admin/diseases/preventions] PUT error:",
      getErrorMessage(e)
    );
    return NextResponse.json(
      {
        error:
          "บันทึกวิธีป้องกันไม่สำเร็จ (ตรวจสอบว่า ID วิธีป้องกันมีอยู่จริงหรือไม่)",
      },
      { status: 400 }
    );
  }
}
