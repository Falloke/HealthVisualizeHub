// app/components/navbar/NavBar.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Menu
} from "lucide-react";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    // ใช้ header ตัวจริงของหน้า พร้อม id/data-app ให้ตัวคำนวณไปอ้างอิง
    <header
      id="app-navbar"
      data-app="navbar"
      className="sticky inset-x-0 top-0 z-50"
    >
      {/* สูงนิ่ง 64px = h-16 ให้ตรงกับตัวคำนวณใน page.tsx */}
      <nav
        aria-label="แถบนำทางหลัก"
        className="flex h-16 items-center justify-between bg-sky-300/95 px-6 text-gray-900 shadow-md backdrop-blur supports-[backdrop-filter]:bg-sky-300/80"
      >
        {/* Logo และเมนูซ้าย */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-sky-800 hover:opacity-90"
          >
            HealthRiskHub
          </Link>
          <div className="hidden gap-6 text-sm font-medium text-gray-900 md:flex">
            <Link href="/" className="hover:opacity-90">
              หน้าแรก
            </Link>
            <Link href="/dashBoard" className="hover:opacity-90">
              ข้อมูลภาพรวม
            </Link>
            <Link href="/provincialInfo" className="hover:opacity-90">
              ข้อมูลรายจังหวัด
            </Link>
            <Link href="/compareInfo" className="hover:opacity-90">
              เปรียบเทียบข้อมูล
            </Link>
          </div>
        </div>

        {/* ปุ่มเข้าสู่ระบบ/สมัครสมาชิก */}
        <div className="md:flex hidden items-center gap-3 text-sm font-medium">
          <Link
            href="/login"
            className="rounded-full border border-gray-900 px-4 py-1 text-gray-900 transition hover:bg-white/90 hover:text-sky-900"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-white px-4 py-1 text-sky-800 shadow-sm transition hover:bg-sky-50"
          >
            สมัครสมาชิก
          </Link>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden cursor-pointer rounded-md bg-white/90 p-2 text-sky-800 shadow-sm hover:bg-white"
        >
          <Menu />
        </button>
      </nav>
      <div
        className={`
          md:hidden
          sticky inset-x-0 top-[72px]
          z-50
          bg-sky-200 px-6
          text-sm font-medium flex flex-col gap-2 text-gray-900
          transition-all duration-300 ease-in-out
          ${mobileOpen
            ? "max-h-100 opacity-100 translate-y-0 py-4"
            : "max-h-0 opacity-0 -translate-y-2 py-0 overflow-hidden"
          }
        `}
      >
        <Link href="/" onClick={() => setMobileOpen(false)} className="border-l border-sky-200 hover:bg-sky-100 hover:border-gray-900 pl-1 py-2">
          หน้าแรก
        </Link>
        <Link href="/dashBoard" onClick={() => setMobileOpen(false)} className="border-l border-sky-200 hover:bg-sky-100 hover:border-gray-900 pl-1 py-2">
          ข้อมูลภาพรวม
        </Link>
        <Link href="/provincialInfo" onClick={() => setMobileOpen(false)} className="border-l border-sky-200 hover:bg-sky-100 hover:border-gray-900 pl-1 py-2">
          ข้อมูลรายจังหวัด
        </Link>
        <Link href="/compareInfo" onClick={() => setMobileOpen(false)} className="border-l border-sky-200 hover:bg-sky-100 hover:border-gray-900 pl-1 py-2">
          เปรียบเทียบข้อมูล
        </Link>
        
        <div className="flex items-center gap-3 text-sm font-medium">
          <Link
            href="/login"
            className="rounded-full border border-gray-900 px-4 py-1 text-gray-900 transition hover:bg-white/90 hover:text-sky-900"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-white px-4 py-1 text-sky-800 shadow-sm transition hover:bg-sky-50"
          >
            สมัครสมาชิก
          </Link>
        </div>
      </div>
    </header>
  );
}
