import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import bcrypt from "bcryptjs";
import { profileUpdateSchema } from "@/schemas/profileSchema";
import { auth } from "@/auth";

const prisma = new PrismaClient();

/** GET /api/profile */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  const idStr = session.user.id;

  // หา user จาก id ก่อน
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
    dob: user.brith_date?.toISOString().split("T")[0] ?? "",
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

    // hash password ถ้ามี
    let hashedPassword: string | undefined;
    if (parsedData.newPassword && parsedData.newPassword.length > 0) {
      hashedPassword = await bcrypt.hash(parsedData.newPassword, 10);
    }

    const updateData: Prisma.UserUpdateInput = {
      first_name: parsedData.firstName,
      last_name: parsedData.lastName,
      province: parsedData.province,
      brith_date: new Date(parsedData.dob),
      position: parsedData.position,
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
          dob: updatedUser.brith_date?.toISOString().split("T")[0] ?? "",
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
