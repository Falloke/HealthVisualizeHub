// app/components/bargraph/GraphCompareRegionTop5.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  TH_NUMBER,
  niceMax,
  ProvinceCountTooltip,
  ValueLabelRight,
} from "@/app/components/bargraph/GraphUtils";

type APIResp = {
  region?: string;
  topPatients?: Array<{ province: string; patients: number | string }>;
  selected?: {
    province: string;
    patients: number | string;
    patientsRank?: number;
    region?: string;
  };
  selectedProvince?: {
    province: string;
    patients: number | string;
    rank: number;
    region?: string;
  };
};

type Row = {
  province: string;
  patients: number; // ใช้ number ภายในไฟล์นี้เสมอ
  rank?: number;
  isA?: boolean;
  isB?: boolean;
};

type RowWithFill = Row & { fill: string };

/** ✅ พาเล็ตความเสี่ยง (ตามกราฟ GraphByAgePatients) */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"] as const;
const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

/** ✅ กันค่าจาก API เป็น string มี comma เช่น "7,767" */
function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function riskLevel(patients: unknown): 0 | 1 | 2 | 3 {
  const v = toNumber(patients);
  if (v >= THRESHOLD_VERY_HIGH) return 0; // สูงมาก
  if (v >= THRESHOLD_HIGH) return 1; // สูง
  if (v >= THRESHOLD_MEDIUM) return 2; // ปานกลาง
  return 3; // ต่ำ
}

function colorByRisk(patients: unknown): string {
  return RISK_COLORS[riskLevel(patients)];
}

/** ✅ ใส่สีตามเกณฑ์เท่านั้น (ไม่มีไล่สี ไม่มี fallback) */
function addRiskFillStrict(rows: Row[]): RowWithFill[] {
  return rows.map((r) => {
    const p = toNumber(r.patients);
    return { ...r, patients: p, fill: colorByRisk(p) };
  });
}

/** ข้อความ legend */
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

type Props = {
  provinceA: string | null;
  provinceB: string | null;
};

// -------------------- responsive helpers --------------------

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect?.width ?? 0);
      if (next) setW(next);
    });
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));

    return () => ro.disconnect();
  }, []);

  return { ref, width: w };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function calcYAxisLayout(containerWidth: number, longestChars: number) {
  const w = containerWidth || 768;

  const fontSize = w < 420 ? 11 : w < 640 ? 12 : 14;
  const maxChars = w < 420 ? 10 : w < 640 ? 14 : 18;

  const widthByScreen = Math.floor(w * (w < 420 ? 0.32 : 0.30));
  const widthByText = Math.floor(
    clamp(longestChars, 6, maxChars) * (fontSize - 1) + 22
  );

  const yWidth = clamp(
    Math.min(widthByScreen, widthByText),
    84,
    w < 420 ? 120 : 180
  );

  const marginLeft = w < 420 ? 8 : 12;
  const marginRight = w < 420 ? 44 : 64;

  return { yWidth, fontSize, maxChars, marginLeft, marginRight };
}

function truncateLabel(value: string, maxChars: number) {
  const s = String(value ?? "");
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function YAxisTick({ x, y, payload, fontSize, maxChars }: any) {
  const label = truncateLabel(payload?.value ?? "", maxChars);
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fontSize={fontSize}
      fill="#374151"
    >
      {label}
    </text>
  );
}

/** helper: แปลงผล API ของ 1 จังหวัด ให้เป็น rows Top5 ในภูมิภาคของจังหวัดนั้น */
function buildRowsForOneProvince(
  resp: APIResp,
  selectedProvince: string | null,
  flag: "A" | "B"
): { rows: Row[]; regionName: string } {
  const baseTop: Row[] = (resp.topPatients ?? [])
    .slice(0, 5)
    .map((d, i) => ({
      province: d.province,
      patients: toNumber(d.patients),
      rank: i + 1,
      isA: flag === "A" && d.province === selectedProvince,
      isB: flag === "B" && d.province === selectedProvince,
    }));

  let rows = [...baseTop];

  const extra = resp.selectedProvince;
  if (selectedProvince && extra && !rows.some((r) => r.province === extra.province)) {
    rows.push({
      province: `${extra.province} (อันดับ ${extra.rank})`,
      patients: toNumber(extra.patients),
      rank: extra.rank,
      isA: flag === "A",
      isB: flag === "B",
    });
  }

  const regionName = resp.selected?.region || resp.region || "";
  return { rows, regionName };
}

// -------------------- component --------------------

export default function GraphCompareRegionTop5({ provinceA, provinceB }: Props) {
  const { start_date, end_date } = useDashboardStore();
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"singleRegion" | "twoRegions">("singleRegion");

  const [rowsSingle, setRowsSingle] = useState<Row[]>([]);
  const [regionTitle, setRegionTitle] = useState("");

  const [rowsA, setRowsA] = useState<Row[]>([]);
  const [rowsB, setRowsB] = useState<Row[]>([]);
  const [regionAName, setRegionAName] = useState("");
  const [regionBName, setRegionBName] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!provinceA && !provinceB) {
        setRowsSingle([]);
        setRowsA([]);
        setRowsB([]);
        return;
      }

      try {
        setLoading(true);

        const [respA, respB] = await Promise.all([
          provinceA
            ? fetch(
                `/api/dashBoard/region-by-province?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
                  provinceA
                )}`
              ).then(async (r) => {
                const t = await r.text();
                if (!r.ok) throw new Error(t || "โหลดข้อมูล A ไม่สำเร็จ");
                return (t ? JSON.parse(t) : {}) as APIResp;
              })
            : Promise.resolve(undefined),
          provinceB
            ? fetch(
                `/api/dashBoard/region-by-province?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
                  provinceB
                )}`
              ).then(async (r) => {
                const t = await r.text();
                if (!r.ok) throw new Error(t || "โหลดข้อมูล B ไม่สำเร็จ");
                return (t ? JSON.parse(t) : {}) as APIResp;
              })
            : Promise.resolve(undefined),
        ]);

        if (cancelled) return;

        if (respA && !respB) {
          const { rows, regionName } = buildRowsForOneProvince(respA, provinceA, "A");
          setMode("singleRegion");
          setRowsSingle(rows);
          setRegionTitle(regionName);
          return;
        }
        if (!respA && respB) {
          const { rows, regionName } = buildRowsForOneProvince(respB, provinceB, "B");
          setMode("singleRegion");
          setRowsSingle(rows);
          setRegionTitle(regionName);
          return;
        }
        if (!respA || !respB) {
          setRowsSingle([]);
          setRowsA([]);
          setRowsB([]);
          return;
        }

        const regionA =
          respA.selected?.region || respA.selectedProvince?.region || respA.region || "";
        const regionB =
          respB.selected?.region || respB.selectedProvince?.region || respB.region || "";

        if (regionA && regionB && regionA === regionB) {
          const baseTop: Row[] = (respA.topPatients ?? []).slice(0, 5).map((d, i) => ({
            province: d.province,
            patients: toNumber(d.patients),
            rank: i + 1,
            isA: provinceA ? d.province === provinceA : false,
            isB: provinceB ? d.province === provinceB : false,
          }));

          let combined: Row[] = [...baseTop];

          const extraA = respA.selectedProvince;
          if (provinceA && extraA && !combined.some((r) => r.province === extraA.province)) {
            combined.push({
              province: `${extraA.province} (อันดับ ${extraA.rank})`,
              patients: toNumber(extraA.patients),
              rank: extraA.rank,
              isA: true,
            });
          }

          const extraB = respB.selectedProvince;
          if (provinceB && extraB && !combined.some((r) => r.province === extraB.province)) {
            combined.push({
              province: `${extraB.province} (อันดับ ${extraB.rank})`,
              patients: toNumber(extraB.patients),
              rank: extraB.rank,
              isB: true,
            });
          }

          setMode("singleRegion");
          setRowsSingle(combined);
          setRegionTitle(regionA);
        } else {
          const oneA = buildRowsForOneProvince(respA, provinceA, "A");
          const oneB = buildRowsForOneProvince(respB, provinceB, "B");

          setMode("twoRegions");
          setRowsA(oneA.rows);
          setRowsB(oneB.rows);
          setRegionAName(oneA.regionName || `ภูมิภาคของ ${provinceA}`);
          setRegionBName(oneB.regionName || `ภูมิภาคของ ${provinceB}`);
        }
      } catch (err) {
        console.error("❌ Fetch error (compare region top5):", err);
        if (!cancelled) {
          setRowsSingle([]);
          setRowsA([]);
          setRowsB([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provinceA, provinceB, start_date, end_date]);

  const legend = riskLegendText();

  // ✅ strict threshold colors
  const rowsSingleFill = useMemo(() => addRiskFillStrict(rowsSingle), [rowsSingle]);
  const rowsAFill = useMemo(() => addRiskFillStrict(rowsA), [rowsA]);
  const rowsBFill = useMemo(() => addRiskFillStrict(rowsB), [rowsB]);

  const xMaxSingle = useMemo(
    () => niceMax(Math.max(0, ...rowsSingleFill.map((d) => toNumber(d.patients)))),
    [rowsSingleFill]
  );
  const xMaxA = useMemo(
    () => niceMax(Math.max(0, ...rowsAFill.map((d) => toNumber(d.patients)))),
    [rowsAFill]
  );
  const xMaxB = useMemo(
    () => niceMax(Math.max(0, ...rowsBFill.map((d) => toNumber(d.patients)))),
    [rowsBFill]
  );

  const legendBlock = (
    <>
      <div className="mt-2 rounded border px-3 py-2 text-sm">
        <div className="mb-1 font-semibold">ระดับความเสี่ยง</div>
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
        {TH_NUMBER(THRESHOLD_HIGH)} ถึง {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย, ปานกลาง{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย, ต่ำ น้อยกว่า{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
      </p>
    </>
  );

  if (loading) {
    return (
      <div className="rounded bg-white p-4 shadow">
        <h4 className="mb-2 font-bold">เปรียบเทียบผู้ป่วยสะสมตามภูมิภาค</h4>
        <p>⏳ กำลังโหลด...</p>
      </div>
    );
  }

  // -------------------- SINGLE REGION --------------------
  if (mode === "singleRegion") {
    const title = regionTitle
      ? `ผู้ป่วยสะสมใน ${regionTitle} (Top 5 จังหวัด)`
      : "ผู้ป่วยสะสมในภูมิภาค (Top 5 จังหวัด)";

    const { ref, width } = useElementWidth<HTMLDivElement>();
    const longest = useMemo(
      () => rowsSingleFill.reduce((m, d) => Math.max(m, String(d.province ?? "").length), 0),
      [rowsSingleFill]
    );
    const y = useMemo(() => calcYAxisLayout(width, longest), [width, longest]);

    return (
      <div ref={ref} className="rounded bg-white p-4 shadow">
        <h4 className="mb-2 font-bold">{title}</h4>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={rowsSingleFill}
            layout="vertical"
            margin={{ top: 8, right: y.marginRight, bottom: 16, left: y.marginLeft }}
            barCategoryGap="2%"
            barGap={0}
          >
            <XAxis
              type="number"
              tickFormatter={TH_NUMBER}
              tickMargin={8}
              domain={[0, xMaxSingle]}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="province"
              width={y.yWidth}
              interval={0}
              tick={(props) => <YAxisTick {...props} fontSize={y.fontSize} maxChars={y.maxChars} />}
            />
            <Tooltip content={<ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />} />

            <Bar
              dataKey="patients"
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
              fill={RISK_COLORS[3]} // default
              isAnimationActive={false}
            >
              <LabelList dataKey="patients" content={<ValueLabelRight />} />
              {rowsSingleFill.map((row, idx) => (
                <Cell key={`c-single-${idx}`} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {legendBlock}
      </div>
    );
  }

  // -------------------- TWO REGIONS --------------------
  const { ref: refA, width: wA } = useElementWidth<HTMLDivElement>();
  const { ref: refB, width: wB } = useElementWidth<HTMLDivElement>();

  const longestA = useMemo(
    () => rowsAFill.reduce((m, d) => Math.max(m, String(d.province ?? "").length), 0),
    [rowsAFill]
  );
  const longestB = useMemo(
    () => rowsBFill.reduce((m, d) => Math.max(m, String(d.province ?? "").length), 0),
    [rowsBFill]
  );

  const yA = useMemo(() => calcYAxisLayout(wA, longestA), [wA, longestA]);
  const yB = useMemo(() => calcYAxisLayout(wB, longestB), [wB, longestB]);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-4 font-bold">เปรียบเทียบผู้ป่วยสะสม Top 5 ตามภูมิภาคของจังหวัดที่เลือก</h4>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div ref={refA}>
          <h5 className="mb-2 font-semibold">
            ภูมิภาคของ {provinceA ?? "-"} {regionAName ? `${regionAName}` : ""}
          </h5>

          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={rowsAFill}
              layout="vertical"
              margin={{ top: 8, right: yA.marginRight, bottom: 16, left: yA.marginLeft }}
              barCategoryGap="2%"
              barGap={0}
            >
              <XAxis
                type="number"
                tickFormatter={TH_NUMBER}
                tickMargin={8}
                domain={[0, xMaxA]}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="province"
                width={yA.yWidth}
                interval={0}
                tick={(props) => <YAxisTick {...props} fontSize={yA.fontSize} maxChars={yA.maxChars} />}
              />
              <Tooltip content={<ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />} />

              <Bar
                dataKey="patients"
                name="ผู้ป่วยสะสม"
                barSize={26}
                radius={[0, 6, 6, 0]}
                fill={RISK_COLORS[3]}
                isAnimationActive={false}
              >
                <LabelList dataKey="patients" content={<ValueLabelRight />} />
                {rowsAFill.map((row, idx) => (
                  <Cell key={`c-a-${idx}`} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div ref={refB}>
          <h5 className="mb-2 font-semibold">
            ภูมิภาคของ {provinceB ?? "-"} {regionBName ? `(${regionBName})` : ""}
          </h5>

          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={rowsBFill}
              layout="vertical"
              margin={{ top: 8, right: yB.marginRight, bottom: 16, left: yB.marginLeft }}
              barCategoryGap="2%"
              barGap={0}
            >
              <XAxis
                type="number"
                tickFormatter={TH_NUMBER}
                tickMargin={8}
                domain={[0, xMaxB]}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="province"
                width={yB.yWidth}
                interval={0}
                tick={(props) => <YAxisTick {...props} fontSize={yB.fontSize} maxChars={yB.maxChars} />}
              />
              <Tooltip content={<ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />} />

              <Bar
                dataKey="patients"
                name="ผู้ป่วยสะสม"
                barSize={26}
                radius={[0, 6, 6, 0]}
                fill={RISK_COLORS[3]}
                isAnimationActive={false}
              >
                <LabelList dataKey="patients" content={<ValueLabelRight />} />
                {rowsBFill.map((row, idx) => (
                  <Cell key={`c-b-${idx}`} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {legendBlock}
    </div>
  );
}
