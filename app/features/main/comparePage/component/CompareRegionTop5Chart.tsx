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

  // API อาจส่งมาเป็น "1".."7" หรือชื่อไทยเต็ม
  mainRegion?: string;
  compareRegion?: string;

  mainRows?: Row[];
  compareRows?: Row[];
  note?: string;
  error?: string;

  data?: {
    sameRegion?: boolean;
    mainRegion?: string;
    compareRegion?: string;
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

type RegionRow = {
  region_id: number;
  region_name_th: string;
  display_order: number;
};

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
    sameRegion: resp.sameRegion ?? d.sameRegion ?? false,
    mainRegion: resp.mainRegion ?? d.mainRegion,
    compareRegion: resp.compareRegion ?? d.compareRegion,
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

  if ("mainRows" in p || "compareRows" in p || "data" in p) {
    return normalize(p as APIResp);
  }

  const maybe = p.regionTop5 ?? p.region_top5 ?? p.top5ByRegion;
  if (maybe && typeof maybe === "object") {
    return normalize(maybe as APIResp);
  }

  return null;
}

function compactThai(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/ฯ/g, "")
    .toLowerCase();
}

/** ✅ ทำชื่อให้สั้น/สวย */
function prettyRegion(name: string): string {
  const s = (name || "").trim();
  if (!s) return "";

  // เคสพิเศษ: กทม/ปริมณฑล
  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) return "กรุงเทพฯและปริมณฑล";

  // ตัดคำว่า "ภาค"
  const noPrefix = s.replace(/^ภาค\s*/i, "").trim();

  // normalize ถ้าต้องการ
  if (noPrefix === "ตะวันออกเฉียงเหนือ") return "ตะวันออกเฉียงเหนือ";

  return noPrefix;
}

/** ✅ รับได้ทั้ง region_id ("1") หรือชื่อไทย → คืนชื่อไทยเต็มจาก DB */
function resolveRegionName(
  raw: unknown,
  byId: Record<string, string>,
  byKey: Record<string, string>
) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // ถ้าเป็นตัวเลข => region_id
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return byId[String(n)] || s;

  // ถ้าเป็นชื่อไทย => map ด้วย key
  const key = compactThai(s);
  if (byKey[key]) return byKey[key];

  // fallback case
  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) return byId["7"] || s;

  return s;
}

function compactName(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** ✅ หาอันดับจังหวัดใน Top5 (ใช้ rank ถ้ามี, ไม่งั้น index+1) */
function findRank(
  rows: Row[] | undefined,
  provinceName: string | undefined | null
): number | null {
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

  // ✅ region mapping จาก DB
  const [regionById, setRegionById] = useState<Record<string, string>>({});
  const [regionByKey, setRegionByKey] = useState<Record<string, string>>({});
  const regionsLoadedRef = useRef(false);

  useEffect(() => {
    if (regionsLoadedRef.current) return;
    regionsLoadedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/ref/regions-moph", { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลด regions_moph ไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};
        const rows = (json?.rows ?? []) as RegionRow[];

        const byId: Record<string, string> = {};
        const byKey: Record<string, string> = {};

        for (const r of rows) {
          const name = String(r.region_name_th ?? "").trim();
          if (!name) continue;

          byId[String(r.region_id)] = name;

          // key หลายแบบ เพื่อให้ match ได้ง่าย
          byKey[compactThai(name)] = name;
          byKey[compactThai(name.replace(/^ภาค\s*/i, ""))] = name;

          if (name.includes("กรุงเทพ") || name.includes("ปริมณฑล")) {
            byKey["กรุงเทพ"] = name;
            byKey["กรุงเทพมหานครและปริมณฑล"] = name;
          }
        }

        setRegionById(byId);
        setRegionByKey(byKey);
      } catch (e) {
        console.error("❌ Load regions_moph error:", e);
        setRegionById({});
        setRegionByKey({});
      }
    })();
  }, []);

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

  // ใช้ prefetched ก่อน
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
        if (!res.ok) throw new Error(text || "โหลดข้อมูลเปรียบเทียบภูมิภาคไม่สำเร็จ");

        const raw = safeJson<APIResp>(text, {
          ok: false,
          mainRows: [],
          compareRows: [],
        });

        if (raw.ok === false) throw new Error(raw.error || "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้");

        const json = normalize(raw);

        cacheRef.current.set(requestUrl, { at: Date.now(), data: json });
        setData(json);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compare region top5):", err);
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

  const sameRegion = !!data?.sameRegion;

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

  // ✅ Title + ดึงชื่อภูมิภาคจาก DB mapping
  const titleMain = useMemo(() => {
    const regFull = resolveRegionName(data?.mainRegion, regionById, regionByKey);
    const reg = regFull ? prettyRegion(regFull) : "";

    const rankMain = findRank(mainRowsRaw, mainProvince);
    const rankCompareInSame = sameRegion ? findRank(mainRowsRaw, compareProvince) : null;

    if (sameRegion) {
      const a = mainProvince || "—";
      const b = compareProvince || "—";
      return reg
        ? `Top 5 ผู้ป่วยสะสมในภูมิภาค ${reg} ${a} อยู่ลำดับที่ ${rankMain ?? "—"} • ${b} อยู่ลำดับที่ ${
            rankCompareInSame ?? "—"
          }`
        : `Top 5 ผู้ป่วยสะสมในภูมิภาคเดียวกัน ${a} • ${b}`;
    }

    return reg
      ? `Top 5 ผู้ป่วยสะสมในภูมิภาค ${reg} ${mainProvince || "—"} อยู่ลำดับที่ ${rankMain ?? "—"}`
      : `Top 5 ผู้ป่วยสะสมในภูมิภาคของจังหวัดหลัก ${mainProvince || "—"}`;
  }, [
    data?.mainRegion,
    sameRegion,
    mainRowsRaw,
    mainProvince,
    compareProvince,
    regionById,
    regionByKey,
  ]);

  const titleCompare = useMemo(() => {
    if (sameRegion) return "";

    const regFull = resolveRegionName(data?.compareRegion, regionById, regionByKey);
    const reg = regFull ? prettyRegion(regFull) : "";

    const rank = findRank(compareRowsRaw, compareProvince);

    return reg
      ? `Top 5 ผู้ป่วยสะสมในภูมิภาค ${reg} ${compareProvince || "—"} อยู่ลำดับที่ ${rank ?? "—"}`
      : `Top 5 ผู้ป่วยสะสมในภูมิภาคของจังหวัดที่เปรียบเทียบ ${compareProvince || "—"}`;
  }, [data?.compareRegion, sameRegion, compareRowsRaw, compareProvince, regionById, regionByKey]);

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ให้ครบก่อน
        เพื่อดูกราฟเปรียบเทียบภูมิภาค)
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
            ) : sameRegion || compareRows.length === 0 ? (
              <div className="mb-6">
                <ChartBlock title={titleMain} rows={mainRows} xMax={xMaxMain} yWidth={yWidthMain} />
              </div>
            ) : (
              <div className="mb-6 grid gap-6 lg:grid-cols-2">
                <ChartBlock title={titleMain} rows={mainRows} xMax={xMaxMain} yWidth={yWidthMain} />
                <ChartBlock
                  title={titleCompare}
                  rows={compareRows}
                  xMax={xMaxCompare}
                  yWidth={yWidthCompare}
                />
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
