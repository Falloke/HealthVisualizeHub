// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/connect-db";
import { requireAdmin } from "@/lib/auth-guards";
import bcrypt from "bcryptjs";

export const runtime = "nodejs"; // ✅ ป้องกัน Edge Runtime issue (bcrypt/prisma)
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toCleanString(v: unknown): string {
  return String(v ?? "").trim();
}

function toOptionalDate(v: unknown): Date | undefined {
  const s = toCleanString(v);
  if (!s) return undefined;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined; // กันวันไม่ถูกต้อง
  return d;
}

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
      // 2) รวมเวลาจากตาราง UserSession
      const sums = await prisma.userSession.groupBy({
        by: ["userId"],
        where: {
          userId: { in: ids },
          durationSec: { not: null },
        },
        _sum: { durationSec: true },
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
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const first_name = toCleanString(body.first_name);
    const last_name = toCleanString(body.last_name);
    const email = toCleanString(body.email).toLowerCase();
    const password = toCleanString(body.password);

    const role = toCleanString(body.role) || "User";
    const position = toCleanString(body.position);
    const province = toCleanString(body.province);

    const birthDateValue = toOptionalDate(body.brith_date);

    if (!first_name || !last_name || !email || !password) {
      return NextResponse.json(
        { error: "กรอกข้อมูลให้ครบ (ชื่อ, นามสกุล, อีเมล, รหัสผ่าน)" },
        { status: 422 }
      );
    }

    const hash = await bcrypt.hash(password, 10);

    // ✅ สร้าง data แบบชัดเจน ไม่ใช้ spread ที่ทำ TS งง
    const data: any = {
      first_name,
      last_name,
      email,
      role,
      position,
      province,
      password: hash,
    };

    if (birthDateValue) {
      data.brith_date = birthDateValue; // ✅ Prisma รับ Date ได้ตรง ๆ
    }

    const created = await prisma.user.create({
      data,
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
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const numId = Number(body.id);
    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 422 });
    }

    // ✅ updateData ชัดเจนและสะอาด
    const updateData: any = {};

    if (body.first_name !== undefined)
      updateData.first_name = toCleanString(body.first_name);
    if (body.last_name !== undefined)
      updateData.last_name = toCleanString(body.last_name);
    if (body.email !== undefined)
      updateData.email = toCleanString(body.email).toLowerCase();
    if (body.role !== undefined) updateData.role = toCleanString(body.role);
    if (body.position !== undefined)
      updateData.position = toCleanString(body.position);
    if (body.province !== undefined)
      updateData.province = toCleanString(body.province);

    // วันเกิด: ถ้าส่งมาแล้วเป็นค่าว่าง -> ล้างค่า (ตั้งเป็น null)
    // (กรณีนี้ต้องให้ schema รองรับ null ถ้าใน DB เป็น nullable)
    if (body.brith_date !== undefined) {
      const d = toOptionalDate(body.brith_date);
      if (d) updateData.brith_date = d;
      // ถ้าผู้ใช้ส่ง "" มาเพื่อเคลียร์วันเกิด
      else updateData.brith_date = null;
    }

    const updated = await prisma.user.update({
      where: { id: numId },
      data: updateData,
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
