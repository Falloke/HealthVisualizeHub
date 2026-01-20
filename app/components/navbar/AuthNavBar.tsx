// app/components/navbar/AuthNavBar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  ChevronDown,
  LogOut,
  Search,
  Settings,
  User,
  Shield,
  LayoutDashboard,
  Users as UsersIcon,
  Stethoscope,
  Menu
} from "lucide-react";

const AuthNavBar = () => {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fullName =
    (session?.user?.first_name ?? "") + " " + (session?.user?.last_name ?? "");

  const role = session?.user?.role?.toLowerCase();
  const isAdmin = role === "admin";

  return (
    <>
      <nav className="sticky inset-x-0 top-0 z-50 flex items-center justify-between bg-sky-300/95 px-6 py-4 text-gray-900 shadow-md backdrop-blur supports-[backdrop-filter]:bg-sky-300/80">
        {/* ซ้าย: โลโก้ + เมนูหลัก */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-sky-800 hover:opacity-90"
          >
            HealthVisualizeHub
          </Link>

          <div className="gap-6 text-sm font-medium text-gray-900 md:flex hidden">
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

            {/* เมนูเฉพาะแอดมิน บนแถบซ้าย */}
            {isAdmin && (
              <>
                <span className="mx-2 text-gray-500">|</span>
                <Link
                  href="/admin/admindashboard"
                  className="inline-flex items-center gap-2 hover:opacity-90"
                >
                  <Shield className="h-4 w-4" />
                  หน้าผู้ดูแล
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ขวา: โปรไฟล์ Dropdown */}
        <div className="relative z-50 md:block hidden">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:bg-white"
          >
            <span>
              {isAdmin ? "System Admin" : fullName.trim() || "บัญชีของฉัน"}
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-64 rounded-lg border bg-white shadow-lg z-100">
              {/* เมนูทั่วไป */}
              <Link
                href="/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                onClick={() => setOpen(false)}
              >
                <User className="h-4 w-4" /> โปรไฟล์ของฉัน
              </Link>
              <Link
                href="/history"
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                onClick={() => setOpen(false)}
              >
                <Search className="h-4 w-4" /> ประวัติการค้นหา
              </Link>
              <Link
                href="/search-template"
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                onClick={() => setOpen(false)}
              >
                <Settings className="h-4 w-4" /> สร้างรูปแบบการค้นหา
              </Link>

              {/* กลุ่มเมนูสำหรับแอดมินเท่านั้น */}
              {isAdmin && (
                <>
                  <div className="my-1 border-t" />
                  <div className="px-4 py-1 text-[11px] font-semibold uppercase text-sky-700">
                    สำหรับแอดมิน
                  </div>
                  <Link
                    href="/admin/admindashboard"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                    onClick={() => setOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4" /> แดชบอร์ดแอดมิน
                  </Link>
                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                    onClick={() => setOpen(false)}
                  >
                    <UsersIcon className="h-4 w-4" /> จัดการผู้ใช้งาน
                  </Link>
                  <Link
                    href="/admin/diseases"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                    onClick={() => setOpen(false)}
                  >
                    <Stethoscope className="h-4 w-4" /> จัดการข้อมูลโรค
                  </Link>
                </>
              )}

              <div className="my-1 border-t" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-sky-50"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
              >
                <LogOut className="h-4 w-4" /> ออกจากระบบ
              </button>
            </div>
          )}
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

        <div className="relative z-50">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:bg-white"
          >
            <span>
              {isAdmin ? "System Admin" : fullName.trim() || "บัญชีของฉัน"}
            </span>
            <ChevronDown className="h-4 w-4" />
          </button>
          {open && (<div className="absolute left-0 mt-2 w-64 rounded-lg border bg-white shadow-lg z-100">
            {/* เมนูทั่วไป */}
            <Link
              href="/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => setOpen(false)}
            >
              <User className="h-4 w-4" /> โปรไฟล์ของฉัน
            </Link>
            <Link
              href="/history"
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => setOpen(false)}
            >
              <Search className="h-4 w-4" /> ประวัติการค้นหา
            </Link>
            <Link
              href="/search-template"
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-4 w-4" /> สร้างรูปแบบการค้นหา
            </Link>

            {/* กลุ่มเมนูสำหรับแอดมินเท่านั้น */}
            {isAdmin && (
              <>
                <div className="my-1 border-t" />
                <div className="px-4 py-1 text-[11px] font-semibold uppercase text-sky-700">
                  สำหรับแอดมิน
                </div>
                <Link
                  href="/admin/admindashboard"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                  onClick={() => setOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" /> แดชบอร์ดแอดมิน
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                  onClick={() => setOpen(false)}
                >
                  <UsersIcon className="h-4 w-4" /> จัดการผู้ใช้งาน
                </Link>
                <Link
                  href="/admin/diseases"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-800 hover:bg-sky-50"
                  onClick={() => setOpen(false)}
                >
                  <Stethoscope className="h-4 w-4" /> จัดการข้อมูลโรค
                </Link>
              </>
            )}

            <div className="my-1 border-t" />
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-sky-50"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              <LogOut className="h-4 w-4" /> ออกจากระบบ
            </button>
          </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AuthNavBar;
