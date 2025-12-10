// app/api/telemetry/session/end/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const sessionId = body?.sessionId as number | undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  try {
    const existing = await prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const now = new Date();

    // ใช้ endedAt || lastActivityAt || now
    const end = now;
    const startMs = existing.startedAt.getTime();
    const endMs = end.getTime();
    const durationSec = Math.max(0, Math.floor((endMs - startMs) / 1000));

    const row = await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        endedAt: end,
        lastActivityAt: end,
        durationSec,
      },
      select: {
        id: true,
        durationSec: true,
      },
    });

    return NextResponse.json({ ok: true, durationSec: row.durationSec ?? durationSec });
  } catch (e) {
    console.error("end session error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
