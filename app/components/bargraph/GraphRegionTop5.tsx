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

type RegionRow = {
  region_id: number;
  region_name_th: string;
  display_order: number;
};

type Row = {
  province: string;
  patients: number;
  rank?: number;
  isSelected?: boolean;
};

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

function colorByRisk(patients: unknown): string {
  const v = toNumber(patients);
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

function compactThai(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/ฯ/g, "")
    .toLowerCase();
}

function prettyRegion(name: string): string {
  const s = (name || "").trim();
  if (!s) return "";
  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล"))
    return "กรุงเทพฯและปริมณฑล";
  const noPrefix = s.replace(/^ภาค\s*/i, "").trim();
  if (noPrefix === "ตะวันออกเฉียงเหนือ") return "ตะวันออกเฉียงเหนือ";
  return noPrefix;
}

function resolveRegionName(
  raw: unknown,
  byId: Record<string, string>,
  byKey: Record<string, string>
) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return byId[String(n)] || s;

  const key = compactThai(s);
  if (byKey[key]) return byKey[key];

  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) {
    return byId["7"] || s;
  }

  return s;
}

/** ✅ ดึง topPatients แบบยืดหยุ่น รองรับ snake_case */
function extractTopPatients(json: any) {
  return (
    (Array.isArray(json?.topPatients) ? json.topPatients : null) ??
    (Array.isArray(json?.top_patients) ? json.top_patients : null) ??
    (Array.isArray(json?.data?.topPatients) ? json.data.topPatients : null) ??
    (Array.isArray(json?.data?.top_patients) ? json.data.top_patients : null) ??
    []
  );
}

/** ✅ selected แบบยืดหยุ่น */
function extractSelected(json: any) {
  return json?.selected ?? json?.data?.selected ?? json?.selected_province ?? null;
}

/** ✅ selectedProvince แบบยืดหยุ่น */
function extractSelectedProvince(json: any) {
  return (
    json?.selectedProvince ??
    json?.selected_province ??
    json?.data?.selectedProvince ??
    json?.data?.selected_province ??
    null
  );
}

/** ✅ region raw แบบยืดหยุ่น */
function extractRegionRaw(json: any) {
  return (
    json?.regionId ??
    json?.region_id ??
    json?.region ??
    json?.data?.regionId ??
    json?.data?.region_id ??
    json?.data?.region ??
    json?.selected?.regionId ??
    json?.selected?.region_id ??
    json?.selected?.region ??
    json?.selectedProvince?.regionId ??
    json?.selectedProvince?.region_id ??
    json?.selectedProvince?.region ??
    ""
  );
}

export default function GraphRegionTop5() {
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);
  const province = useDashboardStore((s) => s.province);
  const diseaseCode = useDashboardStore((s) => s.diseaseCode);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [apiRegionRaw, setApiRegionRaw] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const [regionById, setRegionById] = useState<Record<string, string>>({});
  const [regionByKey, setRegionByKey] = useState<Record<string, string>>({});
  const regionsLoadedRef = useRef(false);

  // โหลดชื่อภูมิภาค
  useEffect(() => {
    if (regionsLoadedRef.current) return;
    regionsLoadedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/ref/regions-moph", { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลด regions_moph ไม่สำเร็จ");

        const json = safeJson<any>(text, {});
        const rr = (json?.rows ?? []) as RegionRow[];

        const byId: Record<string, string> = {};
        const byKey: Record<string, string> = {};

        for (const r of rr) {
          const name = String(r.region_name_th ?? "").trim();
          if (!name) continue;

          byId[String(r.region_id)] = name;
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

  // โหลดข้อมูล topPatients
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        setErr(null);

        if (!province || !province.trim()) {
          setRows([]);
          setApiRegionRaw("");
          setLoading(false);
          return;
        }

        if (!diseaseCode || !diseaseCode.trim()) {
          setRows([]);
          setApiRegionRaw("");
          setLoading(false);
          return;
        }

        setLoading(true);

        const url =
          `/api/dashBoard/region-by-province?start_date=${encodeURIComponent(start_date || "")}` +
          `&end_date=${encodeURIComponent(end_date || "")}` +
          `&province=${encodeURIComponent(province ?? "")}` +
          `&disease=${encodeURIComponent(diseaseCode ?? "")}`;

        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = safeJson<any>(text, {});
        if (cancelled) return;

        const top = extractTopPatients(json);

        const baseTop: Row[] = top.slice(0, 5).map((d: any, i: number) => ({
          province: String(d?.province ?? ""),
          patients: toNumber(d?.patients),
          rank: i + 1,
        }));

        let finalRows: Row[] = [...baseTop];

        const sel = extractSelected(json);
        const extra = extractSelectedProvince(json);

        const patientsRank = Number(sel?.patientsRank ?? sel?.patients_rank ?? 0);

        if (patientsRank > 0) {
          if (patientsRank <= 5) {
            const already = finalRows.some(
              (r) => compactThai(r.province) === compactThai(sel?.province)
            );

            if (!already) {
              const insertAt = Math.max(0, Math.min(4, patientsRank - 1));
              finalRows.splice(insertAt, 0, {
                province: String(sel?.province ?? ""),
                patients: toNumber(sel?.patients),
                rank: patientsRank,
                isSelected: true,
              });
              finalRows = finalRows.slice(0, 5);
            } else {
              finalRows = finalRows.map((r) =>
                compactThai(r.province) === compactThai(sel?.province)
                  ? { ...r, isSelected: true }
                  : r
              );
            }
          } else if (extra) {
            const rk = Number(extra?.rank ?? extra?.patientsRank ?? extra?.patients_rank ?? 0);
            finalRows.push({
              province: `${extra.province} (อันดับ ${rk})`,
              patients: toNumber(extra.patients),
              rank: rk,
              isSelected: true,
            });
          }
        }

        setRows(finalRows);
        setApiRegionRaw(extractRegionRaw(json));
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.error("❌ Fetch error (region top5):", e);
        if (!cancelled) {
          setErr("โหลดข้อมูลไม่สำเร็จ");
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
  }, [start_date, end_date, province, diseaseCode]);

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
          <span className="text-xs text-gray-500">
            จังหวัดที่เลือก: {province}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : !province ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          กรุณาเลือกจังหวัดก่อน เพื่อแสดง Top 5 ผู้ป่วยสะสมในภูมิภาค
        </div>
      ) : !diseaseCode ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          กรุณาเลือกโรคก่อน เพื่อแสดงข้อมูล Top 5
        </div>
      ) : err ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
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
              {rows.map((row, idx) => (
                <Cell key={`c-${idx}`} fill={colorByRisk(row.patients)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

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
        ปานกลาง {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย, ต่ำ น้อยกว่า{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
      </p>
    </div>
  );
}
