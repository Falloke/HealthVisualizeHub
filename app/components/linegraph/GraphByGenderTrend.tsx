// app/components/bargraph/GraphByGenderTrend.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";
import { useDashboardStore } from "@/store/useDashboardStore";
import { TH_NUMBER } from "@/app/components/bargraph/GraphUtils";

type TrendData = {
  month: string; // คาดว่าเป็น "YYYY-MM" หรือ "YYYY-MM-DD"
  male: number;
  female: number;
};

// แปลงสตริงเดือน -> ป้ายเดือนภาษาไทย (ม.ค. 2567)
function toThaiMonthLabel(s?: string): string {
  if (!s) return "";
  // รองรับ "YYYY-MM", "YYYY/MM", "YYYY-MM-DD"
  const m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  try {
    const y = m ? Number(m[1]) : new Date(s).getFullYear();
    const mo = m ? Number(m[2]) - 1 : new Date(s).getMonth();
    const d = new Date(y, mo, 1);
    // locale 'th-TH' จะแสดงปี พ.ศ. อัตโนมัติ
    return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

// Tooltip แบบกำหนดเอง (ใส่ “ราย” และเดือนภาษาไทย)
function TrendTooltip({
  active,
  payload,
}: TooltipProps<number, string>): JSX.Element | null {
  if (active && payload && payload.length) {
    const row = payload[0].payload as any;
    const label = toThaiMonthLabel(row?.month);

    const male = Number(row?.male ?? 0);
    const female = Number(row?.female ?? 0);

    return (
      <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
        <div className="mb-1 font-medium text-gray-900">{label}</div>
        <div className="flex items-center gap-2 text-gray-700">
          <span
            className="inline-block h-2 w-2 rounded"
            style={{ background: "#4FC3F7" }}
          />
          ชาย : <span className="font-semibold">{TH_NUMBER(male)}</span> ราย
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-gray-700">
          <span
            className="inline-block h-2 w-2 rounded"
            style={{ background: "#F48FB1" }}
          />
          หญิง : <span className="font-semibold">{TH_NUMBER(female)}</span> ราย
        </div>
      </div>
    );
  }
  return null;
}

export default function GraphByGenderTrend() {
  const { province, start_date, end_date } = useDashboardStore();
  const [raw, setRaw] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const url = `/api/dashBoard/gender-trend?start_date=${start_date}&end_date=${end_date}&province=${province}`;
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลแนวโน้มไม่สำเร็จ");
        const json = text ? (JSON.parse(text) as TrendData[]) : [];
        setRaw(json ?? []);
      } catch (err) {
        console.error("❌ Fetch error (gender-trend):", err);
        setRaw([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [province, start_date, end_date]);

  // เติมฟิลด์เดือนภาษาไทยไว้ในชุดข้อมูลเลย จะได้ใช้ซ้ำทั้งแกน X และ tooltip
  const data = useMemo(
    () =>
      (raw ?? []).map((r) => ({
        ...r,
        month_th: toThaiMonthLabel(r.month),
      })),
    [raw]
  );

  return (
    <div className="rounded bg-white p-4 shadow">
      {/* ใส่หน่วยที่ชื่อกราฟตามที่ขอ */}
      <h4 className="mb-2 font-bold">
        จำนวนผู้ป่วยจำแนกตามเพศ (รายเดือน, หน่วย: ราย) — {province}
      </h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 56, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="month_th"
              interval="preserveStartEnd" // โชว์หัว-ท้ายแน่ ๆ
              tickMargin={8}
              padding={{ left: 0, right: 28 }} // กันค่ายื่นขอบขวา
            />
            <YAxis
              tickFormatter={TH_NUMBER}
              tickMargin={8}
              allowDecimals={false}
            />
            <Tooltip content={<TrendTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="male"
              stroke="#4FC3F7"
              name="ชาย"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="female"
              stroke="#F48FB1"
              name="หญิง"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
