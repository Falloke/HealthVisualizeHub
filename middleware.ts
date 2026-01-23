// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ✅ หน้า public เข้าได้เลย (ไม่ต้อง login)
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/haslogin",
  "/favicon.ico",

  // หน้าเหล่านี้คุณอยากให้เปิดดูได้ (ถ้าต้องล็อกอิน ให้เอาออก)
  "/dashBoard",
  "/provincPage",
  "/comparePage",
  "/searchTemplate",
  "/historyPage",
  "/profilePage",
  "/provincialInfo",
]);

function isStaticOrPublicFile(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/data") ||
    pathname.startsWith("/fonts") ||
    pathname === "/favicon.ico" ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|json)$/.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ✅ อนุญาตไฟล์ static + API ผ่าน
  if (isStaticOrPublicFile(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ✅ หน้า public ผ่านได้
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // ✅ ตรวจ token แบบเบา (ไม่ดึง Prisma / bcrypt)
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  // ❌ ยังไม่ login → ส่งไปหน้า login
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ✅ admin-only
  if (pathname.startsWith("/admin")) {
    const roleRaw =
      (token as any)?.role ??
      (token as any)?.role_name ??
      (token as any)?.Role ??
      "";

    const role = String(roleRaw).toLowerCase();
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

// ✅ matcher ให้ทำงานเฉพาะ page routes (exclude static/api)
export const config = {
  matcher: ["/((?!api|_next|images|data|fonts|favicon.ico).*)"],
};
