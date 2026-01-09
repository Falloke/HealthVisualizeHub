// app/layout.tsx
import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

import NavbarSwitcher from "./components/navbar/NavbarSwitcher";
import Sidebar from "./components/sidebar/SideBar";
import SiteFooter from "./components/footer/SiteFooter";
import { SessionProvider } from "next-auth/react";
import SessionTracker from "@/app/components/telemetry/SessionTracker";
import ScrollToTopButton from "./components/common/ScrollToTopButton";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HealthRiskHub",
  description:
    "ระบบเว็บแอปพลิเคชันติดตาม วิเคราะห์ และนำเสนอข้อมูลโรคระบาดในระดับจังหวัดของประเทศไทย",
  icons: {
    icon: "/images/HealthRiskHub.png",
    apple: "/images/HealthRiskHub.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body
        className={`${inter.variable} ${robotoMono.variable} min-h-screen bg-white text-gray-900 antialiased`}
      >
        <SessionProvider refetchOnWindowFocus={false}>
          <SessionTracker />

          <div className="flex min-h-screen flex-col">
            <NavbarSwitcher />

            {/* ✅ สำคัญ: items-start เพื่อให้ sticky ของ Sidebar ทำงานถูก */}
            <div className="flex flex-1 items-start">
              <Sidebar />

              {/* ✅ min-w-0 กันเนื้อหากราฟกว้าง ๆ ดัน layout เพี้ยน */}
              <main className="min-w-0 flex-1 bg-white p-6">{children}</main>
            </div>

            <SiteFooter />
          </div>

          {/* ✅ ปุ่มกลับขึ้นด้านบน ใช้ได้ทุกหน้า */}
          <ScrollToTopButton />
        </SessionProvider>
      </body>
    </html>
  );
}
