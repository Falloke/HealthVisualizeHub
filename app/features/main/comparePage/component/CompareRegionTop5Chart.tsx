// app/features/main/comparePage/component/CompareRegionTop5Chart.tsx
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
  ok: boolean;
  sameRegion: boolean;
  mainRegion?: string;
  compareRegion?: string;
  mainRows: Row[];
  compareRows: Row[];
  note?: string;
  error?: string;
};

/** สีระดับความเสี่ยง */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"];

const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

/** เลือกสีจาก "ค่าผู้ป่วย" ตามเกณฑ์ความเสี่ยง */
function colorByRisk(patients: number): string {
  const value = Number(patients || 0);
  if (value >= THRESHOLD_VERY_HIGH) return RISK_COLORS[0]; // สูงมาก
  if (value >= THRESHOLD_HIGH) return RISK_COLORS[1]; // สูง
  if (value >= THRESHOLD_MEDIUM) return RISK_COLORS[2]; // ปานกลาง
  return RISK_COLORS[3]; // ต่ำ
}

/** legend text */
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

export default function CompareRegionTop5Chart() {
  const { start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [mainRows, setMainRows] = useState<Row[]>([]);
  const [compareRows, setCompareRows] = useState<Row[]>([]);
  const [mainRegion, setMainRegion] = useState<string>("");
  const [compareRegionName, setCompareRegionName] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mainProvince || !compareProvince) {
      setMainRows([]);
      setCompareRows([]);
      setMainRegion("");
      setCompareRegionName("");
      setNote("");
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
          mainProvince,
          compareProvince,
        });

        const res = await fetch(`/api/compareInfo/region-top5?${qs.toString()}`, {
          cache: "no-store",
        });

        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || "โหลดข้อมูลเปรียบเทียบภูมิภาคไม่สำเร็จ");
        }

        const json: APIResp = text
          ? JSON.parse(text)
          : {
              ok: false,
              sameRegion: false,
              mainRows: [],
              compareRows: [],
            };

        if (cancelled) return;

        if (!json.ok) {
          throw new Error(json.error || "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้");
        }

        setMainRows(json.mainRows ?? []);
        setCompareRows(json.compareRows ?? []);
        setMainRegion(json.mainRegion || "");
        setCompareRegionName(json.compareRegion || "");
        setNote(json.note || "");
      } catch (err: any) {
        console.error("❌ Fetch error (compare region top5):", err);
        if (!cancelled) {
          setMainRows([]);
          setCompareRows([]);
          setMainRegion("");
          setCompareRegionName("");
          setNote("");
          setError(err?.message || "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mainProvince, compareProvince, start_date, end_date]);

  const legend = riskLegendText();

  const xMaxMain = useMemo(
    () => niceMax(Math.max(0, ...mainRows.map((d) => Number(d.patients ?? 0)))),
    [mainRows]
  );
  const xMaxCompare = useMemo(
    () =>
      niceMax(Math.max(0, ...compareRows.map((d) => Number(d.patients ?? 0)))),
    [compareRows]
  );

  const yWidthMain = useMemo(() => {
    const longest = mainRows.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(220, Math.max(120, longest * 10));
  }, [mainRows]);

  const yWidthCompare = useMemo(() => {
    const longest = compareRows.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(220, Math.max(120, longest * 10));
  }, [compareRows]);

  const sameRegion =
    !!compareProvince &&
    !!mainProvince &&
    (compareRows.length === 0 ||
      (mainRegion && compareRegionName && mainRegion === compareRegionName));

  const titleMain = mainRegion
    ? `เปรียบเทียบผู้ป่วยสะสมจังหวัด (ภูมิภาคของจังหวัดหลัก: ${mainRegion})`
    : "เปรียบเทียบผู้ป่วยสะสมจังหวัด (Top 5 จังหวัดหลัก)";

  const titleCompare =
    compareRegionName && !sameRegion
      ? `Top 5 ผู้ป่วยสะสมในภูมิภาคของจังหวัดที่เปรียบเทียบ: ${compareRegionName}`
      : "";

  return (
    <div className="rounded bg-white p-4 shadow">
      {note && (
        <p className="mb-2 text-xs font-semibold text-gray-600">{note}</p>
      )}

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : mainRows.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
      ) : sameRegion || compareRows.length === 0 ? (
        <div className="mb-6">
          <h4 className="mb-2 font-bold">{titleMain}</h4>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={mainRows}
              layout="vertical"
              margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
              barCategoryGap="2%"
              barGap={0}
            >
              <XAxis
                type="number"
                tickFormatter={TH_NUMBER}
                tickMargin={8}
                domain={[0, xMaxMain]}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="province"
                width={yWidthMain}
                interval={0}
                tick={{ fontSize: 14 }}
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
                dataKey="patients"
                name="ผู้ป่วยสะสม"
                barSize={26}
                radius={[0, 6, 6, 0]}
              >
                <LabelList dataKey="patients" content={<ValueLabelRight />} />
                {mainRows.map((row, idx) => (
                  <Cell
                    key={`m-${idx}`}
                    // ใช้สีตามระดับความเสี่ยงเสมอ
                    fill={colorByRisk(row.patients)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {/* ซ้าย: ภูมิภาคของจังหวัดหลัก */}
          <div>
            <h4 className="mb-2 font-bold">{titleMain}</h4>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={mainRows}
                layout="vertical"
                margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
                barCategoryGap="2%"
                barGap={0}
              >
                <XAxis
                  type="number"
                  tickFormatter={TH_NUMBER}
                  tickMargin={8}
                  domain={[0, xMaxMain]}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="province"
                  width={yWidthMain}
                  interval={0}
                  tick={{ fontSize: 14 }}
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
                  dataKey="patients"
                  name="ผู้ป่วยสะสม"
                  barSize={26}
                  radius={[0, 6, 6, 0]}
                >
                  <LabelList dataKey="patients" content={<ValueLabelRight />} />
                  {mainRows.map((row, idx) => (
                    <Cell
                      key={`m-${idx}`}
                      // ใช้สีตามระดับความเสี่ยงสำหรับทุกจังหวัด
                      fill={colorByRisk(row.patients)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ขวา: ภูมิภาคของจังหวัดที่เปรียบเทียบ */}
          <div>
            <h4 className="mb-2 font-bold">{titleCompare}</h4>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={compareRows}
                layout="vertical"
                margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
                barCategoryGap="2%"
                barGap={0}
              >
                <XAxis
                  type="number"
                  tickFormatter={TH_NUMBER}
                  tickMargin={8}
                  domain={[0, xMaxCompare]}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="province"
                  width={yWidthCompare}
                  interval={0}
                  tick={{ fontSize: 14 }}
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
                  dataKey="patients"
                  name="ผู้ป่วยสะสม"
                  barSize={26}
                  radius={[0, 6, 6, 0]}
                >
                  <LabelList dataKey="patients" content={<ValueLabelRight />} />
                  {compareRows.map((row, idx) => (
                    <Cell
                      key={`c-${idx}`}
                      // ใช้สีตามระดับความเสี่ยงเหมือนกัน
                      fill={colorByRisk(row.patients)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 rounded border px-3 py-2 text-sm">
        <div className="mb-1 font-semibold">
          ระดับความเสี่ยง (ตามจำนวนผู้ป่วยสะสม)
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: RISK_COLORS[0] }}
            />
            {legend.veryHigh}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: RISK_COLORS[1] }}
            />
            {legend.high}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: RISK_COLORS[2] }}
            />
            {legend.medium}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: RISK_COLORS[3] }}
            />
            {legend.low}
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">
        อ้างอิงเกณฑ์จาก DDC: สูงมาก {TH_NUMBER(THRESHOLD_VERY_HIGH)}+ ราย,
        สูง {TH_NUMBER(THRESHOLD_HIGH)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย, ปานกลาง{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย, ต่ำ น้อยกว่า{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
      </p>
    </div>
  );
}
