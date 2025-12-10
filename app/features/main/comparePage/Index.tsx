// E:\HealtRiskHub\app\features\main\comparePage\Index.tsx
"use client";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

import CompareProvincePatientsChart from "@/app/features/main/comparePage/component/CompareProvincePatientsChart";
import CompareProvinceDeathsChart from "@/app/features/main/comparePage/component/CompareProvinceDeathsChart";
import CompareAgePatientsChart from "@/app/features/main/comparePage/component/CompareAgePatientsChart";
import CompareAgeDeathsChart from "@/app/features/main/comparePage/component/CompareAgeDeathsChart";
import CompareRegionTop5Chart from "@/app/features/main/comparePage/component/CompareRegionTop5Chart";

import CompareGenderPatientsChart from "@/app/features/main/comparePage/component/CompareGenderPatientsChart";
import CompareGenderDeathsChart from "@/app/features/main/comparePage/component/CompareGenderDeathsChart";
import CompareGenderTrendChart from "@/app/features/main/comparePage/component/CompareGenderTrendChart";

import CompareNarrativeSection from "./component/CompareNarrativeSection";
import FooterDashboard from "@/app/components/footer/FooterDashboard";

// ฟังก์ชันฟอร์แมตวันที่ไทย ให้หน้าตาเหมือนหน้า Dashboard
function formatThaiDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number); // YYYY-MM-DD
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

const CompareInfo = () => {
  const { diseaseNameTh, start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const hasBoth = !!mainProvince && !!compareProvince;
  const diseaseLabel = diseaseNameTh || "ยังไม่ได้เลือก";

  const hasStart = Boolean(start_date);
  const hasEnd = Boolean(end_date);
  const rangeText =
    hasStart || hasEnd
      ? `${formatThaiDate(start_date) || "-"} ถึง ${
          formatThaiDate(end_date) || "-"
        }`
      : "";

  return (
    <main className="min-h-screen w-full bg-white">
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 md:px-6 lg:px-8">
        {/* ------------------ ส่วนหัว ------------------ */}
        <header className="rounded-xl border-b border-pink-100 bg-white px-4 py-5 shadow-sm">
          <div className="max-w-4xl">
            <h1 className="text-xl font-bold leading-snug text-pink-700 sm:text-2xl lg:text-3xl">
              การเปรียบเทียบสถานการณ์{" "}
              <span className="text-pink-900">{diseaseLabel}</span>{" "}
              {hasBoth
                ? `ระหว่างจังหวัด ${mainProvince} และจังหวัด ${compareProvince}`
                : "ระหว่างจังหวัดต่าง ๆ"}
            </h1>

            {(hasStart || hasEnd) && (
              <p className="mt-2 text-sm text-gray-700 sm:text-base">
                ช่วงวันที่{" "}
                <span className="font-semibold text-gray-900">
                  {rangeText}
                </span>
              </p>
            )}

            <p className="mt-1 text-xs text-gray-600 sm:text-sm">
              จังหวัดหลัก:{" "}
              <span className="font-semibold">
                {mainProvince || "ยังไม่ได้เลือกจากแถบด้านซ้าย"}
              </span>{" "}
              · จังหวัดที่ต้องการเปรียบเทียบ:{" "}
              <span className="font-semibold">
                {compareProvince || "ยังไม่ได้เลือก"}
              </span>
            </p>

            {!hasBoth && (
              <p className="mt-1 text-xs text-gray-500">
                เลือกจังหวัดทั้งสองฝั่งจาก Sidebar ให้ครบ 2 จังหวัดก่อน
                จากนั้นกราฟเปรียบเทียบจะปรากฏด้านล่าง
              </p>
            )}
          </div>
        </header>

        {/* ------------------ ผู้ป่วย & ผู้เสียชีวิตสะสมรายจังหวัด ------------------ */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {hasBoth ? (
            <>
              <CompareProvincePatientsChart />
              <CompareProvinceDeathsChart />
            </>
          ) : (
            <div className="rounded bg-white p-4 text-sm text-gray-500 shadow lg:col-span-2">
              (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar
              ให้ครบ 2 จังหวัดก่อน เพื่อแสดงกราฟผู้ป่วยและผู้เสียชีวิตสะสม)
            </div>
          )}
        </section>

        {/* ------------------ Top 5 ในภูมิภาค ------------------ */}
        <section>
          {hasBoth ? (
            <CompareRegionTop5Chart />
          ) : (
            <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
              (กราฟ Top 5 จังหวัดในภูมิภาคจะแสดงเมื่อเลือกจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบครบ
              2 จังหวัด)
            </div>
          )}
        </section>

        {/* ------------------ ช่วงอายุ ------------------ */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {hasBoth ? (
            <>
              <CompareAgePatientsChart />
              <CompareAgeDeathsChart />
            </>
          ) : (
            <div className="rounded bg-white p-4 text-sm text-gray-500 shadow lg:col-span-2">
              (เลือกจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบให้ครบ
              เพื่อดูผู้ป่วยและผู้เสียชีวิตตามช่วงอายุ)
            </div>
          )}
        </section>

        {/* ------------------ เพศ (กราฟแท่ง) ------------------ */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {hasBoth ? (
            <>
              <CompareGenderPatientsChart />
              <CompareGenderDeathsChart />
            </>
          ) : (
            <div className="rounded bg-white p-4 text-sm text-gray-500 shadow lg:col-span-2">
              (ระบบจะแสดงกราฟผู้ป่วยและผู้เสียชีวิตแยกตามเพศ
              เมื่อเลือกจังหวัดทั้งสองฝั่งครบแล้ว)
            </div>
          )}
        </section>

        {/* ------------------ แนวโน้มผู้ป่วยแยกตามเพศ (รายเดือน) ------------------ */}
        <section>
          {hasBoth ? (
            <CompareGenderTrendChart />
          ) : (
            <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
              (กราฟเปรียบเทียบแนวโน้มผู้ป่วยแยกตามเพศรายเดือน
              จะแสดงเมื่อเลือกจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบครบ 2 จังหวัด)
            </div>
          )}
        </section>

        {/* ------------------ AI Narrative ------------------ */}
        <CompareNarrativeSection />
        <FooterDashboard />
      </div>
    </main>
  );
};

export default CompareInfo;
