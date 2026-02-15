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
  ValueLabelRight,
  ProvinceCountTooltip,
  niceMax,
} from "./GraphUtils";

type ProvinceResp = {
  province: string;
  region: string;
  patients: number | string;
};

type PatientsSummary = {
  totalPatients: number | string;
  avgPatientsPerDay: number | string;
  cumulativePatients: number | string;
};

type Row = { province: string; region?: string; value: number };

// ✅ ไม่ล็อกความสูงการ์ดแล้ว (แก้ปัญหาช่องว่างเยอะ)
const HEADER_MIN_H = 64;
const CHART_H = 160;

const BAR_SIZE = 22;
const CHART_MARGIN_BASE = { top: 6, right: 24, bottom: 6, left: 10 };

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function OneLineTick({ x, y, payload }: any) {
  const label = String(payload?.value ?? "");
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#374151">
      {label}
    </text>
  );
}

export default function GraphProvinceByPatients() {
  const { province, start_date, end_date } = useDashboardStore();

  const [data, setData] = useState<Row[]>([]);
  const [summary, setSummary] = useState<PatientsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const qs = new URLSearchParams({
          start_date: start_date || "",
          end_date: end_date || "",
          province: province || "",
        }).toString();

        const [provRes, sumRes] = await Promise.all([
          fetch(`/api/dashBoard/province-summary?${qs}`, { cache: "no-store" }),
          fetch(`/api/dashBoard/patients-summary?${qs}`, { cache: "no-store" }),
        ]);

        const provText = await provRes.text();
        if (!provRes.ok) throw new Error(provText || "โหลดข้อมูลไม่สำเร็จ");
        const provJson: ProvinceResp = provText ? JSON.parse(provText) : ({} as any);

        const sumText = await sumRes.text();
        if (!sumRes.ok) throw new Error(sumText || "โหลดข้อมูลสรุปไม่สำเร็จ");
        const sumJson: PatientsSummary | null = sumText ? JSON.parse(sumText) : null;

        if (cancelled) return;

        if (provJson?.province) {
          setData([
            {
              province: provJson.province,
              region: provJson.region,
              value: toNumber(provJson.patients),
            },
          ]);
        } else {
          setData([]);
        }

        setSummary(sumJson);
      } catch (e: any) {
        console.error("❌ Fetch error (province-patients):", e);
        if (!cancelled) {
          setData([]);
          setSummary(null);
          setError(e?.message || "ไม่สามารถโหลดข้อมูลได้");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [province, start_date, end_date]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...data.map((d) => toNumber(d.value)))),
    [data]
  );

  const rightMargin = useMemo(() => {
    const text = `${TH_NUMBER(xMax)} ราย`;
    return Math.min(140, Math.max(40, Math.floor(text.length * 7.5) + 14));
  }, [xMax]);

  const headerProvince = province || data[0]?.province || "—";

  const yAxisWidth = useMemo(() => {
    const s = String(data[0]?.province ?? "");
    return clamp(Math.floor(s.length * 7) + 18, 70, 120);
  }, [data]);

  return (
    <div className="rounded bg-white p-4 shadow">
      {/* Header */}
      <div style={{ minHeight: HEADER_MIN_H }}>
        <h4 className="font-bold text-gray-900">ผู้ป่วยสะสมจังหวัด {headerProvince}</h4>

        {loading ? (
          <p className="mt-1 text-sm text-gray-500">⏳ กำลังโหลด...</p>
        ) : error ? (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        ) : !summary ? (
          <p className="mt-1 text-sm text-gray-500">ไม่พบข้อมูลผู้ป่วยในช่วงเวลานี้</p>
        ) : (
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600 leading-none">
              {toNumber(summary.totalPatients).toLocaleString()}
            </span>
            <span className="text-base font-normal text-gray-800 leading-none">ราย</span>

            <span className="ml-2 text-xs font-normal text-gray-700 sm:text-sm leading-none truncate">
              เฉลี่ยวันละ{" "}
              <span className="font-semibold">
                {toNumber(summary.avgPatientsPerDay).toLocaleString()}
              </span>{" "}
              คน/วัน <span className="mx-1">•</span> สะสม{" "}
              <span className="font-semibold">
                {toNumber(summary.cumulativePatients).toLocaleString()}
              </span>{" "}
              ราย
            </span>
          </div>
        )}
      </div>

      {/* Chart (ล็อกสูงเฉพาะกราฟ แต่การ์ดไม่ล็อกแล้ว) */}
      <div className="relative mt-2" style={{ height: CHART_H }}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            ⏳ กำลังโหลดกราฟ...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">
            {error}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            ไม่พบข้อมูลสำหรับช่วงเวลานี้
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              barSize={BAR_SIZE}
              barCategoryGap={0}
              barGap={0}
              margin={{ ...CHART_MARGIN_BASE, right: rightMargin }}
            >
              <XAxis
                type="number"
                tickFormatter={TH_NUMBER}
                allowDecimals={false}
                domain={[0, xMax]}
                tickMargin={8}
              />

              <YAxis
                type="category"
                dataKey="province"
                width={yAxisWidth}
                interval={0}
                padding={{ top: 0, bottom: 0 }}
                tick={<OneLineTick />}
              />

              <Tooltip
                content={<ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />}
                wrapperStyle={{ zIndex: 10 }}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                offset={12}
              />

              <Bar
                dataKey="value"
                name="ผู้ป่วยสะสม"
                fill="#2185D5"
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
              >
                <LabelList dataKey="value" content={<ValueLabelRight />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
