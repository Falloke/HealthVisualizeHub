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
        {/* ทำให้คอมโพเนนต์ฝั่ง client ใช้ session ได้ทุกหน้า */}
        <SessionProvider refetchOnWindowFocus={false}>
          {/* ติดตามการใช้งาน (start / heartbeat / end) เฉพาะตอนที่ผู้ใช้ล็อกอิน */}
          <SessionTracker />

          {/* โครงสร้างหลักเป็นคอลัมน์ -> Footer ชิดล่างเสมอ */}
          <div className="flex min-h-screen flex-col">
            <NavbarSwitcher />

            {/* พื้นที่หลักซ้าย/ขวา: Sidebar + Main */}
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 bg-white p-6">{children}</main>
            </div>

            <SiteFooter />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
