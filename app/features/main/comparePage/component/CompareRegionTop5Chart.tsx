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
  note?: string; // ✅ ไม่ใช้แล้ว แต่เผื่อ payload ยังส่งมา
  error?: string;

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

// -------------------- helpers --------------------

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

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
    sameRegion: resp.sameRegion ?? d.sameRegion ?? false, // ✅ default = false
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

function compactName(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

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

/** ✅ ใช้ตัวแปล region แบบเดียวกับตัวอย่าง: ทำให้เป็นชื่ออ่านง่าย */
function regionLabel(region?: string | null): string {
  if (!region) return "";
  const raw = String(region).trim();
  if (!raw) return "";

  // ถ้าเป็นไทยอยู่แล้ว
  if (/[ก-๙]/.test(raw)) {
    if (raw.includes("กรุงเทพ")) return "กรุงเทพและปริมณฑล";
    if (raw.startsWith("ภาค")) return raw; // เช่น "ภาคเหนือ"
    // ถ้ามาเป็น "เหนือ/กลาง/ใต้" -> เติม "ภาค"
    if (/^(เหนือ|กลาง|ใต้|ตะวันออก|ตะวันตก|ตะวันออกเฉียงเหนือ|อีสาน)$/.test(raw)) {
      return `ภาค${raw}`;
    }
    // อื่น ๆ: คืนตามจริง
    return raw;
  }

  // ถ้าเป็นเลขโค้ด
  const code = Number(raw);
  const map: Record<number, string> = {
    1: "ภาคเหนือ",
    2: "ภาคตะวันออกเฉียงเหนือ",
    3: "ภาคกลาง",
    4: "ภาคตะวันออก",
    5: "ภาคตะวันตก",
    6: "ภาคใต้",
    7: "กรุงเทพและปริมณฑล",
  };
  return map[code] ?? raw;
}

function buildTitle(opts: {
  regionText: string;
  province?: string | null;
  rank?: number | string | null;
}) {
  const province = opts.province || "—";
  const rank = opts.rank ?? "—";
  const region = opts.regionText || "—";
  return `กราฟ Top 5 ผู้ป่วยสะสมใน${region} จังหวัด${province} อยู่ลำดับที่ ${rank}`;
}

// -------------------- province->region map (จากไฟล์เดียวกับ Sidebar) --------------------

type ProvinceJsonRow = {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
};

function buildProvinceRegionMap(list: ProvinceJsonRow[]) {
  const map = new Map<string, string>();
  for (const p of list ?? []) {
    const name = String(p?.ProvinceNameThai ?? "").trim();
    if (!name) continue;
    const region = String(p?.Region_VaccineRollout_MOPH ?? "").trim();
    map.set(name, region);
  }
  return map;
}

// -------------------- chart block --------------------

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

// -------------------- main component --------------------

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

  // ✅ จังหวัด -> ภูมิภาค (โหลดครั้งเดียว)
  const [provinceRegionMap, setProvinceRegionMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch("/data/Thailand-ProvinceName.json", {
          cache: "force-cache",
          signal: ac.signal,
        });
        if (!res.ok) return;

        const list = (await res.json()) as ProvinceJsonRow[];
        if (cancelled) return;

        setProvinceRegionMap(buildProvinceRegionMap(list));
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        // เงียบไว้ได้ (ถ้าโหลดไม่ได้ ก็แสดง "—")
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

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

  // ✅ fetch compare top5
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

  const mainRowsRaw = data?.mainRows ?? [];
  const compareRowsRaw = data?.compareRows ?? [];

  const mainRows = useMemo<RowWithFill[]>(
    () => mainRowsRaw.map((r) => ({ ...r, fill: colorByRisk(toNumber(r.patients)) })),
    [mainRowsRaw]
  );

  const compareRows = useMemo<RowWithFill[]>(
    () => compareRowsRaw.map((r) => ({ ...r, fill: colorByRisk(toNumber(r.patients)) })),
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

  // ✅ region จาก Sidebar source (จังหวัด -> Region_VaccineRollout_MOPH)
  const regionRawMain = useMemo(() => {
    const pv = String(mainProvince ?? "").trim();
    return pv ? provinceRegionMap.get(pv) ?? "" : "";
  }, [provinceRegionMap, mainProvince]);

  const regionRawCompare = useMemo(() => {
    const pv = String(compareProvince ?? "").trim();
    return pv ? provinceRegionMap.get(pv) ?? "" : "";
  }, [provinceRegionMap, compareProvince]);

  const regionTextMain = useMemo(() => regionLabel(regionRawMain), [regionRawMain]);
  const regionTextCompare = useMemo(() => regionLabel(regionRawCompare), [regionRawCompare]);

  const titleMain = useMemo(() => {
    const rankMain = findRank(mainRowsRaw, mainProvince);
<<<<<<< HEAD
    return buildTitle({
      regionText: regionTextMain,
      province: mainProvince,
      rank: rankMain,
    });
  }, [mainRowsRaw, mainProvince, regionTextMain]);
=======
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
>>>>>>> feature/Method_F&Method_G

  const titleCompare = useMemo(() => {
    const rankCompare = findRank(compareRowsRaw, compareProvince);
    return buildTitle({
      regionText: regionTextCompare,
      province: compareProvince,
      rank: rankCompare,
    });
  }, [compareRowsRaw, compareProvince, regionTextCompare]);

<<<<<<< HEAD
  const showTwoCharts = compareRows.length > 0;
=======
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
>>>>>>> feature/Method_F&Method_G

  return (
    <div className="rounded bg-white p-4 shadow">
      {/* ✅ ไม่โชว์ note แล้ว */}

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          <div className="relative min-h-[420px]">
            {loading && !data && <p>⏳ กำลังโหลด...</p>}

            {!loading && (!data || mainRows.length === 0) ? (
              <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
            ) : showTwoCharts ? (
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
