import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import { profileUpdateSchema } from "@/schemas/profileSchema";
import { auth } from "@/auth";

export const runtime = "nodejs"; // ✅ Prisma + bcrypt ต้องเป็น Node.js runtime
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ✅ กันปัญหา hot reload สร้าง PrismaClient ซ้ำ (โดยเฉพาะตอน dev)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function toISODateOnly(d?: Date | null) {
  return d ? d.toISOString().split("T")[0] : "";
}

function toSafeDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** GET /api/profile */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  const idStr = (session.user as any)?.id;

  // หา user จาก id ก่อน (ถ้ามี)
  if (idStr && !Number.isNaN(Number(idStr))) {
    user = await prisma.user.findUnique({
      where: { id: Number(idStr) },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        province: true,
        brith_date: true,
        position: true,
        role: true,
        deletedAt: true,
      },
    });
  }

  // ถ้าไม่เจอ และมี email → หาโดย email
  if ((!user || user.deletedAt) && session.user.email) {
    user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        province: true,
        brith_date: true,
        position: true,
        role: true,
        deletedAt: true,
      },
    });
  }

  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    province: user.province ?? "",
    dob: toISODateOnly(user.brith_date),
    position: user.position ?? "",
    role: user.role,
  });
}

/** PUT /api/profile */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // เช็คว่าผู้ใช้ถูก soft delete ไปหรือยัง
    const existingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { deletedAt: true },
    });

    if (!existingUser || existingUser.deletedAt) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsedData = profileUpdateSchema.parse(body);

    // ✅ schema ของคุณมี password / confirmPassword (ไม่มี newPassword)
    // hash password ถ้ามี
    let hashedPassword: string | undefined;
    if (parsedData.password && parsedData.password.length > 0) {
      hashedPassword = await bcrypt.hash(parsedData.password, 10);
    }

    const dobDate = toSafeDate(parsedData.dob);

    // ✅ updateData: เซ็ตค่าเท่าที่จำเป็น
    // หมายเหตุ: ถ้า brith_date ใน DB ไม่ nullable ให้เอา logic null ออก แล้วบังคับให้ต้องมีวันเกิด
    const updateData: Prisma.UserUpdateInput = {
      first_name: parsedData.firstName,
      last_name: parsedData.lastName,
      province: parsedData.province,
      position: parsedData.position,
      ...(dobDate ? { brith_date: dobDate } : {}),
      ...(hashedPassword ? { password: hashedPassword } : {}),
    };

    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        province: true,
        brith_date: true,
        position: true,
        role: true,
      },
    });

    return NextResponse.json(
      {
        message: "แก้ไขโปรไฟล์สำเร็จ",
        profile: {
          id: updatedUser.id,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          province: updatedUser.province ?? "",
          dob: toISODateOnly(updatedUser.brith_date),
          position: updatedUser.position ?? "",
          email: updatedUser.email,
          role: updatedUser.role,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Duplicate field", details: error.meta },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Known Prisma error", message: error.message },
        { status: 400 }
      );
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return NextResponse.json(
        { error: "Validation error", message: error.message },
        { status: 422 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Invalid request", message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unknown error", details: String(error) },
      { status: 500 }
    );
  }
}

/** DELETE /api/profile (Soft Delete) */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { deletedAt: true },
    });

    if (!existingUser || existingUser.deletedAt) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json(
      { message: "บัญชีถูกลบเรียบร้อยแล้ว (soft delete)" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "ไม่สามารถลบบัญชีได้", details: (error as Error).message },
      { status: 500 }
    );
  }
}
