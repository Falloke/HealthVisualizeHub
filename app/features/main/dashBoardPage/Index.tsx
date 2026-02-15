// D:\HealtRiskHub\app\features\main\dashBoardPage\Index.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/store/useDashboardStore";

import DashboardHeader from "app/components/header/DashBoardHeader";
import BarGraph from "./component/BarGraph";
import NarrativeSection from "./component/NarrativeSection";
import SourceInfo from "app/features/main/dashBoardPage/component/SourceInfo";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const start_date = searchParams.get("start_date") || "";
  const end_date = searchParams.get("end_date") || "";
  const province = searchParams.get("province") || "";
  const diseaseName = searchParams.get("disease") || "";

  // sync ค่าจาก query -> global store ให้กราฟ/ส่วนอื่น ๆ ใช้ต่อ
  const { setProvince, setDateRange, setDisease } = useDashboardStore();

  useEffect(() => {
    if (province) setProvince(province);
    if (start_date || end_date) {
      setDateRange(start_date || undefined, end_date || undefined);
    }

    if (diseaseName) {
      // รองรับ signature setDisease แบบเก่า/ใหม่
      try {
        (setDisease as any)("", diseaseName, "");
      } catch {
        try {
          (setDisease as any)({
            code: "",
            name_th: diseaseName,
            name_en: "",
          });
        } catch {
          // ไม่มี setDisease ก็ข้ามไป
        }
      }
    }
  }, [province, start_date, end_date, diseaseName, setProvince, setDateRange, setDisease]);

  return (
    <main className="min-h-screen w-full bg-white">
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 py-4 md:px-6 lg:px-8">
        {/* ===== หัวรายงาน เต็มความกว้างแถวบน ===== */}
        <section className="w-full rounded-xl bg-white px-4 py-4 shadow-sm ring-1 ring-pink-100">
          <DashboardHeader />
        </section>

        {/* ===== เนื้อหาหลักของ Dashboard ===== */}
        <BarGraph />
        <NarrativeSection />
        <SourceInfo />
      </div>
    </main>
  );
}
