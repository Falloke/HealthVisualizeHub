// app/features/main/comparePage/component/CompareGenderTrendChart.tsx
"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";
import { TH_NUMBER } from "@/app/components/bargraph/GraphUtils";

type CombinedRow = {
  month: string;
  month_th: string;
  male_main?: number;
  female_main?: number;
  male_compare?: number;
  female_compare?: number;
};

type APIResp = {
  ok?: boolean;
  rows?: CombinedRow[];
  error?: string;
};

// ---------- tooltip ----------

function toThaiMonthLabel(s?: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  try {
    const y = m ? Number(m[1]) : new Date(s).getFullYear();
    const mo = m ? Number(m[2]) - 1 : new Date(s).getMonth();
    const d = new Date(y, mo, 1);
    return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
  } catch {
    return s ?? "";
  }
}

function CompareTrendTooltip({
  active,
  payload,
}: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as CombinedRow;

  return (
    <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
      <div className="mb-1 font-medium text-gray-900">
        {row.month_th || toThaiMonthLabel(row.month)}
      </div>
      {payload.map((p) => {
        const val = Number(p.value ?? 0);
        if (!isFinite(val)) return null;
        return (
          <div
            key={String(p.dataKey)}
            className="flex items-center gap-2 text-gray-700"
          >
            <span
              className="inline-block h-2 w-2 rounded"
              style={{ background: p.color || "#8884d8" }}
            />
            {p.name} :{" "}
            <span className="font-semibold">{TH_NUMBER(val)}</span> ราย
          </div>
        );
      })}
    </div>
  );
}

// ---------- main component ----------

export default function CompareGenderTrendChart() {
  const { start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const hasBoth = !!mainProvince && !!compareProvince;

  useEffect(() => {
    if (!hasBoth) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const qs = new URLSearchParams({
          start_date: start_date || "",
          end_date: end_date || "",
          mainProvince: mainProvince!,
          compareProvince: compareProvince!,
        }).toString();

        const res = await fetch(`/api/compareInfo/gender-trend?${qs}`, {
          cache: "no-store",
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || "โหลดข้อมูลแนวโน้มไม่สำเร็จ");
        }

        const json: APIResp = text ? JSON.parse(text) : {};
        if (cancelled) return;

        setRows(json.rows ?? []);
      } catch (err) {
        console.error("❌ Fetch error (compare gender-trend):", err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasBoth, mainProvince, compareProvince, start_date, end_date]);

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar
        ให้ครบก่อน เพื่อดูกราฟแนวโน้มผู้ป่วยจำแนกตามเพศ)
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-1 font-bold">
        เปรียบเทียบแนวโน้มผู้ป่วยจำแนกตามเพศ (รายเดือน, หน่วย: ราย)
      </h4>
      <p className="mb-3 text-xs text-gray-600">
        ช่วงเวลา: {start_date || "—"} – {end_date || "—"} | จังหวัดหลัก:{" "}
        <span className="font-semibold">{mainProvince}</span> | จังหวัดเปรียบเทียบ:{" "}
        <span className="font-semibold">{compareProvince}</span>
      </p>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          ไม่พบข้อมูลแนวโน้มสำหรับการเปรียบเทียบ
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={rows}
            margin={{ top: 8, right: 56, bottom: 8, left: 8 }}
          >
            {/* ไม่มี grid ด้านหลัง */}

            <XAxis
              dataKey="month_th"
              interval="preserveStartEnd"
              tickMargin={8}
              padding={{ left: 0, right: 28 }}
            />
            <YAxis
              tickFormatter={TH_NUMBER}
              tickMargin={8}
              allowDecimals={false}
            />
            <Tooltip content={<CompareTrendTooltip />} />
            <Legend />

            {/* จังหวัดหลัก: เส้นทึบ + มีจุด */}
            <Line
              type="monotone"
              dataKey="male_main"
              name={`ชาย — ${mainProvince}`}
              stroke="#0EA5E9"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="female_main"
              name={`หญิง — ${mainProvince}`}
              stroke="#EC4899"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />

            {/* จังหวัดเปรียบเทียบ: เส้นประ ไม่มีจุด */}
            <Line
              type="monotone"
              dataKey="male_compare"
              name={`ชาย — ${compareProvince}`}
              stroke="#7DD3FC"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="female_compare"
              name={`หญิง — ${compareProvince}`}
              stroke="#F9A8D4"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
