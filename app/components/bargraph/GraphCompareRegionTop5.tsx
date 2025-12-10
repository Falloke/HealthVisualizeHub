// app/components/bargraph/GraphCompareRegionTop5.tsx
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
import {
  TH_NUMBER,
  niceMax,
  ProvinceCountTooltip,
  ValueLabelRight,
} from "@/app/components/bargraph/GraphUtils";

type APIResp = {
  region?: string;
  topPatients?: Array<{ province: string; patients: number }>;
  selected?: {
    province: string;
    patients: number;
    patientsRank?: number;
    region?: string;
  };
  selectedProvince?: {
    province: string;
    patients: number;
    rank: number;
    region?: string;
  };
};

type Row = {
  province: string;
  patients: number;
  rank?: number;
  isA?: boolean;
  isB?: boolean;
};

/** พาเล็ตความเสี่ยง (มาก → น้อย) */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"];

// เกณฑ์เดียวกับ GraphRegionTop5
const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

/** ผสมสีแบบ linear RGB */
function blend(c1: string, c2: string, t: number) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);

  const aR = (a >> 16) & 255;
  const aG = (a >> 8) & 255;
  const aB = a & 255;

  const bR = (b >> 16) & 255;
  const bG = (b >> 8) & 255;
  const bB = b & 255;

  const r = Math.round(aR + (bR - aR) * t);
  const g = Math.round(aG + (bG - aG) * t);
  const b2 = Math.round(aB + (bB - aB) * t);

  return `#${((1 << 24) + (r << 16) + (g << 8) + b2)
    .toString(16)
    .slice(1)}`;
}

/** ให้สีตาม “อันดับ” (index 0 = มากสุด = แดงเข้ม) */
function colorByIndex(i: number, total: number) {
  if (total <= 1) return RISK_COLORS[0];
  const segCount = RISK_COLORS.length - 1;
  const t = i / (total - 1); // 0..1
  const x = t * segCount;
  const k = Math.min(segCount - 1, Math.max(0, Math.floor(x)));
  const localT = x - k;
  return blend(RISK_COLORS[k], RISK_COLORS[k + 1], localT);
}

/** ข้อความ legend แบบย่อ */
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
  /** จังหวัด A ที่ต้องการเปรียบเทียบ */
  provinceA: string | null;
  /** จังหวัด B ที่ต้องการเปรียบเทียบ */
  provinceB: string | null;
};

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
      patients: Number(d.patients ?? 0),
      rank: i + 1,
      isA: flag === "A" && d.province === selectedProvince,
      isB: flag === "B" && d.province === selectedProvince,
    }));

  let rows = [...baseTop];

  const extra = resp.selectedProvince;
  if (
    selectedProvince &&
    extra &&
    !rows.some((r) => r.province === extra.province)
  ) {
    rows.push({
      province: `${extra.province} (อันดับ ${extra.rank})`,
      patients: Number(extra.patients ?? 0),
      rank: extra.rank,
      isA: flag === "A",
      isB: flag === "B",
    });
  }

  const regionName = resp.selected?.region || resp.region || "";
  return { rows, regionName };
}

/** กราฟเปรียบเทียบ Top5 ระหว่างจังหวัด (ดูตามภูมิภาค) */
export default function GraphCompareRegionTop5({
  provinceA,
  provinceB,
}: Props) {
  const { start_date, end_date } = useDashboardStore();

  const [loading, setLoading] = useState(false);

  // โหมดการแสดงผล
  const [mode, setMode] = useState<"singleRegion" | "twoRegions">(
    "singleRegion"
  );

  // กรณีภูมิภาคเดียวกัน → ใช้ rowsSingle + regionTitle
  const [rowsSingle, setRowsSingle] = useState<Row[]>([]);
  const [regionTitle, setRegionTitle] = useState("");

  // กรณีคนละภูมิภาค → rowsA/rowsB แยกกัน
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

        // เรียก API ตามจังหวัด (ใช้ endpoint เดิมของ dashboard)
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

        // ถ้ามีแค่จังหวัดเดียว → ใช้โหมด singleRegion ไปเลย
        if (respA && !respB) {
          const { rows, regionName } = buildRowsForOneProvince(
            respA,
            provinceA,
            "A"
          );
          setMode("singleRegion");
          setRowsSingle(rows);
          setRegionTitle(regionName);
          return;
        }
        if (!respA && respB) {
          const { rows, regionName } = buildRowsForOneProvince(
            respB,
            provinceB,
            "B"
          );
          setMode("singleRegion");
          setRowsSingle(rows);
          setRegionTitle(regionName);
          return;
        }
        if (!respA || !respB) {
          // ไม่มีข้อมูลเลย
          setRowsSingle([]);
          setRowsA([]);
          setRowsB([]);
          return;
        }

        // มีจังหวัด A+B ครบ
        const regionA =
          respA.selected?.region || respA.selectedProvince?.region || respA.region || "";
        const regionB =
          respB.selected?.region || respB.selectedProvince?.region || respB.region || "";

        // ถ้าอยู่ภูมิภาคเดียวกัน → รวมเป็นกราฟเดียว
        if (regionA && regionB && regionA === regionB) {
          const baseTop = (respA.topPatients ?? [])
            .slice(0, 5)
            .map((d, i) => ({
              province: d.province,
              patients: Number(d.patients ?? 0),
              rank: i + 1,
              isA: provinceA ? d.province === provinceA : false,
              isB: provinceB ? d.province === provinceB : false,
            }));

          let combined: Row[] = [...baseTop];

          // ถ้า A ไม่อยู่ใน Top5 ให้ใส่เพิ่มท้าย
          const extraA = respA.selectedProvince;
          if (
            provinceA &&
            extraA &&
            !combined.some((r) => r.province === extraA.province)
          ) {
            combined.push({
              province: `${extraA.province} (อันดับ ${extraA.rank})`,
              patients: Number(extraA.patients ?? 0),
              rank: extraA.rank,
              isA: true,
            });
          }

          // ถ้า B ไม่อยู่ใน Top5 ให้ใส่เพิ่มท้าย
          const extraB = respB.selectedProvince;
          if (
            provinceB &&
            extraB &&
            !combined.some((r) => r.province === extraB.province)
          ) {
            combined.push({
              province: `${extraB.province} (อันดับ ${extraB.rank})`,
              patients: Number(extraB.patients ?? 0),
              rank: extraB.rank,
              isB: true,
            });
          }

          setMode("singleRegion");
          setRowsSingle(combined);
          setRegionTitle(regionA);
        } else {
          // คนละภูมิภาค → ทำกราฟแยก
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

  // สำหรับโหมด singleRegion
  const xMaxSingle = useMemo(
    () =>
      niceMax(Math.max(0, ...rowsSingle.map((d) => Number(d.patients ?? 0)))),
    [rowsSingle]
  );
  const yWidthSingle = useMemo(() => {
    const longest = rowsSingle.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(200, Math.max(110, longest * 10));
  }, [rowsSingle]);

  // สำหรับโหมด twoRegions
  const xMaxA = useMemo(
    () => niceMax(Math.max(0, ...rowsA.map((d) => Number(d.patients ?? 0)))),
    [rowsA]
  );
  const yWidthA = useMemo(() => {
    const longest = rowsA.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(200, Math.max(110, longest * 10));
  }, [rowsA]);

  const xMaxB = useMemo(
    () => niceMax(Math.max(0, ...rowsB.map((d) => Number(d.patients ?? 0)))),
    [rowsB]
  );
  const yWidthB = useMemo(() => {
    const longest = rowsB.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(200, Math.max(110, longest * 10));
  }, [rowsB]);

  const legendBlock = (
    <>
      <div className="mt-2 rounded border px-3 py-2 text-sm">
        <div className="font-semibold mb-1">ระดับความเสี่ยง</div>
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
        อ้างอิงเกณฑ์จาก DDC: สูงมาก {TH_NUMBER(THRESHOLD_VERY_HIGH)}+
        ราย, สูง {TH_NUMBER(THRESHOLD_HIGH)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย, ปานกลาง{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย, ต่ำ น้อยกว่า{" "}
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

  if (mode === "singleRegion") {
    const title = regionTitle
      ? `ผู้ป่วยสะสมใน ${regionTitle} (Top 5 จังหวัด)`
      : "ผู้ป่วยสะสมในภูมิภาค (Top 5 จังหวัด)";

    return (
      <div className="rounded bg-white p-4 shadow">
        <h4 className="mb-2 font-bold">{title}</h4>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={rowsSingle}
            layout="vertical"
            margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
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
              width={yWidthSingle}
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
              fill="#004680"
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
            >
              <LabelList dataKey="patients" content={<ValueLabelRight />} />
              {rowsSingle.map((_, idx) => (
                <Cell
                  key={`c-single-${idx}`}
                  fill={colorByIndex(idx, rowsSingle.length)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {legendBlock}
      </div>
    );
  }

  // mode === "twoRegions" → 2 กราฟข้างกัน
  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-4 font-bold">
        เปรียบเทียบผู้ป่วยสะสม Top 5 ตามภูมิภาคของจังหวัดที่เลือก
      </h4>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* กราฟภูมิภาคของจังหวัด A */}
        <div>
          <h5 className="mb-2 font-semibold">
            ภูมิภาคของ {provinceA ?? "-"}{" "}
            {regionAName ? `(${regionAName})` : ""}
          </h5>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={rowsA}
              layout="vertical"
              margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
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
                width={yWidthA}
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
                fill="#004680"
                name="ผู้ป่วยสะสม"
                barSize={26}
                radius={[0, 6, 6, 0]}
              >
                <LabelList dataKey="patients" content={<ValueLabelRight />} />
                {rowsA.map((_, idx) => (
                  <Cell
                    key={`c-a-${idx}`}
                    fill={colorByIndex(idx, rowsA.length)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* กราฟภูมิภาคของจังหวัด B */}
        <div>
          <h5 className="mb-2 font-semibold">
            ภูมิภาคของ {provinceB ?? "-"}{" "}
            {regionBName ? `(${regionBName})` : ""}
          </h5>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={rowsB}
              layout="vertical"
              margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
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
                width={yWidthB}
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
                fill="#004680"
                name="ผู้ป่วยสะสม"
                barSize={26}
                radius={[0, 6, 6, 0]}
              >
                <LabelList dataKey="patients" content={<ValueLabelRight />} />
                {rowsB.map((_, idx) => (
                  <Cell
                    key={`c-b-${idx}`}
                    fill={colorByIndex(idx, rowsB.length)}
                  />
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
