// app/layout.tsx
import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

import ClientShell from "./ClientShell";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HealthVisualizeHub",
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
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
