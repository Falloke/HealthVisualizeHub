"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

// -------------------- UI helper --------------------

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
      style={{ height }}
      aria-busy="true"
    >
      <div className="h-full w-full animate-pulse rounded-lg bg-gray-100" />
    </div>
  );
}

// ✅ หน่วงการ render จนกว่า browser ว่าง (ไม่ต้องเลื่อนถึง)
function DeferRender({
  children,
  fallback,
  timeout = 1200,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  timeout?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // ✅ FIX: ใช้ globalThis แทน window.setTimeout (กัน TS ตี window เป็น never)
    let idleId: number | null = null;
    let tId: ReturnType<typeof setTimeout> | null = null;

    const done = () => {
      if (!cancelled) setReady(true);
    };

    const w = typeof window !== "undefined" ? window : undefined;

    if (w && "requestIdleCallback" in w) {
      idleId = (w as any).requestIdleCallback(done, { timeout });
    } else {
      // ✅ FIX: ไม่ใช้ window.setTimeout
      tId = globalThis.setTimeout(done, 0);
    }

    return () => {
      cancelled = true;

      if (idleId !== null && w && (w as any).cancelIdleCallback) {
        (w as any).cancelIdleCallback(idleId);
      }

      if (tId !== null) {
        globalThis.clearTimeout(tId);
      }
    };
  }, [timeout]);

  return <>{ready ? children : fallback}</>;
}

// ฟังก์ชันฟอร์แมตวันที่ไทย
function formatThaiDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);

  const TH_MONTHS = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];

  const day = String(date.getDate()).padStart(2, "0");
  const month = TH_MONTHS[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

// -------------------- Dynamic imports --------------------
// ✅ ชุดบน (Above-the-fold) โหลดทันที
const CompareProvincePatientsChart = dynamic(
  () => import("./component/CompareProvincePatientsChart"),
  { ssr: false, loading: () => <ChartSkeleton height={220} /> }
);

const CompareProvinceDeathsChart = dynamic(
  () => import("./component/CompareProvinceDeathsChart"),
  { ssr: false, loading: () => <ChartSkeleton height={180} /> }
);

const CompareRegionTop5Chart = dynamic(
  () => import("./component/CompareRegionTop5Chart"),
  { ssr: false, loading: () => <ChartSkeleton height={420} /> }
);

// ✅ ชุดล่าง (Below-the-fold) จะถูก “หน่วง” ด้วย DeferRender อีกชั้น
const CompareAgePatientsChart = dynamic(
  () => import("./component/CompareAgePatientsChart"),
  { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);

const CompareAgeDeathsChart = dynamic(
  () => import("./component/CompareAgeDeathsChart"),
  { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);

const CompareGenderPatientsChart = dynamic(
  () => import("./component/CompareGenderPatientsChart"),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> }
);

const CompareGenderDeathsChart = dynamic(
  () => import("./component/CompareGenderDeathsChart"),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> }
);

const CompareGenderTrendChart = dynamic(
  () => import("./component/CompareGenderTrendChart"),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);

const CompareNarrativeSection = dynamic(
  () => import("./component/CompareNarrativeSection"),
  { ssr: false, loading: () => <ChartSkeleton height={180} /> }
);

const FooterDashboard = dynamic(
  () => import("@/app/components/footer/FooterDashboard"),
  { ssr: false, loading: () => <div className="h-12" /> }
);

export default function CompareInfo() {
  // ✅ selector ลด re-render
  const diseaseNameTh = useDashboardStore((s) => s.diseaseNameTh);
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);

  const mainProvince = useCompareStore((s) => s.mainProvince);
  const compareProvince = useCompareStore((s) => s.compareProvince);

  const hasBoth = !!mainProvince && !!compareProvince;

  const diseaseLabel = useMemo(
    () => diseaseNameTh || "ยังไม่ได้เลือก",
    [diseaseNameTh]
  );

  const rangeText = useMemo(() => {
    const hasStart = Boolean(start_date);
    const hasEnd = Boolean(end_date);
    if (!hasStart && !hasEnd) return "";
    return `${formatThaiDate(start_date) || "-"} ถึง ${
      formatThaiDate(end_date) || "-"
    }`;
  }, [start_date, end_date]);

  return (
    <main className="w-full bg-white">
      {/* ✅ container เหมือนหน้า Dashboard */}
      <div className="mx-auto w-full max-w-[1920px] px-4 py-4 md:px-6 lg:px-8">
        <div className="space-y-4 md:space-y-6">
          {/* ------------------ ส่วนหัว ------------------ */}
          <header className="w-full">
            <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-pink-100 md:p-6">
              <div className="max-w-4xl">
                <h1 className="text-xl font-bold leading-snug text-green-800 sm:text-2xl lg:text-3xl">
                  การเปรียบเทียบสถานการณ์{" "}
                  <span className="text-green-900">{diseaseLabel}</span>{" "}
                  {hasBoth ? (
                    <>
                      ระหว่างจังหวัด {mainProvince} และจังหวัด {compareProvince}
                    </>
                  ) : (
                    <>ระหว่างจังหวัด (เลือกจังหวัดหลักและจังหวัดเปรียบเทียบให้ครบ)</>
                  )}
                </h1>

                {rangeText && (
                  <p className="text-basemt-2 text-gray-700 md:text-lg">
                    ช่วงวันที่{" "}
                    <span className="font-semibold text-gray-900">
                      {rangeText}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </header>

          {/* ------------------ ผู้ป่วย & ผู้เสียชีวิตสะสมรายจังหวัด ------------------ */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {hasBoth ? (
              <>
                <CompareProvincePatientsChart />
                <CompareProvinceDeathsChart />
              </>
            ) : (
              <>
                <ChartSkeleton height={220} />
                <ChartSkeleton height={180} />
              </>
            )}
          </section>

          {/* ------------------ Top 5 ในภูมิภาค ------------------ */}
          <section>
            {hasBoth ? <CompareRegionTop5Chart /> : <ChartSkeleton height={420} />}
          </section>

          {/* ------------------ ช่วงอายุ ------------------ */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {hasBoth ? (
              <>
                <DeferRender fallback={<ChartSkeleton height={280} />}>
                  <CompareAgePatientsChart />
                </DeferRender>
                <DeferRender fallback={<ChartSkeleton height={280} />}>
                  <CompareAgeDeathsChart />
                </DeferRender>
              </>
            ) : (
              <>
                <ChartSkeleton height={280} />
                <ChartSkeleton height={280} />
              </>
            )}
          </section>

          {/* ------------------ เพศ ------------------ */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {hasBoth ? (
              <>
                <DeferRender fallback={<ChartSkeleton height={260} />}>
                  <CompareGenderPatientsChart />
                </DeferRender>
                <DeferRender fallback={<ChartSkeleton height={260} />}>
                  <CompareGenderDeathsChart />
                </DeferRender>
              </>
            ) : (
              <>
                <ChartSkeleton height={260} />
                <ChartSkeleton height={260} />
              </>
            )}
          </section>

          {/* ------------------ แนวโน้มรายเดือน ------------------ */}
          <section>
            {hasBoth ? (
              <DeferRender fallback={<ChartSkeleton height={320} />}>
                <CompareGenderTrendChart />
              </DeferRender>
            ) : (
              <ChartSkeleton height={320} />
            )}
          </section>

          {/* ------------------ AI Narrative ------------------ */}
          <DeferRender fallback={<ChartSkeleton height={180} />} timeout={2000}>
            <CompareNarrativeSection />
          </DeferRender>

          <DeferRender fallback={<div className="h-12" />} timeout={2500}>
            <FooterDashboard />
          </DeferRender>
        </div>
      </div>
    </main>
  );
}
