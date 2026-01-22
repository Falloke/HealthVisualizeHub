// E:\HealtRiskHub\app\components\bargraph\GraphByProvince.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

type RegionData = { region: string; patients: number; deaths: number };

const ALL_REGIONS = [
  "ภาคเหนือ",
  "ภาคกลาง",
  "ภาคตะวันออก",
  "ภาคตะวันตก",
  "ภาคใต้",
  "ภาคตะวันออกเฉียงเหนือ",
];

function normalizeRegions(rows: RegionData[]): RegionData[] {
  const map = new Map<string, RegionData>();
  rows.forEach((r) =>
    map.set(r.region.trim(), {
      region: r.region.trim(),
      patients: Number(r.patients || 0),
      deaths: Number(r.deaths || 0),
    })
  );
  return ALL_REGIONS.map(
    (name) => map.get(name) ?? { region: name, patients: 0, deaths: 0 }
  );
}

const fmtCompact = (n: number) =>
  new Intl.NumberFormat("th", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n || 0);

function tooltipNameTH(name: unknown) {
  if (name === "patients") return "ผู้ป่วยสะสม";
  if (name === "deaths") return "ผู้เสียชีวิตสะสม";
  return String(name ?? "");
}

export default function GraphByProvince({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { start_date, end_date, diseaseCode } = useDashboardStore();
  const [raw, setRaw] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // ✅ ถ้าไม่เลือกโรค ยังไม่ยิง API
        if (!diseaseCode || !diseaseCode.trim()) {
          if (!aborted) setRaw([]);
          return;
        }

        const url =
          `/api/dashBoard/region` +
          `?start_date=${encodeURIComponent(start_date)}` +
          `&end_date=${encodeURIComponent(end_date)}` +
          `&disease=${encodeURIComponent(diseaseCode)}`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as RegionData[];
        if (!aborted) setRaw(Array.isArray(json) ? json : []);
      } catch (e) {
        if (!aborted) setErr("ไม่สามารถโหลดข้อมูลได้");
        console.error("[GraphByProvince] fetch error:", e);
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [start_date, end_date, diseaseCode]);

  const data = useMemo(() => normalizeRegions(raw), [raw]);

  const maxPatients = useMemo(
    () => Math.max(0, ...data.map((d) => d.patients)),
    [data]
  );
  const maxDeaths = useMemo(
    () => Math.max(0, ...data.map((d) => d.deaths)),
    [data]
  );

  // buffer ขวาสำหรับตัวเลขด้านนอกแท่ง
  const rightPatients = maxPatients > 0 ? Math.ceil(maxPatients * 1.08) : 1;
  const rightDeaths = maxDeaths > 0 ? maxDeaths + 1.2 : 1;

  // สไตล์กระชับ
  const PAD = compact ? "p-2.5 md:p-3" : "p-3.5 md:p-4";
  const TITLE = compact ? "text-sm md:text-base" : "text-base";
  const H_PAT = compact ? 190 : 260;
  const H_DEA = compact ? 170 : 240;
  const BAR_GAP = compact ? 10 : 16;
  const BAR_SIZE = compact ? 14 : 18;
  const LABEL_FS = compact ? 11 : 12;
  const TICK_FS = compact ? 11 : 12;

  // ลดซ้าย, เผื่อขวาเพิ่มให้ตัวเลข
  const M_LEFT = 2;
  const M_RIGHT = 30;
  const M_BOTTOM = 14;
  const M_TOP = 2;

  // ความกว้างแกน Y แบบอัตโนมัติ
  const longestLabelLen = useMemo(
    () => Math.max(0, ...data.map((d) => d.region.length)),
    [data]
  );
  const Y_AXIS_WIDTH = Math.min(160, Math.max(138, 8 + longestLabelLen * 9.2));

  /** Label ด้านนอกปลายแท่ง “... ราย” */
  const LabelOutside: React.FC<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number | string;
  }> = ({ x = 0, y = 0, width = 0, height = 0, value }) => {
    if (value === undefined || value === null) return null;
    const num = typeof value === "number" ? value : Number(value);
    const text = `${num.toLocaleString()} ราย`;
    const cx = x + width + 6;
    const cy = y + height / 2;
    return (
      <text
        x={cx}
        y={cy}
        fill="#374151"
        fontSize={LABEL_FS}
        textAnchor="start"
        dominantBaseline="central"
      >
        {text}
      </text>
    );
  };

  const ChartCard = ({
    title,
    dataKey,
    color,
    height,
    domainRight,
    useCompactTick = false,
  }: {
    title: string;
    dataKey: keyof RegionData;
    color: string;
    height: number;
    domainRight: number;
    useCompactTick?: boolean;
  }) => (
    <section
      className={`rounded-lg border bg-white ${PAD} shadow-sm overflow-hidden`}
    >
      <h4 className={`mb-1.5 font-bold ${TITLE}`}>{title}</h4>
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{
              top: M_TOP,
              right: M_RIGHT,
              bottom: M_BOTTOM,
              left: M_LEFT,
            }}
            barCategoryGap={BAR_GAP}
            barSize={BAR_SIZE}
          >
            <XAxis
              type="number"
              domain={[0, domainRight]}
              tickFormatter={(v) =>
                useCompactTick
                  ? fmtCompact(Number(v))
                  : Number(v).toLocaleString()
              }
              tick={{ fontSize: TICK_FS }}
              tickMargin={2}
            />
            <YAxis
              type="category"
              dataKey="region"
              width={Y_AXIS_WIDTH}
              interval={0}
              tickMargin={0}
              tick={{ fontSize: TICK_FS }}
            />

            <Tooltip
              formatter={(value: any, name: any) => {
                const n = Number(value ?? 0);
                return [
                  n.toLocaleString(),
                  tooltipNameTH(name),
                ] as [string, string];
              }}
              labelStyle={{ fontSize: 12 }}
              itemStyle={{ fontSize: 12 }}
            />

            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 4, 4]}>
              <LabelList content={<LabelOutside />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="rounded-lg border bg-white p-3 text-gray-600">
          ⏳ กำลังโหลดข้อมูล...
        </div>
      ) : err ? (
        <div className="rounded-lg border bg-white p-3 text-red-600">{err}</div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border bg-white p-3 text-gray-600">
          ไม่มีข้อมูลสำหรับช่วงเวลาที่เลือก
        </div>
      ) : (
        <>
          <ChartCard
            title="ผู้ป่วยสะสม รายภูมิภาค"
            dataKey="patients"
            color="#FF7043"
            height={H_PAT}
            domainRight={rightPatients}
            useCompactTick
          />
          <ChartCard
            title="ผู้เสียชีวิตสะสม รายภูมิภาค"
            dataKey="deaths"
            color="#9C27B0"
            height={H_DEA}
            domainRight={rightDeaths}
          />
        </>
      )}
    </div>
  );
}
