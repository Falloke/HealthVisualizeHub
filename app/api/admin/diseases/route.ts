// app/api/admin/diseases/route.ts
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

/** GET: list diseases */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const items = await db
      .selectFrom("diseases")
      .select(["code", "name_th", "name_en"])
      .orderBy("code", "asc")
      .execute();

    return NextResponse.json({ items });
  } catch (e) {
    console.error("[admin/diseases] GET error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "ไม่สามารถดึงรายการโรคได้" },
      { status: 500 }
    );
  }
}

/** POST: create disease (code + names) */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      name_th?: string | null;
      name_en?: string | null;
    };

    const rawCode = String(body.code ?? "").trim();
    if (!rawCode) {
      return NextResponse.json(
        { error: "กรุณาระบุรหัสโรค (code)" },
        { status: 422 }
      );
    }

    const code = rawCode.toUpperCase();
    const name_th = (body.name_th ?? "").trim() || null;
    const name_en = (body.name_en ?? "").trim() || null;

    const existing = await db
      .selectFrom("diseases")
      .select("code")
      .where("code", "=", code)
      .executeTakeFirst();

    if (existing) {
      return NextResponse.json(
        { error: `มีรหัสโรค ${code} อยู่แล้ว` },
        { status: 409 }
      );
    }

    const inserted = await db
      .insertInto("diseases")
      .values({ code, name_th, name_en })
      .returning(["code", "name_th", "name_en"])
      .executeTakeFirst();

    return NextResponse.json(inserted, { status: 201 });
  } catch (e) {
    console.error("[admin/diseases] POST error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "สร้างรหัสโรคไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

/** PUT: update disease names (ชื่อไทย/อังกฤษ) */
export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      name_th?: string | null;
      name_en?: string | null;
    };

    const rawCode = String(body.code ?? "").trim();
    if (!rawCode) {
      return NextResponse.json(
        { error: "ต้องมีรหัสโรค (code) เพื่อแก้ไข" },
        { status: 422 }
      );
    }
    const code = rawCode.toUpperCase();

    const updateData: { name_th?: string | null; name_en?: string | null } = {};
    if (body.name_th !== undefined) {
      updateData.name_th = (body.name_th ?? "").trim() || null;
    }
    if (body.name_en !== undefined) {
      updateData.name_en = (body.name_en ?? "").trim() || null;
    }

    const updated = await db
      .updateTable("diseases")
      .set(updateData)
      .where("code", "=", code)
      .returning(["code", "name_th", "name_en"])
      .executeTakeFirst();

    if (!updated) {
      return NextResponse.json(
        { error: `ไม่พบรหัสโรค ${code}` },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[admin/diseases] PUT error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "แก้ไขข้อมูลโรคไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

/** DELETE: delete disease + relations (details + symptoms + preventions) */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") ?? "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json(
      { error: "ต้องระบุรหัสโรค (code)" },
      { status: 422 }
    );
  }

  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("disease_symptoms")
        .where("disease_code", "=", code)
        .execute();

      await trx
        .deleteFrom("disease_preventions")
        .where("disease_code", "=", code)
        .execute();

      await trx
        .deleteFrom("disease_details")
        .where("disease_code", "=", code)
        .execute();

      await trx.deleteFrom("diseases").where("code", "=", code).execute();
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/diseases] DELETE error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "ลบโรคไม่สำเร็จ" },
      { status: 400 }
    );
  }
}
