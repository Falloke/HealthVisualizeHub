"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ProvinceCountTooltip,
  ValueLabelRight,
} from "@/app/components/bargraph/GraphUtils";

type Row = {
  province: string;
  patients: number;
  rank?: number;
  isMain?: boolean;
  isCompare?: boolean;
};

type APIResp = {
  ok?: boolean;
  sameRegion?: boolean;

  mainRows?: Row[];
  compareRows?: Row[];
  note?: string;
  error?: string;

  // รองรับ payload แบบมี data
  data?: {
    sameRegion?: boolean;
    mainRows?: Row[];
    compareRows?: Row[];
    note?: string;
  };
};

type RowWithFill = Row & { fill: string };

type Props = {
  prefetched?: unknown;
  parentLoading?: boolean;
};

type CacheEntry = { at: number; data: APIResp };
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"] as const;
const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

function colorByRisk(patients: number): string {
  const v = Number(patients || 0);
  if (v >= THRESHOLD_VERY_HIGH) return RISK_COLORS[0];
  if (v >= THRESHOLD_HIGH) return RISK_COLORS[1];
  if (v >= THRESHOLD_MEDIUM) return RISK_COLORS[2];
  return RISK_COLORS[3];
}

function riskLegendText() {
  const v = TH_NUMBER(THRESHOLD_VERY_HIGH);
  const h = TH_NUMBER(THRESHOLD_HIGH);
  const m = TH_NUMBER(THRESHOLD_MEDIUM);
  return {
    veryHigh: `สูงมาก (${v}+ ราย)`,
    high: `สูง (${h} ถึง ${TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย)`,
    medium: `ปานกลาง (${m} ถึง ${TH_NUMBER(THRESHOLD_HIGH - 1)} ราย)`,
    low: `ต่ำ (น้อยกว่า ${m} ราย)`,
  };
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalize(resp: APIResp): APIResp {
  const d = resp.data ?? {};
  return {
    ok: resp.ok ?? true,
    // ❗แก้: default ต้องเป็น false (ไม่ใช่ true) ไม่งั้นจะทำให้ logic เพี้ยน
    sameRegion: resp.sameRegion ?? d.sameRegion ?? false,
    mainRows: resp.mainRows ?? d.mainRows ?? [],
    compareRows: resp.compareRows ?? d.compareRows ?? [],
    note: resp.note ?? d.note,
    error: resp.error,
  };
}

function parsePrefetched(prefetched: unknown): APIResp | null {
  if (!prefetched) return null;
  if (typeof prefetched !== "object") return null;

  const p = prefetched as any;

  // อาจส่งมาเป็นของ endpoint ตรง ๆ
  if ("mainRows" in p || "compareRows" in p || "data" in p) {
    return normalize(p as APIResp);
  }

  // หรือผ่าน aggregate -> regionTop5
  const maybe = p.regionTop5 ?? p.region_top5 ?? p.top5ByRegion;
  if (maybe && typeof maybe === "object") {
    return normalize(maybe as APIResp);
  }

  return null;
}

function compactName(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** ✅ หาอันดับจังหวัดใน Top5 (ใช้ rank ถ้ามี, ไม่งั้น index+1) */
function findRank(rows: Row[] | undefined, provinceName: string | undefined | null): number | null {
  if (!rows?.length || !provinceName) return null;

  const target = compactName(provinceName);
  const idx = rows.findIndex((r) => compactName(r.province) === target);

  if (idx === -1) return null;

  const r = rows[idx];
  const byRank = Number(r.rank);
  if (Number.isFinite(byRank) && byRank > 0) return byRank;

  return idx + 1;
}

/**
 * แยกกราฟออกเป็น memo component เพื่อลดการ re-render
 */
const ChartBlock = React.memo(function ChartBlock(props: {
  title: string;
  rows: RowWithFill[];
  xMax: number;
  yWidth: number;
}) {
  const { title, rows, xMax, yWidth } = props;

  const tooltipEl = useMemo(
    () => <ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />,
    []
  );
  const valueLabelEl = useMemo(() => <ValueLabelRight />, []);

  return (
    <div>
      <h4 className="mb-2 font-bold">{title}</h4>

      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
            barCategoryGap="2%"
            barGap={0}
          >
            <XAxis
              type="number"
              tickFormatter={TH_NUMBER}
              tickMargin={8}
              domain={[0, xMax]}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="province"
              width={yWidth}
              interval={0}
              tick={{ fontSize: 14 }}
            />

            <Tooltip content={tooltipEl} />

            <Bar
              dataKey="patients"
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="patients" content={valueLabelEl} />
              {rows.map((row, idx) => (
                <Cell key={idx} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default function CompareRegionTop5Chart({ prefetched, parentLoading }: Props) {
  const diseaseCode = useDashboardStore((s) => s.diseaseCode);
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);

  const mainProvince = useCompareStore((s) => s.mainProvince);
  const compareProvince = useCompareStore((s) => s.compareProvince);

  const [data, setData] = useState<APIResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBoth = !!mainProvince && !!compareProvince;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth) return "";
    const qs = new URLSearchParams({
      disease: diseaseCode || "",
      start_date: start_date || "",
      end_date: end_date || "",
      mainProvince: mainProvince!,
      compareProvince: compareProvince!,
    }).toString();
    return `/api/compareInfo/region-top5?${qs}`;
  }, [hasBoth, diseaseCode, start_date, end_date, mainProvince, compareProvince]);

  // ✅ ใช้ prefetched ก่อน (ถ้ามี)
  useEffect(() => {
    const parsed = parsePrefetched(prefetched);
    if (parsed) {
      setData(parsed);
      setError(null);
    }
  }, [prefetched]);

  useEffect(() => {
    if (!hasBoth || !requestUrl) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setData(cached.data);
      setError(null);
      return;
    }

    // ✅ กันยิงซ้ำ URL เดิมพร้อมกัน
    if (inFlightRef.current.has(requestUrl)) return;

    const ac = new AbortController();
    inFlightRef.current.set(requestUrl, ac);

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(requestUrl, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) throw new Error(text || "โหลดข้อมูล Top5 ไม่สำเร็จ");

        const raw = safeJson<APIResp>(text, { ok: false, mainRows: [], compareRows: [] });

        if (raw.ok === false) throw new Error(raw.error || "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้");

        const json = normalize(raw);

        cacheRef.current.set(requestUrl, { at: Date.now(), data: json });
        setData(json);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compareInfo/region-top5):", err);
        setError(err?.message || "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้");
      } finally {
        inFlightRef.current.delete(requestUrl);
        setLoading(false);
      }
    })();

    return () => {
      ac.abort();
      inFlightRef.current.delete(requestUrl);
    };
  }, [hasBoth, requestUrl]);

  const legend = useMemo(() => riskLegendText(), []);

  // ✅ ดึงทั้ง mainRows และ compareRows
  const mainRowsRaw = data?.mainRows ?? [];
  const compareRowsRaw = data?.compareRows ?? [];

  const mainRows = useMemo<RowWithFill[]>(
    () => mainRowsRaw.map((r) => ({ ...r, fill: colorByRisk(r.patients) })),
    [mainRowsRaw]
  );

  const compareRows = useMemo<RowWithFill[]>(
    () => compareRowsRaw.map((r) => ({ ...r, fill: colorByRisk(r.patients) })),
    [compareRowsRaw]
  );

  const xMaxMain = useMemo(
    () => niceMax(Math.max(0, ...mainRows.map((d) => Number(d.patients ?? 0)))),
    [mainRows]
  );

  const xMaxCompare = useMemo(
    () => niceMax(Math.max(0, ...compareRows.map((d) => Number(d.patients ?? 0)))),
    [compareRows]
  );

  const yWidthMain = useMemo(() => {
    const longest = mainRows.reduce((m, d) => Math.max(m, (d.province ?? "").length), 0);
    return Math.min(220, Math.max(120, longest * 10));
  }, [mainRows]);

  const yWidthCompare = useMemo(() => {
    const longest = compareRows.reduce((m, d) => Math.max(m, (d.province ?? "").length), 0);
    return Math.min(220, Math.max(120, longest * 10));
  }, [compareRows]);

  // ✅ Title: กราฟซ้าย = top5 ของภูมิภาคจังหวัดหลัก
  const titleMain = useMemo(() => {
    const rankMain = findRank(mainRowsRaw, mainProvince);
    return `Top 5 ผู้ป่วยสะสม (ภูมิภาคของจังหวัดหลัก) — ${mainProvince || "—"} อันดับ ${rankMain ?? "—"}`;
  }, [mainRowsRaw, mainProvince]);

  // ✅ Title: กราฟขวา = top5 ของภูมิภาคจังหวัดที่เปรียบเทียบ
  const titleCompare = useMemo(() => {
    const rankCompare = findRank(compareRowsRaw, compareProvince);
    return `Top 5 ผู้ป่วยสะสม (ภูมิภาคของจังหวัดที่เปรียบเทียบ) — ${compareProvince || "—"} อันดับ ${
      rankCompare ?? "—"
    }`;
  }, [compareRowsRaw, compareProvince]);

  const showTwoCharts = compareRows.length > 0;

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ให้ครบก่อน เพื่อดูกราฟ Top 5)
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      {data?.note && <p className="mb-2 text-xs font-semibold text-gray-600">{data.note}</p>}

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <div className="relative min-h-[420px]">
            {loading && !data && <p>⏳ กำลังโหลด...</p>}

            {!loading && (!data || mainRows.length === 0) ? (
              <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
            ) : showTwoCharts ? (
              // ✅ แบบที่ 2: แสดง 2 กราฟ
              <div className="mb-6 grid gap-6 lg:grid-cols-2">
                <ChartBlock title={titleMain} rows={mainRows} xMax={xMaxMain} yWidth={yWidthMain} />
                <ChartBlock
                  title={titleCompare}
                  rows={compareRows}
                  xMax={xMaxCompare}
                  yWidth={yWidthCompare}
                />
              </div>
            ) : (
              // ✅ fallback: ถ้า API ส่งมาแค่ mainRows
              <div className="mb-6">
                <ChartBlock title={titleMain} rows={mainRows} xMax={xMaxMain} yWidth={yWidthMain} />
              </div>
            )}

            {(parentLoading || (loading && data)) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/40 text-sm text-gray-700">
                ⏳ กำลังอัปเดต...
              </div>
            )}
          </div>

          <div className="mt-2 rounded border px-3 py-2 text-sm">
            <div className="mb-1 font-semibold">ระดับความเสี่ยง (ตามจำนวนผู้ป่วยสะสม)</div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ background: RISK_COLORS[0] }} />
                {legend.veryHigh}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ background: RISK_COLORS[1] }} />
                {legend.high}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ background: RISK_COLORS[2] }} />
                {legend.medium}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ background: RISK_COLORS[3] }} />
                {legend.low}
              </span>
            </div>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            อ้างอิงเกณฑ์จาก DDC: สูงมาก {TH_NUMBER(THRESHOLD_VERY_HIGH)}+ ราย, สูง{" "}
            {TH_NUMBER(THRESHOLD_HIGH)} ถึง {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย,
            ปานกลาง {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย,
            ต่ำ น้อยกว่า {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
          </p>
        </>
      )}
    </div>
  );
}
