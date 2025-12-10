// E:\HealtRiskHub\app\(main)\home\page.tsx
"use client";

import HomePage from "@/app/features/main/homePage/Index";
import HomeSidebar from "@/app/components/sidebar/HomeSidebar";
import { useEffect, useMemo, useState } from "react";

type Insets = { top: number; bottom: number };

export default function HomePageRender() {
  const [insets, setInsets] = useState<Insets>({ top: 64, bottom: 128 });

  const measure = useMemo(
    () => () => {
      // วัดความสูงจริงจาก #app-navbar และ #app-footer
      const nav = document.getElementById("app-navbar");
      const footer = document.getElementById("app-footer");
      const top = Math.ceil(nav?.getBoundingClientRect().height ?? 64);
      const bottom = Math.ceil(footer?.getBoundingClientRect().height ?? 128);
      setInsets({ top, bottom });
    },
    []
  );

  useEffect(() => {
    // ไม่ล็อกสกรอลล์ body แล้ว
    measure();
    const roNavbar = new ResizeObserver(measure);
    const roFooter = new ResizeObserver(measure);
    const nav = document.getElementById("app-navbar");
    const footer = document.getElementById("app-footer");
    if (nav) roNavbar.observe(nav);
    if (footer) roFooter.observe(footer);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      roNavbar.disconnect();
      roFooter.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure]);

  return (
    // กรอบหลักยัง fixed เพื่อกันซ้อน navbar/footer แต่ให้สกรอลล์ได้ใน main
    <div
      className="fixed z-0 flex w-full items-stretch"
      style={{ top: insets.top, bottom: insets.bottom, left: 0, right: 0 }}
    >
      {/* Sidebar สูงเต็มกรอบ */}
      <aside className="h-full w-[280px] md:w-[300px] shrink-0">
        <HomeSidebar />
      </aside>

      {/* อนุญาตเลื่อนภายในพื้นที่คอนเทนต์ */}
      <main className="h-full min-w-0 flex-1 overflow-auto px-5 py-4">
        <HomePage />
      </main>
    </div>
  );
}
