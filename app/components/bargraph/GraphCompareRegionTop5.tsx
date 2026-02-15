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
  topDeaths?: Array<{ province: string; deaths?: number | string; region?: string }>;
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
  patients: number;
  rank?: number;
  isA?: boolean;
  isB?: boolean;
};

type RowWithFill = Row & { fill: string };

/** ✅ พาเล็ตความเสี่ยง */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"] as const;
const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

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
  if (v >= THRESHOLD_VERY_HIGH) return 0;
  if (v >= THRESHOLD_HIGH) return 1;
  if (v >= THRESHOLD_MEDIUM) return 2;
  return 3;
}

function colorByRisk(patients: unknown): string {
  return RISK_COLORS[riskLevel(patients)];
}

function addRiskFillStrict(rows: Row[]): RowWithFill[] {
  return rows.map((r) => {
    const p = toNumber(r.patients);
    return { ...r, patients: p, fill: colorByRisk(p) };
  });
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

type Props = {
  provinceA: string | null;
  provinceB: string | null;
};

// -------------------- region helpers --------------------

function pickRegion(resp?: APIResp): string {
  const raw =
    resp?.selected?.region ||
    resp?.selectedProvince?.region ||
    resp?.region ||
    "";
  return String(raw ?? "").trim();
}

type RegionKey = "north" | "central" | "northeast" | "east" | "west" | "south" | "";

function regionKeyOf(raw: string): RegionKey {
  const s = String(raw ?? "").replace(/\s+/g, "").toLowerCase();

  // อังกฤษ (กันกรณี backend ส่ง ENG)
  if (s.includes("north") && !s.includes("east")) return "north";
  if (s.includes("central")) return "central";
  if (s.includes("northeast")) return "northeast";
  if (s.includes("east")) return "east";
  if (s.includes("west")) return "west";
  if (s.includes("south")) return "south";

  // ไทย
  if (s.includes("เหนือ")) return "north";
  if (s.includes("กลาง")) return "central";
  if (s.includes("ตะวันออกเฉียงเหนือ") || s.includes("อีสาน")) return "northeast";
  if (s.includes("ตะวันออก")) return "east";
  if (s.includes("ตะวันตก")) return "west";
  if (s.includes("ใต้")) return "south";

  return "";
}

function displayRegion(raw: string): string {
  const r = String(raw ?? "").trim();
  if (!r) return "";

  // ถ้ามาเป็น "ภาค..." อยู่แล้ว
  if (r.startsWith("ภาค")) return r;

  // ถ้ามาเป็น "ภูมิภาค..." (บางระบบชอบส่งแบบนี้)
  if (r.startsWith("ภูมิภาค")) {
    const tail = r.replace(/^ภูมิภาค/, "").trim();
    return tail ? `ภาค${tail}` : "";
  }

  // ถ้ามาเป็น "เหนือ/กลาง/ใต้" -> เติม "ภาค"
  if (/^(เหนือ|กลาง|ใต้|ตะวันออก|ตะวันตก|ตะวันออกเฉียงเหนือ|อีสาน)$/.test(r)) {
    return `ภาค${r}`;
  }

  // ถ้ามาเป็น ENG แบบสั้น ๆ
  const k = regionKeyOf(r);
  if (k === "north") return "ภาคเหนือ";
  if (k === "central") return "ภาคกลาง";
  if (k === "northeast") return "ภาคตะวันออกเฉียงเหนือ";
  if (k === "east") return "ภาคตะวันออก";
  if (k === "west") return "ภาคตะวันตก";
  if (k === "south") return "ภาคใต้";

  // สุดท้าย: คืนตามจริง (แต่ไม่เติม "ภูมิภาคของ ...")
  return r;
}

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

function buildRowsForOneProvince(
  resp: APIResp,
  selectedProvince: string | null,
  flag: "A" | "B"
): { rows: Row[]; regionName: string; regionKey: RegionKey } {
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
  if (
    selectedProvince &&
    extra &&
    extra.province &&
    !rows.some((r) => r.province === extra.province)
  ) {
    rows.push({
      province: `${extra.province} (อันดับ ${extra.rank})`,
      patients: toNumber(extra.patients),
      rank: extra.rank,
      isA: flag === "A",
      isB: flag === "B",
    });
  }

  const picked = pickRegion(resp);
  const regionName = displayRegion(picked);
  const regionKey = regionKeyOf(picked);

  return { rows, regionName, regionKey };
}

// -------------------- component --------------------

export default function GraphCompareRegionTop5({ provinceA, provinceB }: Props) {
  const { start_date, end_date, diseaseCode } = useDashboardStore();
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"singleRegion" | "twoRegions">(
    "singleRegion"
  );

  const [rowsSingle, setRowsSingle] = useState<Row[]>([]);
  const [regionTitle, setRegionTitle] = useState("");

  const [rowsA, setRowsA] = useState<Row[]>([]);
  const [rowsB, setRowsB] = useState<Row[]>([]);
  const [regionAName, setRegionAName] = useState("");
  const [regionBName, setRegionBName] = useState("");

  // ✅ HOOKS ต้องเรียกเสมอ (ห้ามอยู่ใน if)
  const singleBox = useElementWidth<HTMLDivElement>();
  const boxA = useElementWidth<HTMLDivElement>();
  const boxB = useElementWidth<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ✅ ไม่มีโรค -> ไม่ยิง API
      if (!diseaseCode || !diseaseCode.trim()) {
        setRowsSingle([]);
        setRowsA([]);
        setRowsB([]);
        setRegionTitle("");
        setRegionAName("");
        setRegionBName("");
        return;
      }

      // ✅ ยังไม่เลือกจังหวัดเลย -> เคลียร์เฉย ๆ
      if (!provinceA && !provinceB) {
        setRowsSingle([]);
        setRowsA([]);
        setRowsB([]);
        setRegionTitle("");
        setRegionAName("");
        setRegionBName("");
        return;
      }

      try {
        setLoading(true);

        const makeUrl = (pv: string) =>
          `/api/dashBoard/region-by-province?start_date=${encodeURIComponent(
            start_date || ""
          )}&end_date=${encodeURIComponent(
            end_date || ""
          )}&province=${encodeURIComponent(
            pv
          )}&disease=${encodeURIComponent(diseaseCode)}`;

        const [respA, respB] = await Promise.all([
          provinceA
            ? fetch(makeUrl(provinceA), { cache: "no-store" }).then(async (r) => {
                const t = await r.text();
                if (!r.ok) throw new Error(t || "โหลดข้อมูล A ไม่สำเร็จ");
                return (t ? JSON.parse(t) : {}) as APIResp;
              })
            : Promise.resolve(undefined),

          provinceB
            ? fetch(makeUrl(provinceB), { cache: "no-store" }).then(async (r) => {
                const t = await r.text();
                if (!r.ok) throw new Error(t || "โหลดข้อมูล B ไม่สำเร็จ");
                return (t ? JSON.parse(t) : {}) as APIResp;
              })
            : Promise.resolve(undefined),
        ]);

        if (cancelled) return;

        // ---------- case: มีจังหวัดเดียว ----------
        if (respA && !respB) {
          const one = buildRowsForOneProvince(respA, provinceA, "A");
          setMode("singleRegion");
          setRowsSingle(one.rows);
          setRegionTitle(one.regionName); // ✅ เป็น "ภาค..." แล้ว
          setRowsA([]);
          setRowsB([]);
          setRegionAName("");
          setRegionBName("");
          return;
        }

        if (!respA && respB) {
          const one = buildRowsForOneProvince(respB, provinceB, "B");
          setMode("singleRegion");
          setRowsSingle(one.rows);
          setRegionTitle(one.regionName); // ✅ เป็น "ภาค..." แล้ว
          setRowsA([]);
          setRowsB([]);
          setRegionAName("");
          setRegionBName("");
          return;
        }

        // ---------- case: ไม่มีข้อมูลทั้งคู่ ----------
        if (!respA || !respB) {
          setMode("singleRegion");
          setRowsSingle([]);
          setRegionTitle("");
          setRowsA([]);
          setRowsB([]);
          setRegionAName("");
          setRegionBName("");
          return;
        }

        const oneA = buildRowsForOneProvince(respA, provinceA, "A");
        const oneB = buildRowsForOneProvince(respB, provinceB, "B");

        // ---------- case: อยู่ภูมิภาคเดียวกัน ----------
        if (oneA.regionKey && oneB.regionKey && oneA.regionKey === oneB.regionKey) {
          const baseTop: Row[] = (respA.topPatients ?? [])
            .slice(0, 5)
            .map((d, i) => ({
              province: d.province,
              patients: toNumber(d.patients),
              rank: i + 1,
              isA: provinceA ? d.province === provinceA : false,
              isB: provinceB ? d.province === provinceB : false,
            }));

          let combined: Row[] = [...baseTop];

          const extraA = respA.selectedProvince;
          if (
            provinceA &&
            extraA &&
            extraA.province &&
            !combined.some((r) => r.province === extraA.province)
          ) {
            combined.push({
              province: `${extraA.province} (อันดับ ${extraA.rank})`,
              patients: toNumber(extraA.patients),
              rank: extraA.rank,
              isA: true,
            });
          }

          const extraB = respB.selectedProvince;
          if (
            provinceB &&
            extraB &&
            extraB.province &&
            !combined.some((r) => r.province === extraB.province)
          ) {
            combined.push({
              province: `${extraB.province} (อันดับ ${extraB.rank})`,
              patients: toNumber(extraB.patients),
              rank: extraB.rank,
              isB: true,
            });
          }

          setMode("singleRegion");
          setRowsSingle(combined);

          // ✅ ใช้ชื่อภาคจริง (ภาค...) ไม่ใช้ "ภูมิภาคของ..."
          setRegionTitle(oneA.regionName || oneB.regionName || "");

          setRowsA([]);
          setRowsB([]);
          setRegionAName("");
          setRegionBName("");
        } else {
          // ---------- case: คนละภูมิภาค ----------
          setMode("twoRegions");
          setRowsA(oneA.rows);
          setRowsB(oneB.rows);

          // ✅ ถ้าไม่มี region จริง -> ไม่ใส่ fallback แบบ "ภูมิภาคของ ..."
          setRegionAName(oneA.regionName || "");
          setRegionBName(oneB.regionName || "");

          setRowsSingle([]);
          setRegionTitle("");
        }
      } catch (err) {
        console.error("❌ Fetch error (compare region top5):", err);
        if (!cancelled) {
          setMode("singleRegion");
          setRowsSingle([]);
          setRowsA([]);
          setRowsB([]);
          setRegionTitle("");
          setRegionAName("");
          setRegionBName("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provinceA, provinceB, start_date, end_date, diseaseCode]);

  const legend = riskLegendText();

  const rowsSingleFill = useMemo(
    () => addRiskFillStrict(rowsSingle),
    [rowsSingle]
  );
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

  // ✅ คำนวณ YAxis layout แบบไม่ผิด hooks
  const longestSingle = useMemo(
    () =>
      rowsSingleFill.reduce(
        (m, d) => Math.max(m, String(d.province ?? "").length),
        0
      ),
    [rowsSingleFill]
  );
  const ySingle = useMemo(
    () => calcYAxisLayout(singleBox.width, longestSingle),
    [singleBox.width, longestSingle]
  );

  const longestA = useMemo(
    () => rowsAFill.reduce((m, d) => Math.max(m, String(d.province ?? "").length), 0),
    [rowsAFill]
  );
  const longestB = useMemo(
    () => rowsBFill.reduce((m, d) => Math.max(m, String(d.province ?? "").length), 0),
    [rowsBFill]
  );

  const yA = useMemo(() => calcYAxisLayout(boxA.width, longestA), [boxA.width, longestA]);
  const yB = useMemo(() => calcYAxisLayout(boxB.width, longestB), [boxB.width, longestB]);

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

  // -------------------- UI --------------------

  if (!diseaseCode || !diseaseCode.trim()) {
    return (
      <div className="rounded bg-white p-4 shadow">
        <h4 className="mb-2 font-bold">เปรียบเทียบผู้ป่วยสะสมตามภูมิภาค</h4>
        <p className="text-sm text-gray-500">โปรดเลือกโรคก่อน</p>
      </div>
    );
  }

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
      <div ref={singleBox.ref} className="rounded bg-white p-4 shadow">
        <h4 className="mb-2 font-bold">{title}</h4>

        {rowsSingleFill.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={rowsSingleFill}
              layout="vertical"
              margin={{
                top: 8,
                right: ySingle.marginRight,
                bottom: 16,
                left: ySingle.marginLeft,
              }}
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
                width={ySingle.yWidth}
                interval={0}
                tick={(props) => (
                  <YAxisTick
                    {...props}
                    fontSize={ySingle.fontSize}
                    maxChars={ySingle.maxChars}
                  />
                )}
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
                fill={RISK_COLORS[3]}
                isAnimationActive={false}
              >
                <LabelList dataKey="patients" content={<ValueLabelRight />} />
                {rowsSingleFill.map((row, idx) => (
                  <Cell key={`c-single-${idx}`} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {legendBlock}
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-4 font-bold">
        เปรียบเทียบผู้ป่วยสะสม Top 5 ตามภูมิภาคของจังหวัดที่เลือก
      </h4>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div ref={boxA.ref}>
          <h5 className="mb-2 font-semibold">
<<<<<<< HEAD
            {regionAName ? `${regionAName}` : "ภูมิภาค"} — {provinceA ?? "-"}
=======
            ภูมิภาคของ {provinceA ?? "-"} {regionAName ? `${regionAName}` : ""}
>>>>>>> feature/Method_F&Method_G
          </h5>

          {rowsAFill.length === 0 ? (
            <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={rowsAFill}
                layout="vertical"
                margin={{
                  top: 8,
                  right: yA.marginRight,
                  bottom: 16,
                  left: yA.marginLeft,
                }}
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
                  tick={(props) => (
                    <YAxisTick
                      {...props}
                      fontSize={yA.fontSize}
                      maxChars={yA.maxChars}
                    />
                  )}
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
          )}
        </div>

        <div ref={boxB.ref}>
          <h5 className="mb-2 font-semibold">
            {regionBName ? `${regionBName}` : "ภูมิภาค"} — {provinceB ?? "-"}
          </h5>

          {rowsBFill.length === 0 ? (
            <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={rowsBFill}
                layout="vertical"
                margin={{
                  top: 8,
                  right: yB.marginRight,
                  bottom: 16,
                  left: yB.marginLeft,
                }}
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
                  tick={(props) => (
                    <YAxisTick
                      {...props}
                      fontSize={yB.fontSize}
                      maxChars={yB.maxChars}
                    />
                  )}
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
          )}
        </div>
      </div>

      {legendBlock}
    </div>
  );
}
