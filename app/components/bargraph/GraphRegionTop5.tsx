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

/** โครงตอบจาก API ที่ใช้ */
type APIResp = {
  region?: string;
  topPatients?: Array<{ province: string; patients: number }>;
  selected?: { province: string; patients: number; patientsRank?: number; region?: string };
  selectedProvince?: { province: string; patients: number; rank: number; region?: string };
};

type Row = { province: string; patients: number; rank?: number; isSelected?: boolean };

/** พาเล็ตความเสี่ยง (มาก → น้อย) */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"]; // แดงเข้ม, ส้ม, เหลือง, เขียว

/** เกณฑ์จำนวนผู้ป่วยอ้างอิง (ใช้เหมือนในแผนที่) */
const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

/** ผสมสีแบบ linear RGB */
function blend(c1: string, c2: string, t: number) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const aR = (a >> 16) & 255, aG = (a >> 8) & 255, aB = a & 255;
  const bR = (b >> 16) & 255, bG = (b >> 8) & 255, bB = b & 255;
  const r = Math.round(aR + (bR - aR) * t);
  const g = Math.round(aG + (bG - aG) * t);
  const b2 = Math.round(aB + (bB - aB) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b2).toString(16).slice(1)}`;
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

export default function GraphRegionTop5() {
  const { start_date, end_date, province } = useDashboardStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [regionName, setRegionName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const url = `/api/dashBoard/region-by-province?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
          province ?? ""
        )}`;

        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");
        const json: APIResp = text ? JSON.parse(text) : ({} as APIResp);
        if (cancelled) return;

        // Top-5 จาก API (ไม่รวมจังหวัดที่เลือก)
        const baseTop: Row[] = (json.topPatients ?? [])
          .slice(0, 5)
          .map((d, i) => ({
            province: d.province,
            patients: Number(d.patients ?? 0),
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
                patients: Number(sel.patients ?? 0),
                rank: sel.patientsRank,
                isSelected: true,
              });
              finalRows = finalRows.slice(0, 5);
            } else {
              finalRows = finalRows.map((r) =>
                r.province === sel.province ? { ...r, isSelected: true, rank: sel.patientsRank } : r
              );
            }
          } else if (extra && province) {
            finalRows.push({
              province: `${extra.province} (อันดับ ${extra.rank})`,
              patients: Number(extra.patients ?? 0),
              rank: extra.rank,
              isSelected: true,
            });
          }
        }

        setRows(finalRows);
        setRegionName(sel?.region || json.region || "");
      } catch (err) {
        console.error("❌ Fetch error (region top5):", err);
        if (!cancelled) {
          setRows([]);
          setRegionName("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [start_date, end_date, province]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...rows.map((d) => Number(d.patients ?? 0)))),
    [rows]
  );

  const yWidth = useMemo(() => {
    const longest = rows.reduce((m, d) => Math.max(m, (d.province ?? "").length), 0);
    return Math.min(200, Math.max(110, longest * 10));
  }, [rows]);

  const title = regionName ? `ผู้ป่วยสะสมใน ${regionName}` : "ผู้ป่วยสะสมในภูมิภาค";
  const legend = riskLegendText();

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">{title}</h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
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
              fill="#004680" // จะถูกแทนด้วย Cell รายแท่ง
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
            >
              <LabelList dataKey="patients" content={<ValueLabelRight />} />
              {rows.map((_, idx) => (
                <Cell key={`c-${idx}`} fill={colorByIndex(idx, rows.length)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend: 2 แถว (แถวชื่อ → แถว สูงมาก+สูง → แถว ปานกลาง+ต่ำ) */}
      <div className="mt-2 rounded border px-3 py-2 text-sm">
        <div className="font-semibold mb-1">ระดับความเสี่ยง</div>
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
        อ้างอิงเกณฑ์จาก DDC: สูงมาก {TH_NUMBER(THRESHOLD_VERY_HIGH)}+ ราย, สูง {TH_NUMBER(THRESHOLD_HIGH)} ถึง {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย,
        ปานกลาง {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย, ต่ำ น้อยกว่า {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
      </p>
    </div>
  );
}
