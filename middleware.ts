// E:\HealtRiskHub\middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./auth";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/haslogin",
  "/favicon.ico",
  "/dashBoard",
  "/provincPage",
  "/comparePage",
  "/searchTemplate",
  "/historyPage",
  "/profilePage",
  "/provincialInfo",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ✅ อนุญาตไฟล์/static ทั้งหมดให้ผ่าน
  if (
    pathname.startsWith("/_next") || // ไฟล์ build
    pathname.startsWith("/images") || // รูปใน /public/images
    pathname.startsWith("/data") || // JSON ใน /public/data
    pathname.startsWith("/fonts") || // เผื่อมีฟอนต์
    pathname.startsWith("/api") || // API routes
    pathname === "/favicon.ico" || // favicon
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|json)$/.test(pathname) // ไฟล์ static อื่น ๆ
  ) {
    return NextResponse.next();
  }

  // หน้า public ไม่ต้องมี session
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // ต้องมี session ตั้งแต่ตรงนี้ลงไป
  const session = await auth();
  const role = session?.user?.role?.toLowerCase();

  // admin-only
  if (pathname.startsWith("/admin")) {
    if (!session) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // ส่วนที่เหลือ: ต้องล็อกอิน
  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// ✅ ยกเว้นเส้นทาง static ใน matcher ด้วย (กันตกหล่น)
export const config = {
  matcher: [
    "/((?!_next|images|data|fonts|favicon.ico|api|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|json)$).*)",
  ],
};
