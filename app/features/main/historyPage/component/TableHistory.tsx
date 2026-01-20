"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Trash2 } from "lucide-react";

type HistoryItem = {
  id: string;
  createdAt: string; // ISO เช่น "2025-07-25"
  searchName: string; // ชื่อการค้นหา
  disease: string; // โรค
  provinces: string; // จังหวัด (อาจหลายจังหวัดคั่นด้วย " - ")
  startDate: string; // ISO
  endDate: string; // ISO
  color?: string; // hex เช่น "#E89623"
};

// ตัวอย่างข้อมูล mock (ลบออกหรือแทนที่ด้วย state จาก API ภายหลัง)
const initialRows: HistoryItem[] = [
  {
    id: "1",
    createdAt: "2025-07-25",
    searchName: "บ้านพ่อ",
    disease: "โรคไข้หวัดใหญ่",
    provinces: "เชียงใหม่",
    startDate: "2025-07-25",
    endDate: "2025-08-01",
    color: "#F97316",
  },
  {
    id: "2",
    createdAt: "2025-07-16",
    searchName: "บ้านนอกและบ้านแม่",
    disease: "โรคโควิด",
    provinces: "เชียงใหม่ - กรุงเทพมหานคร",
    startDate: "2025-07-14",
    endDate: "2025-07-24",
    color: "#22C55E",
  },
  {
    id: "3",
    createdAt: "2025-07-09",
    searchName: "มหาสนั่นสะท้านลูกค้า",
    disease: "โรคไข้หวัดใหญ่",
    provinces: "เชียงใหม่ - เชียงราย",
    startDate: "2025-07-07",
    endDate: "2025-07-13",
    color: "#3B82F6",
  },
];

function fmtMMDDYYYY(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function colorSafe(c?: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(c ?? "") ? (c as string) : "#9CA3AF";
}

export default function TableHistory() {
  const [rows, setRows] = useState<HistoryItem[]>(initialRows);

  const handleDelete = (id: string) => {
    // TODO: เรียก API ลบจริงภายหลัง
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-sky-100 to-white px-4 py-8 md:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-sky-700">ประวัติการค้นหา</h2>
          </div>

          {/* ปุ่มทางขวา: ไปหน้า “การค้นหาที่สร้างไว้” */}
          <Link
            href="/search"
            className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            การค้นหาที่สร้างไว้
          </Link>
        </div>

        {/* Table wrapper */}
        <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead className="bg-sky-50 text-left text-sm text-slate-600">
                <tr>
                  <th className="w-16 px-4 py-3">ค้นหา</th>
                  <th className="w-36 px-4 py-3">วันที่ค้นหา</th>
                  <th className="px-4 py-3">ชื่อการค้นหา</th>
                  <th className="w-40 px-4 py-3">โรค</th>
                  <th className="w-64 px-4 py-3">จังหวัด</th>
                  <th className="w-56 px-4 py-3">ระยะเวลา</th>
                  <th className="w-16 px-4 py-3 text-right">ลบ</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      ยังไม่มีประวัติการค้นหา —{" "}
                      <Link
                        href="/search-template"
                        className="text-sky-700 underline underline-offset-2"
                      >
                        สร้างการค้นหา
                      </Link>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="transition-colors hover:bg-sky-50/60"
                    >
                      {/* ดูรายละเอียด: พาไปหน้า /search */}
                      <td className="px-4 py-3">
                        <Link
                          href="/search"
                          className="inline-flex items-center justify-center rounded-full p-2 text-slate-600 hover:bg-sky-100 hover:text-sky-700"
                          aria-label={`ดูผลการค้นหา ${r.searchName}`}
                          title="ดูรายละเอียด"
                        >
                          <Search className="h-5 w-5" />
                        </Link>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {fmtMMDDYYYY(r.createdAt)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-200"
                            style={{ backgroundColor: colorSafe(r.color) }}
                            aria-hidden
                          />
                          <span className="truncate font-medium text-slate-800">
                            {r.searchName}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        {r.disease}
                      </td>

                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span className="line-clamp-1">{r.provinces}</span>
                      </td>

                      <td className="px-4 py-3 text-sm">
                        <Link
                          href="/search"
                          className="text-sky-700 hover:underline"
                          title="เปิดดูช่วงวันที่นี้ในหน้า Search"
                        >
                          {fmtMMDDYYYY(r.startDate)} - {fmtMMDDYYYY(r.endDate)}
                        </Link>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="ml-auto inline-flex rounded-full p-2 text-slate-600 hover:bg-red-50 hover:text-red-600"
                          aria-label={`ลบ ${r.searchName}`}
                          title="ลบ"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
