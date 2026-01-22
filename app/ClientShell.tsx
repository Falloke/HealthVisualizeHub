// app/ClientShell.tsx
"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";

import NavbarSwitcher from "./components/navbar/NavbarSwitcher";
import Sidebar from "./components/sidebar/SideBar";
import SiteFooter from "./components/footer/SiteFooter";
import SessionTracker from "@/app/components/telemetry/SessionTracker";
import ScrollToTopButton from "./components/common/ScrollToTopButton";

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      {/* ✅ จุดสำคัญ: ห่อทุกอย่างที่อาจใช้ useSearchParams */}
      <Suspense fallback={null}>
        <SessionTracker />

        <div className="flex min-h-screen flex-col">
          <NavbarSwitcher />

          <div className="flex flex-1 items-start">
            <Sidebar />

            <main className="min-w-0 flex-1 bg-white p-6">{children}</main>
          </div>

          <SiteFooter />
        </div>

        <ScrollToTopButton />
      </Suspense>
    </SessionProvider>
  );
}
