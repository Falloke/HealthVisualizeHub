// app/features/main/provincePage/Index.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useProvincialInfoStore } from "@/store/useProvincialInfoStore";

import DashboardHeader from "app/components/header/DashBoardHeader";
import BarGraph from "app/features/main/dashBoardPage/component/BarGraph";
import NarrativeSection from "app/features/main/dashBoardPage/component/NarrativeSection";
import SourceInfo from "app/features/main/dashBoardPage/component/SourceInfo";
import DiseaseInfo from "@/app/features/main/provincePage/component/DiseaseInfo";

export const dynamic = "force-dynamic";

function ProvincePage() {
  const searchParams = useSearchParams();
  const start_date = searchParams.get("start_date") || "";
  const end_date = searchParams.get("end_date") || "";
  const province = searchParams.get("province") || "";

  const {
    setProvince,
    setDateRange,
    diseaseCode: dCodeDash,
    diseaseNameTh: dNameDash,
  } = useDashboardStore();
  const setDiseaseProv = useProvincialInfoStore((s) => s.setDisease);

  // sync query -> dashboard store (ใช้หัวรายงานเหมือนหน้า dashboard)
  useEffect(() => {
    if (province) setProvince(province);
    if (start_date || end_date) {
      setDateRange(start_date || undefined, end_date || undefined);
    }
  }, [province, start_date, end_date, setProvince, setDateRange]);

  // sync โรคจาก dashboard -> store ของหน้า province (ใช้ใน DiseaseInfo)
  useEffect(() => {
    if (dCodeDash) setDiseaseProv(dCodeDash, dNameDash ?? null);
  }, [dCodeDash, dNameDash, setDiseaseProv]);

  return (
    <main className="min-h-screen w-full bg-white">
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 md:px-6 lg:px-8">
        {/* หัวรายงานแบบเดียวกับ Dashboard แต่ไม่มีการ์ดจำนวนผู้ป่วย/เสียชีวิตแล้ว */}
        <section className="w-full rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-pink-100">
          <DashboardHeader />
        </section>

        {/* กราฟหลักของจังหวัด */}
        <BarGraph />

        {/* ข้อมูลโรคเฉพาะจังหวัด */}
        <DiseaseInfo />

        {/* บทวิเคราะห์ AI + แหล่งที่มาข้อมูล */}
        <NarrativeSection />
        <SourceInfo />
      </div>
    </main>
  );
}

export default ProvincePage;
