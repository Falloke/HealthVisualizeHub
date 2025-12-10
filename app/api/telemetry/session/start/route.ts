// app/api/telemetry/session/start/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/connect-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIdNum = Number(session.user.id) || null;

    // ถ้า user.id ไม่ใช่ตัวเลข (เช่น uuid) → ไม่ต้องเขียน DB ก็ได้ แต่ตอบ ok กลับไป
    if (!userIdNum) {
      console.warn(
        "[telemetry/session/start] invalid user id:",
        session.user.id
      );
      return NextResponse.json({ ok: true });
    }

    const ipRaw = req.headers.get("x-forwarded-for") ?? "";
    const ip = ipRaw.split(",")[0]?.trim() ?? "";
    const userAgent = req.headers.get("user-agent") ?? "";
    const now = new Date();

    const row = await prisma.userSession.create({
      data: {
        userId: userIdNum,
        ip,
        userAgent,
        startedAt: now,
        lastActivityAt: now,
      },
      select: {
        id: true,
        startedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      sessionId: row.id,
      startedAt: row.startedAt.toISOString(),
    });
  } catch (err) {
    console.error("POST /api/telemetry/session/start error:", err);
    // ไม่อยากให้ client เด้ง error — ตอบ ok กลับไปเฉย ๆ
    return NextResponse.json({ ok: true });
  }
}
