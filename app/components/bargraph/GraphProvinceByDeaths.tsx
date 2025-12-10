"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { useDashboardStore } from "@/store/useDashboardStore";
import {
  TH_NUMBER,
  VerticalProvinceTick,
  ValueLabelRight,
  ProvinceCountTooltip,
  niceMax,
} from "./GraphUtils";

type GenderRow = { gender: string; value: number };
type Row = { label: string; value: number };

type DeathsSummary = {
  totalDeaths: number;
  avgDeathsPerDay: number;
  cumulativeDeaths: number;
};

export default function GraphProvinceByDeaths() {
  const { province, start_date, end_date } = useDashboardStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<DeathsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const qs = new URLSearchParams({
          start_date: start_date || "",
          end_date: end_date || "",
          province: province || "",
        }).toString();

        const [genderRes, sumRes] = await Promise.all([
          fetch(`/api/dashBoard/gender-deaths?${qs}`),
          fetch(`/api/dashBoard/deaths-summary?${qs}`),
        ]);

        if (!genderRes.ok) throw new Error("โหลดข้อมูลผู้เสียชีวิตไม่สำเร็จ");
        const json: GenderRow[] = await genderRes.json();
        const total = (json ?? []).reduce(
          (s, r) => s + Number(r.value ?? 0),
          0
        );

        const sumText = await sumRes.text();
        if (!sumRes.ok) throw new Error(sumText || "โหลดข้อมูลสรุปไม่สำเร็จ");
        const sumJson: DeathsSummary | null = sumText
          ? JSON.parse(sumText)
          : null;

        if (!cancelled) {
          setRows([{ label: province || "รวม", value: total }]);
          setSummary(sumJson);
        }
      } catch (e) {
        console.error("❌ Fetch error (deaths total):", e);
        if (!cancelled) {
          setRows([{ label: province || "รวม", value: 0 }]);
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [province, start_date, end_date]);

  const yWidth = useMemo(
    () => Math.min(220, Math.max(100, (province?.length ?? 8) * 10 + 16)),
    [province]
  );
  const xMax = useMemo(() => niceMax(rows[0]?.value ?? 0), [rows]);

  return (
    <div className="rounded bg-white p-4 shadow">
      {/* หัวสรุปตัวเลข */}
      <div className="mb-3">
        <h4 className="font-bold text-gray-900">
          ผู้เสียชีวิตสะสมจังหวัด {province || rows[0]?.label || "-"}
        </h4>

        {loading ? (
          <p className="mt-1 text-sm text-gray-500">⏳ กำลังโหลด...</p>
        ) : !summary ? (
          <p className="mt-1 text-sm text-gray-500">
            ไม่พบข้อมูลผู้เสียชีวิตในช่วงเวลานี้
          </p>
        ) : (
          <p className="text-2xl font-bold text-gray-900">
            {summary.totalDeaths?.toLocaleString?.() ?? "-"}{" "}
            <span className="text-base font-normal text-gray-800">ราย</span>
            <span className="ml-3 align-baseline text-xs font-normal text-gray-700 sm:text-sm">
              เฉลี่ยวันละ{" "}
              <span className="font-semibold">
                {summary.avgDeathsPerDay?.toLocaleString?.() ?? "-"}
              </span>{" "}
              คน/วัน <span className="mx-1">•</span> สะสม{" "}
              <span className="font-semibold">
                {summary.cumulativeDeaths?.toLocaleString?.() ?? "-"}
              </span>{" "}
              ราย
            </span>
          </p>
        )}
      </div>

      {/* กราฟ */}
      {loading ? (
        <p className="text-sm text-gray-500">⏳ กำลังโหลดกราฟ...</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
            barSize={22}
          >
            <XAxis type="number" tickFormatter={TH_NUMBER} domain={[0, xMax]} />
            <YAxis
              type="category"
              dataKey="label"
              width={yWidth}
              tick={<VerticalProvinceTick />}
            />
            <Tooltip
              content={<ProvinceCountTooltip seriesName="ผู้เสียชีวิตสะสม" />}
            />
            <Bar
              dataKey="value"
              fill="#8594A1"
              radius={[0, 6, 6, 0]}
              name="ผู้เสียชีวิตสะสม"
            >
              <LabelList dataKey="value" content={<ValueLabelRight />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
