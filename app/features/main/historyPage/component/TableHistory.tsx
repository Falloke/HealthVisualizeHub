"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Trash2 } from "lucide-react";

type HistoryItem = {
  id: string;
  createdAt: string;       // ISO เช่น "2025-07-25"
  searchName: string;      // ชื่อการค้นหา
  disease: string;         // โรค
  provinces: string;       // จังหวัด (อาจหลายจังหวัดคั่นด้วย " - ")
  startDate: string;       // ISO
  endDate: string;         // ISO
  color?: string;          // hex เช่น "#E89623" สำหรับจุดสี
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
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export default function TableHistory() {
  const [rows, setRows] = useState<HistoryItem[]>(initialRows);

  const handleDelete = (id: string) => {
    // TODO: เรียก API ลบจริงภายหลัง
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-pink-600">ประวัติการค้นหา</h2>

        {/* ✅ ปุ่มทางขวา: ไปหน้า “ดูการสร้าง” (Search) */}
        <Link
          href="/search"
          className="rounded-md bg-pink-500 px-4 py-2 text-white hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          การค้นหาที่สร้างไว้
        </Link>
      </div>

      {/* Table wrapper */}
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="min-w-full table-fixed">
          <thead className="bg-pink-50 text-left text-sm text-gray-600">
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

          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  ยังไม่มีประวัติการค้นหา —
                  <Link href="/search-template" className="text-pink-600 underline underline-offset-2">
                    สร้างการค้นหา
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-pink-50/40">
                  {/* ดูรายละเอียด: พาไปหน้า /search */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/search`}
                      className="inline-flex items-center justify-center rounded-full p-2 text-gray-600 hover:bg-pink-100 hover:text-pink-600"
                      aria-label={`ดูผลการค้นหา ${r.searchName}`}
                      title="ดูรายละเอียด"
                    >
                      <Search className="h-5 w-5" />
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-sm text-gray-700">
                    {fmtMMDDYYYY(r.createdAt)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: r.color || "#9CA3AF" }}
                        aria-hidden
                      />
                      <span className="truncate font-medium text-gray-800">{r.searchName}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-sm text-gray-700">{r.disease}</td>

                  <td className="px-4 py-3 text-sm text-gray-700">
                    <span className="line-clamp-1">{r.provinces}</span>
                  </td>

                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/search`}
                      className="text-pink-600 hover:underline"
                      title="เปิดดูช่วงวันที่นี้ในหน้า Search"
                    >
                      {fmtMMDDYYYY(r.startDate)} - {fmtMMDDYYYY(r.endDate)}
                    </Link>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="ml-auto inline-flex rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
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
  );
}
