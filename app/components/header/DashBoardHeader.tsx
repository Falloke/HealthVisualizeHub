"use client";

import { useDashboardStore } from "@/store/useDashboardStore";

// ฟังก์ชันฟอร์แมตวันที่ไทย (07 ตุลาคม 2568)
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
  const year = date.getFullYear() + 543; // แปลงเป็น พ.ศ.
  return `${day} ${month} ${year}`;
}

const DashboardHeader = () => {
  const { province, start_date, end_date, diseaseNameTh } = useDashboardStore();

  const hasStart = Boolean(start_date);
  const hasEnd = Boolean(end_date);
  const rangeText =
    hasStart || hasEnd
      ? `${formatThaiDate(start_date) || "-"} ถึง ${
          formatThaiDate(end_date) || "-"
        }`
      : "";

  return (
    <header className="w-full">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-4 md:px-6 lg:px-8">
        {/* หัวข้อแบบประโยคยาว แล้วให้ browser ตัดบรรทัดเอง */}
        <h1 className="max-w-4xl text-xl font-bold leading-snug text-green-800 sm:text-2xl lg:text-3xl">
          รายงานสถานการณ์{" "}
          <span className="text-green-900">
            {diseaseNameTh || "ไข้หวัดใหญ่"}
          </span>{" "}
          {province ? `ในจังหวัด ${province}` : "ทั่วประเทศ"}
        </h1>

        {(hasStart || hasEnd) && (
          <p className="mt-2 text-sm text-gray-700 sm:text-base">
            ช่วงวันที่{" "}
            <span className="font-semibold text-gray-900">{rangeText}</span>
          </p>
        )}
      </div>
    </header>
  );
};

export default DashboardHeader;
