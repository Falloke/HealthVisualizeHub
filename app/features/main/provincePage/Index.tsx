"use client";

// app/features/main/provincePage/Index.tsx

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

  useEffect(() => {
    if (province) setProvince(province);
    if (start_date || end_date) {
      setDateRange(start_date || undefined, end_date || undefined);
    }
  }, [province, start_date, end_date, setProvince, setDateRange]);

  useEffect(() => {
    if (dCodeDash) setDiseaseProv(dCodeDash, dNameDash ?? null);
  }, [dCodeDash, dNameDash, setDiseaseProv]);

  return (
    <main className="w-full bg-white">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-6 lg:px-6 lg:py-8 xl:px-8">
        <div className="space-y-6 lg:space-y-8">
          {/* Header */}
          <section className="w-full overflow-hidden rounded-xl bg-white p-4 lg:p-6 shadow-sm ring-1 ring-pink-100">
            <DashboardHeader />
          </section>

          {/* Graph */}
          <section className="w-full overflow-hidden rounded-xl bg-white p-4 lg:p-6 shadow-sm ring-1 ring-gray-100">
            <BarGraph />
          </section>

          {/* Disease info */}
          <section className="w-full overflow-hidden rounded-xl bg-white p-4 lg:p-6 shadow-sm ring-1 ring-gray-100">
            <DiseaseInfo />
          </section>

          {/* ✅ AI narrative: ไม่ห่อด้วย section แล้ว เพื่อไม่ให้ซ้อนกัน */}
          <NarrativeSection />

          {/* Sources */}
          <section className="w-full overflow-hidden rounded-xl bg-white p-4 lg:p-6 shadow-sm ring-1 ring-gray-100">
            <SourceInfo />
          </section>
        </div>
      </div>
    </main>
  );
}

export default ProvincePage;
