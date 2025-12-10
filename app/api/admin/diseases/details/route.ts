// app/api/admin/diseases/details/route.ts
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

/** GET รายละเอียดโรค (ไทย/อังกฤษ) */
export async function GET(request: Request) {
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
    const row = await db
      .selectFrom("disease_details")
      .select(["disease_code", "description_th", "description_en"])
      .where("disease_code", "=", code)
      .executeTakeFirst();

    if (!row) {
      // ถ้ายังไม่มี ให้คืนค่าว่างๆ จะได้ให้ admin กรอกใหม่
      return NextResponse.json({
        disease_code: code,
        description_th: "",
        description_en: "",
      });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("[admin/diseases/details] GET error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "โหลดรายละเอียดโรคไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

/** PUT: บันทึกรายละเอียดโรค (upsert) */
export async function PUT(request: Request) {
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
    const body = (await request.json().catch(() => ({}))) as {
      description_th?: string;
      description_en?: string;
    };

    const description_th = (body.description_th ?? "").trim();
    const description_en =
      (body.description_en ?? "").trim() || null; // อังกฤษไม่บังคับ

    const existing = await db
      .selectFrom("disease_details")
      .select("disease_code")
      .where("disease_code", "=", code)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable("disease_details")
        .set({ description_th, description_en })
        .where("disease_code", "=", code)
        .execute();
    } else {
      await db
        .insertInto("disease_details")
        .values({ disease_code: code, description_th, description_en })
        .execute();
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/diseases/details] PUT error:", getErrorMessage(e));
    return NextResponse.json(
      { error: "บันทึกรายละเอียดโรคไม่สำเร็จ" },
      { status: 400 }
    );
  }
}
