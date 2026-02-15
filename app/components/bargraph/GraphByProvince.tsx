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
type ApiShape =
  | RegionData[]
  | { data?: RegionData[]; rows?: RegionData[]; result?: RegionData[]; ok?: boolean; error?: string };

const ALL_REGIONS = [
  "ภาคเหนือ",
  "ภาคกลาง",
  "ภาคตะวันออก",
  "ภาคตะวันตก",
  "ภาคใต้",
  "ภาคตะวันออกเฉียงเหนือ",
] as const;

const REGION_ALIAS: Record<string, (typeof ALL_REGIONS)[number]> = {
  ภาคเหนือ: "ภาคเหนือ",
  ภาคกลาง: "ภาคกลาง",
  ภาคตะวันออก: "ภาคตะวันออก",
  ภาคตะวันตก: "ภาคตะวันตก",
  ภาคใต้: "ภาคใต้",
  ภาคอีสาน: "ภาคตะวันออกเฉียงเหนือ",
  ภาคตะวันออกเฉียงเหนือ: "ภาคตะวันออกเฉียงเหนือ",
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRegionName(v: unknown): string {
  const raw = String(v ?? "").trim().replace(/\s+/g, " ");
  return REGION_ALIAS[raw] ?? raw;
}

function extractRows(payload: ApiShape): RegionData[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeRegions(rows: RegionData[]): RegionData[] {
  const map = new Map<string, RegionData>();

  for (const r of rows) {
    const region = normalizeRegionName(r?.region);
    if (!region) continue;

    const prev = map.get(region);
    map.set(region, {
      region,
      patients: (prev?.patients ?? 0) + toNumber(r?.patients),
      deaths: (prev?.deaths ?? 0) + toNumber(r?.deaths),
    });
  }

  return ALL_REGIONS.map((name) => map.get(name) ?? { region: name, patients: 0, deaths: 0 });
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

<<<<<<< HEAD
export default function GraphByProvince({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { start_date, end_date, diseaseCode } = useDashboardStore();
=======
export default function GraphByProvince({ compact = false }: { compact?: boolean }) {
  const { start_date, end_date } = useDashboardStore();

>>>>>>> feature/Method_F&Method_G
  const [raw, setRaw] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

<<<<<<< HEAD
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
=======
        if (!start_date || !end_date) {
          if (!aborted) {
            setRaw([]);
            setErr("กรุณาเลือกช่วงวันที่ให้ครบ");
          }
          return;
        }

        const qs = new URLSearchParams({
          start_date,
          end_date,
          _t: String(Date.now()),
        });

        const res = await fetch(`/api/dashBoard/region?${qs.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`http ${res.status} ${text}`);
        }

        const payload = (await res.json()) as ApiShape;
        const rows = extractRows(payload);

        if (!aborted) setRaw(Array.isArray(rows) ? rows : []);
>>>>>>> feature/Method_F&Method_G
      } catch (e) {
        if (!aborted) {
          setRaw([]);
          setErr("ไม่สามารถโหลดข้อมูลกราฟภูมิภาคได้");
        }
        console.error("graph by province fetch error", e);
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
<<<<<<< HEAD
  }, [start_date, end_date, diseaseCode]);
=======
  }, [start_date, end_date]);
>>>>>>> feature/Method_F&Method_G

  const data = useMemo(() => normalizeRegions(raw), [raw]);

  const maxPatients = useMemo(() => Math.max(0, ...data.map((d) => toNumber(d.patients))), [data]);
  const maxDeaths = useMemo(() => Math.max(0, ...data.map((d) => toNumber(d.deaths))), [data]);

  const rightPatients = maxPatients > 0 ? Math.ceil(maxPatients * 1.12) : 1;
  const rightDeaths = maxDeaths > 0 ? Math.ceil(maxDeaths * 1.12) : 1;

  const PAD = compact ? "p-2.5 md:p-3" : "p-3.5 md:p-4";
  const TITLE = compact ? "text-sm md:text-base" : "text-base";
  const H_PAT = compact ? 190 : 260;
  const H_DEA = compact ? 170 : 240;
  const BAR_GAP = compact ? 10 : 16;
  const BAR_SIZE = compact ? 14 : 18;
  const LABEL_FS = compact ? 11 : 12;
  const TICK_FS = compact ? 11 : 12;

  const M_LEFT = 2;
  const M_RIGHT = 48;
  const M_BOTTOM = 14;
  const M_TOP = 2;

  const longestLabelLen = useMemo(
    () => Math.max(0, ...data.map((d) => String(d.region ?? "").length)),
    [data]
  );
  const Y_AXIS_WIDTH = Math.min(170, Math.max(138, 8 + longestLabelLen * 9.2));

  const LabelOutside: React.FC<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number | string;
  }> = ({ x = 0, y = 0, width = 0, height = 0, value }) => {
    if (value === undefined || value === null) return null;
    const num = toNumber(value);
    return (
      <text
        x={x + width + 6}
        y={y + height / 2}
        fill="#374151"
        fontSize={LABEL_FS}
        textAnchor="start"
        dominantBaseline="central"
      >
        {`${num.toLocaleString()} ราย`}
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
                useCompactTick ? fmtCompact(toNumber(v)) : toNumber(v).toLocaleString()
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
<<<<<<< HEAD

            <Tooltip
              formatter={(value: any, name: any) => {
                const n = Number(value ?? 0);
                return [
                  n.toLocaleString(),
                  tooltipNameTH(name),
                ] as [string, string];
=======
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const n = toNumber(value);
                return [n.toLocaleString(), tooltipNameTH(name)] as [string, string];
>>>>>>> feature/Method_F&Method_G
              }}
              labelStyle={{ fontSize: 12 }}
              itemStyle={{ fontSize: 12 }}
            />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 4, 4]} isAnimationActive={false}>
              <LabelList content={<LabelOutside />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );

  const allZero = data.every((d) => toNumber(d.patients) === 0 && toNumber(d.deaths) === 0);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="rounded-lg border bg-white p-3 text-gray-600">กำลังโหลดข้อมูล</div>
      ) : err ? (
        <div className="rounded-lg border bg-white p-3 text-red-600">{err}</div>
      ) : data.length === 0 || allZero ? (
        <div className="rounded-lg border bg-white p-3 text-gray-600">
          ไม่มีข้อมูลสำหรับช่วงเวลาและเงื่อนไขที่เลือก
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
