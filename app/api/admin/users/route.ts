// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/connect-db";
import { requireAdmin } from "@/lib/auth-guards";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- GET: list users + total usage time ---------------- */

// GET /api/admin/users  → list users + total usage time (seconds)
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    // 1) ดึงรายชื่อ user ที่ยังไม่ถูกลบ
    const rawUsers = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        position: true,
        province: true,
        brith_date: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const ids = rawUsers.map((u) => u.id);
    const usageByUser = new Map<number, number>();

    if (ids.length > 0) {
      // 2) รวมเวลาจากตาราง UserSession (ไม่ใช้ queryRaw แล้ว)
      const sums = await prisma.userSession.groupBy({
        by: ["userId"],
        where: {
          userId: { in: ids },
          // นับเฉพาะ session ที่มี durationSec แล้ว (จบ session แล้ว)
          durationSec: { not: null },
        },
        _sum: {
          durationSec: true,
        },
      });

      for (const row of sums) {
        const sec = row._sum.durationSec ?? 0;
        usageByUser.set(row.userId, sec);
      }
    }

    // 3) รวม totalUsageSeconds เข้า object user แล้วส่งให้ frontend
    const users = rawUsers.map((u) => ({
      ...u,
      totalUsageSeconds: usageByUser.get(u.id) ?? 0,
    }));

    return NextResponse.json(users, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("GET /api/admin/users error:", e);
    return NextResponse.json(
      { error: "ไม่สามารถดึงรายชื่อผู้ใช้ได้" },
      { status: 500 }
    );
  }
}

/* ---------------- POST: create user ---------------- */

// POST /api/admin/users  → create user
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const {
      first_name = "",
      last_name = "",
      email = "",
      password = "",
      role = "User",
      position = "",
      province = "",
      brith_date,
    } = await request.json();

    if (!first_name || !last_name || !email || !password) {
      return NextResponse.json(
        { error: "กรอกข้อมูลให้ครบ (ชื่อ, นามสกุล, อีเมล, รหัสผ่าน)" },
        { status: 422 }
      );
    }

    const hash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        first_name,
        last_name,
        email,
        role,
        position,
        province,
        ...(brith_date ? { brith_date: new Date(brith_date) } : {}),
        password: hash,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        position: true,
        province: true,
        brith_date: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      { ...created, totalUsageSeconds: 0 },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "อีเมลนี้ถูกใช้แล้ว" }, { status: 409 });
    }
    console.error("POST /api/admin/users error:", e);
    return NextResponse.json(
      { error: "สร้างผู้ใช้ไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

/* ---------------- PUT: update user ---------------- */

// PUT /api/admin/users  → update user
export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const {
      id,
      first_name,
      last_name,
      email,
      role,
      position,
      province,
      brith_date,
    } = await request.json();

    const numId = Number(id);
    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 422 });
    }

    const updated = await prisma.user.update({
      where: { id: numId },
      data: {
        ...(first_name !== undefined ? { first_name } : {}),
        ...(last_name !== undefined ? { last_name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(position !== undefined ? { position } : {}),
        ...(province !== undefined ? { province } : {}),
        ...(brith_date ? { brith_date: new Date(brith_date) } : {}),
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        position: true,
        province: true,
        brith_date: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PUT /api/admin/users error:", e);
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }
}

/* ---------------- DELETE: soft delete user ---------------- */

// DELETE /api/admin/users?id=xx  → soft delete user
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const numId = Number(id);
  if (!numId || Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 422 });
  }

  await prisma.user.update({
    where: { id: numId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
