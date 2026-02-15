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

type GenderRow = { gender: string; value: number };
type Row = { label: string; value: number };

type DeathsSummary = {
  totalDeaths?: number | string;
  avgDeathsPerDay?: number | string;
  cumulativeDeaths?: number | string;
  total_deaths?: number | string;
  avg_deaths_per_day?: number | string;
  cumulative_deaths?: number | string;
  total?: number | string;
  avg?: number | string;
  cumulative?: number | string;
};

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
function pickNum(obj: any, keys: string[], fallback = 0): number {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      const n = toNumber(obj[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
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

export default function GraphProvinceByDeaths() {
  const { province, start_date, end_date } = useDashboardStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<DeathsSummary | null>(null);
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

        const [genderRes, sumRes] = await Promise.all([
          fetch(`/api/dashBoard/gender-deaths?${qs}`, { cache: "no-store" }),
          fetch(`/api/dashBoard/deaths-summary?${qs}`, { cache: "no-store" }),
        ]);

        if (!genderRes.ok) throw new Error("โหลดข้อมูลผู้เสียชีวิตไม่สำเร็จ");
        const json: GenderRow[] = await genderRes.json();
        const total = (json ?? []).reduce((s, r) => s + toNumber(r.value), 0);

        const sumText = await sumRes.text();
        if (!sumRes.ok) throw new Error(sumText || "โหลดข้อมูลสรุปไม่สำเร็จ");
        const sumJson: DeathsSummary | null = sumText ? JSON.parse(sumText) : null;

        if (cancelled) return;
        setRows([{ label: province || "รวม", value: total }]);
        setSummary(sumJson);
      } catch (e: any) {
        console.error("❌ Fetch error (deaths total):", e);
        if (!cancelled) {
          setRows([{ label: province || "รวม", value: 0 }]);
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

  const xMax = useMemo(() => niceMax(toNumber(rows[0]?.value ?? 0)), [rows]);
  const headerProvince = province || rows[0]?.label || "—";

  const rightMargin = useMemo(() => {
    const text = `${TH_NUMBER(xMax)} ราย`;
    return Math.min(140, Math.max(40, Math.floor(text.length * 7.5) + 14));
  }, [xMax]);

  const yAxisWidth = useMemo(() => {
    const s = String(rows[0]?.label ?? "");
    return clamp(Math.floor(s.length * 7) + 18, 70, 120);
  }, [rows]);

  // ✅ fallback จากค่ากราฟ
  const totalDeaths = useMemo(
    () => pickNum(summary, ["totalDeaths", "total_deaths", "total"], toNumber(rows[0]?.value)),
    [summary, rows]
  );
  const avgDeathsPerDay = useMemo(
    () => pickNum(summary, ["avgDeathsPerDay", "avg_deaths_per_day", "avg"], 0),
    [summary]
  );
  const cumulativeDeaths = useMemo(
    () => pickNum(summary, ["cumulativeDeaths", "cumulative_deaths", "cumulative"], totalDeaths),
    [summary, totalDeaths]
  );

  return (
    <div className="rounded bg-white p-4 shadow">
      <div style={{ minHeight: HEADER_MIN_H }}>
        <h4 className="font-bold text-gray-900">ผู้เสียชีวิตสะสมจังหวัด {headerProvince}</h4>

        {loading ? (
          <p className="mt-1 text-sm text-gray-500">⏳ กำลังโหลด...</p>
        ) : error ? (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 leading-none">{totalDeaths.toLocaleString()}</span>
            <span className="text-base font-normal text-gray-800 leading-none">ราย</span>

            <span className="ml-2 text-xs font-normal text-gray-700 sm:text-sm leading-none truncate">
              เฉลี่ยวันละ <span className="font-semibold">{avgDeathsPerDay.toLocaleString()}</span> คน/วัน{" "}
              <span className="mx-1">•</span> สะสม <span className="font-semibold">{cumulativeDeaths.toLocaleString()}</span> ราย
            </span>
          </div>
        )}
      </div>

      <div className="relative mt-2" style={{ height: CHART_H }}>
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">⏳ กำลังโหลดกราฟ...</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">{error}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              barSize={BAR_SIZE}
              barCategoryGap={0}
              barGap={0}
              margin={{ ...CHART_MARGIN_BASE, right: rightMargin }}
            >
              <XAxis type="number" tickFormatter={TH_NUMBER} domain={[0, xMax]} tickMargin={8} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={yAxisWidth} interval={0} padding={{ top: 0, bottom: 0 }} tick={<OneLineTick />} />
              <Tooltip
                content={<ProvinceCountTooltip seriesName="ผู้เสียชีวิตสะสม" labelKey="label" />}
                wrapperStyle={{ zIndex: 10 }}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                offset={12}
              />
              <Bar dataKey="value" fill="#8594A1" radius={[0, 6, 6, 0]} name="ผู้เสียชีวิตสะสม" isAnimationActive={false}>
                <LabelList dataKey="value" content={<ValueLabelRight />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
