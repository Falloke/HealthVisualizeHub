// D:\HealtRiskHub\app\components\bargraph\GraphRegionTop5.tsx
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

/** โครงตอบจาก API ที่ใช้ */
type APIResp = {
  region?: string; // อาจเป็น region_id ("1") หรือชื่อไทย
  topPatients?: Array<{ province: string; patients: number | string }>;
  selected?: {
    province: string;
    patients: number | string;
    patientsRank?: number;
    region?: string; // อาจเป็น region_id หรือชื่อไทย
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
  isSelected?: boolean;
};

type RegionRow = {
  region_id: number;
  region_name_th: string;
  display_order: number;
};

/** ✅ พาเล็ตความเสี่ยง (มาก → น้อย) */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"] as const;

/** ✅ เกณฑ์จำนวนผู้ป่วยอ้างอิง */
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

/** ✅ สีตามเกณฑ์ (ไม่ไล่สี) */
function colorByRisk(patients: unknown): string {
  const v = toNumber(patients);
  if (v >= THRESHOLD_VERY_HIGH) return RISK_COLORS[0];
  if (v >= THRESHOLD_HIGH) return RISK_COLORS[1];
  if (v >= THRESHOLD_MEDIUM) return RISK_COLORS[2];
  return RISK_COLORS[3];
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

function safeJson<T>(text: string, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function compactThai(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/ฯ/g, "")
    .toLowerCase();
}

/** ✅ แปลงชื่อภูมิภาคให้เป็นชื่อที่อยากแสดง */
function prettyRegion(name: string): string {
  const s = (name || "").trim();
  if (!s) return "";

  // เคสพิเศษ: กรุงเทพฯและปริมณฑล
  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) return "กรุงเทพฯและปริมณฑล";

  // ทำให้สั้นลง: "ภาคเหนือ" -> "เหนือ"
  const noPrefix = s.replace(/^ภาค\s*/i, "").trim();

  if (noPrefix === "ตะวันออกเฉียงเหนือ") return "ตะวันออกเฉียงเหนือ";
  return noPrefix;
}

/** ✅ ใช้ mapping จาก DB: รับได้ทั้ง region_id หรือชื่อไทย */
function resolveRegionName(
  raw: unknown,
  byId: Record<string, string>,
  byKey: Record<string, string>
) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // ถ้าเป็นตัวเลข -> map ด้วย region_id
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return byId[String(n)] || s;

  // ถ้ามีไทยอยู่แล้ว -> map ด้วย key
  const key = compactThai(s);
  if (byKey[key]) return byKey[key];

  // fallback: เจอกรุงเทพ
  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) {
    return byId["7"] || s;
  }

  return s;
}

export default function GraphRegionTop5() {
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);
  const province = useDashboardStore((s) => s.province);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [apiRegionRaw, setApiRegionRaw] = useState<string>("");

  // ✅ โหลด regions_moph (ครั้งเดียว)
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

        const json = safeJson<any>(text, {});
        const rows = (json?.rows ?? []) as RegionRow[];

        const byId: Record<string, string> = {};
        const byKey: Record<string, string> = {};

        for (const r of rows) {
          const name = String(r.region_name_th ?? "").trim();
          if (!name) continue;

          byId[String(r.region_id)] = name;

          // key จากชื่อเต็ม + ชื่อที่ตัดคำว่า "ภาค"
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

  // ✅ โหลดข้อมูลกราฟ
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        // ถ้าไม่มีจังหวัด (เช่น หน้าเลือกยังไม่ครบ) ไม่ต้องยิง
        if (!province) {
          setRows([]);
          setApiRegionRaw("");
          setLoading(false);
          return;
        }

        setLoading(true);

        const url =
          `/api/dashBoard/region-by-province?start_date=${encodeURIComponent(start_date || "")}` +
          `&end_date=${encodeURIComponent(end_date || "")}` +
          `&province=${encodeURIComponent(province ?? "")}`;

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = safeJson<APIResp>(text, {} as APIResp);
        if (cancelled) return;

        const baseTop: Row[] = (json.topPatients ?? [])
          .slice(0, 5)
          .map((d, i) => ({
            province: d.province,
            patients: toNumber(d.patients),
            rank: i + 1,
          }));

        let finalRows: Row[] = [...baseTop];

        const sel = json.selected;
        const extra = json.selectedProvince;

        if (sel?.patientsRank) {
          if (sel.patientsRank <= 5) {
            const insertAt = Math.max(0, Math.min(4, sel.patientsRank - 1));
            const already = finalRows.some((r) => r.province === sel.province);

            if (!already) {
              finalRows.splice(insertAt, 0, {
                province: sel.province,
                patients: toNumber(sel.patients),
                rank: sel.patientsRank,
                isSelected: true,
              });
              finalRows = finalRows.slice(0, 5);
            } else {
              finalRows = finalRows.map((r) =>
                r.province === sel.province
                  ? {
                      ...r,
                      isSelected: true,
                      rank: sel.patientsRank,
                      patients: toNumber(sel.patients),
                    }
                  : r
              );
            }
          } else if (extra && province) {
            finalRows.push({
              province: `${extra.province} (อันดับ ${extra.rank})`,
              patients: toNumber(extra.patients),
              rank: extra.rank,
              isSelected: true,
            });
          }
        }

        setRows(finalRows);

        // ✅ เก็บ region ที่ API ส่งมา (อาจเป็น id หรือชื่อ)
        setApiRegionRaw(sel?.region || json.region || "");
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        console.error("❌ Fetch error (region top5):", err);
        if (!cancelled) {
          setRows([]);
          setApiRegionRaw("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [start_date, end_date, province]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...rows.map((d) => toNumber(d.patients)))),
    [rows]
  );

  const yWidth = useMemo(() => {
    const longest = rows.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(200, Math.max(110, longest * 10));
  }, [rows]);

  const regionNameShort = useMemo(() => {
    const resolved = resolveRegionName(apiRegionRaw, regionById, regionByKey);
    return resolved ? prettyRegion(resolved) : "";
  }, [apiRegionRaw, regionById, regionByKey]);

  const title = regionNameShort
    ? `ผู้ป่วยสะสมในภูมิภาค ${regionNameShort}`
    : "ผู้ป่วยสะสมในภูมิภาค";

  const legend = useMemo(() => riskLegendText(), []);

  return (
    <div className="rounded bg-white p-4 shadow">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        {province ? (
          <span className="text-xs text-gray-500"></span>
        ) : null}
      </div>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : !province ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          กรุณาเลือกจังหวัดก่อน เพื่อแสดง Top 5 ผู้ป่วยสะสมในภูมิภาค
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          ไม่พบข้อมูลในช่วงวันที่ที่เลือก
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
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
            <Tooltip
              content={
                <ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />
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
              {rows.map((row, idx) => (
                <Cell key={`c-${idx}`} fill={colorByRisk(row.patients)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div className="mt-2 rounded border px-3 py-2 text-sm">
        <div className="mb-1 font-semibold">ระดับความเสี่ยง</div>
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
        อ้างอิงเกณฑ์จาก DDC: สูงมาก {TH_NUMBER(THRESHOLD_VERY_HIGH)}+ ราย, สูง{" "}
        {TH_NUMBER(THRESHOLD_HIGH)} ถึง {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย,
        ปานกลาง {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย,
        ต่ำ น้อยกว่า {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
      </p>
    </div>
  );
}
