// app/api/telemetry/session/heartbeat/route.ts
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

  const now = new Date();

  try {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: now,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("heartbeat error", e);
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}
