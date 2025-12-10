// app/features/main/comparePage/component/CompareProvinceDeathsChart.tsx
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
  Cell,
} from "recharts";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

import {
  TH_NUMBER,
  niceMax,
  ValueLabelRight,
  ProvinceCountTooltip,
} from "@/app/components/bargraph/GraphUtils";

type APIResp = {
  ok?: boolean;
  main?: { province: string; deaths: number };
  compare?: { province: string; deaths: number };
  error?: string;
};

type Row = {
  province: string;
  value: number;
  isMain?: boolean;
  isCompare?: boolean;
};

export default function CompareProvinceDeathsChart() {
  const { diseaseNameTh, start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBoth = !!mainProvince && !!compareProvince;

  useEffect(() => {
    if (!hasBoth) {
      setRows([]);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const qs = new URLSearchParams({
          start_date: start_date || "",
          end_date: end_date || "",
          mainProvince: mainProvince!,
          compareProvince: compareProvince!,
        });

        const res = await fetch(
          `/api/compareInfo/province-deaths?${qs.toString()}`,
          { cache: "no-store" }
        );

        const text = await res.text();
        if (!res.ok) {
          throw new Error(
            text || "โหลดข้อมูลเปรียบเทียบผู้เสียชีวิตสะสมไม่สำเร็จ"
          );
        }

        const json: APIResp = text ? JSON.parse(text) : {};
        if (cancelled) return;

        const next: Row[] = [];

        if (json.main) {
          next.push({
            province: json.main.province,
            value: Number(json.main.deaths ?? 0),
            isMain: true,
          });
        }

        if (json.compare) {
          next.push({
            province: json.compare.province,
            value: Number(json.compare.deaths ?? 0),
            isCompare: true,
          });
        }

        setRows(next);
      } catch (err: any) {
        console.error("❌ Fetch error (compare province deaths):", err);
        if (!cancelled) {
          setRows([]);
          setError(err?.message || "ไม่สามารถโหลดข้อมูลได้");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasBoth, mainProvince, compareProvince, start_date, end_date]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...rows.map((r) => Number(r.value ?? 0)))),
    [rows]
  );

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-1 font-bold">
        ผู้เสียชีวิตสะสมจังหวัด {mainProvince || "—"} vs{" "}
        {compareProvince || "—"}
      </h4>
      <p className="mb-3 text-xs text-gray-600">
        โรคที่เลือก: <span className="font-semibold">{diseaseNameTh}</span>{" "}
        | ช่วงเวลา:{" "}
        <span className="font-semibold">
          {start_date || "—"} – {end_date || "—"}
        </span>
      </p>

      {!hasBoth ? (
        <p className="text-sm text-gray-500">
          กรุณาเลือกจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ก่อน
        </p>
      ) : loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 32 }}
            barSize={22}
          >
            <XAxis
              type="number"
              tickFormatter={TH_NUMBER}
              domain={[0, xMax]}
              tickMargin={8}
            />
            <YAxis
              type="category"
              dataKey="province"
              width={80}
              interval={0}
              tick={{ fontSize: 13 }}
            />

            <Tooltip
              content={
                <ProvinceCountTooltip
                  seriesName="ผู้เสียชีวิตสะสม"
                  labelKey="province"
                />
              }
            />

            <Bar
              dataKey="value"
              name="ผู้เสียชีวิตสะสม"
              radius={[0, 6, 6, 0]}
            >
              <LabelList dataKey="value" content={<ValueLabelRight />} />
              {rows.map((r, idx) => (
                <Cell
                  key={idx}
                  // เทาเข้มสำหรับจังหวัดหลัก, เทาอ่อนสำหรับจังหวัดเปรียบเทียบ
                  fill={r.isMain ? "#4B5563" : "#8594A1"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
