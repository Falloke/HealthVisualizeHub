// app/features/main/comparePage/component/CompareProvincePatientsChart.tsx
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
import { useCompareStore } from "@/store/useCompareStore";
import {
  TH_NUMBER,
  niceMax,
  ValueLabelRight,
  ProvinceCountTooltip,
} from "@/app/components/bargraph/GraphUtils";

type ProvinceSummary = {
  province: string;
  region?: string | null;
  patients: number;
};

type APIResp = {
  ok?: boolean;
  main?: ProvinceSummary;
  compare?: ProvinceSummary;
  error?: string;
};

type Row = {
  province: string;
  region?: string | null;
  value: number;
  isMain?: boolean;
  isCompare?: boolean;
};

export default function CompareProvincePatientsChart() {
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
          `/api/compareInfo/province-patients?${qs.toString()}`,
          { cache: "no-store" }
        );

        const text = await res.text();
        if (!res.ok) {
          throw new Error(
            text || "โหลดข้อมูลเปรียบเทียบผู้ป่วยสะสมไม่สำเร็จ"
          );
        }

        const json: APIResp = text ? JSON.parse(text) : {};
        if (cancelled) return;

        const next: Row[] = [];

        if (json.main) {
          next.push({
            province: json.main.province,
            region: json.main.region ?? undefined,
            value: Number(json.main.patients ?? 0),
            isMain: true,
          });
        }

        if (json.compare) {
          next.push({
            province: json.compare.province,
            region: json.compare.region ?? undefined,
            value: Number(json.compare.patients ?? 0),
            isCompare: true,
          });
        }

        setRows(next);
      } catch (err: any) {
        console.error("❌ Fetch error (compare province patients):", err);
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
        เปรียบเทียบผู้ป่วยสะสมจังหวัด {mainProvince || "—"} vs{" "}
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
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 32 }}
            barSize={26}
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
                  seriesName="ผู้ป่วยสะสม"
                  labelKey="province"
                />
              }
            />

            <Bar
              dataKey="value"
              name="ผู้ป่วยสะสม"
              radius={[0, 6, 6, 0]}
              fill="#2185D5" // 🔵 ให้ทั้งสองจังหวัดเป็นสีน้ำเงินเหมือนกัน
            >
              <LabelList dataKey="value" content={<ValueLabelRight />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
