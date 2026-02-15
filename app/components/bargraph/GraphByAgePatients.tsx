// D:\HealtRiskHub\app\components\bargraph\GraphByAgePatients.tsx
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
import type { TooltipProps } from "recharts";
import { useDashboardStore } from "@/store/useDashboardStore";
import { TH_NUMBER, niceMax } from "@/app/components/bargraph/GraphUtils";

type AgeData = { ageRange: string; patients: number };

function getAgeLabel(range: string, mode: "full" | "short" = "full"): string {
  const r = (range || "").trim();
  if (/^0\s*-\s*4$/.test(r))
    return mode === "short" ? "ทารก-ก่อนเรียน" : "ทารก-ก่อนเรียน";
  if (/^(5\s*-\s*9|10\s*-\s*14)$/.test(r)) return "วัยเรียน";
  if (/^15\s*-\s*19$/.test(r)) return "วัยรุ่น";
  if (/^20\s*-\s*24$/.test(r)) return "วัยเริ่มทำงาน";
  if (/^25\s*-\s*44$/.test(r))
    return mode === "short" ? "วัยทำงาน" : "วัยทำงานหลัก";
  if (/^45\s*-\s*59$/.test(r)) return "ผู้ใหญ่ตอนปลาย";
  if (/^60\+?$/.test(r)) return "ผู้สูงอายุ";
  return r;
}

/** ✅ สีตามความเสี่ยง (มาก → น้อย) */
const RISK_COLORS = ["#B00020", "#F4511E", "#FFB300", "#009688"] as const;
const THRESHOLD_VERY_HIGH = 8000;
const THRESHOLD_HIGH = 4000;
const THRESHOLD_MEDIUM = 2000;

function colorByRisk(patients: number): string {
  const v = Number(patients || 0);
  if (v >= THRESHOLD_VERY_HIGH) return RISK_COLORS[0]; // สูงมาก
  if (v >= THRESHOLD_HIGH) return RISK_COLORS[1]; // สูง
  if (v >= THRESHOLD_MEDIUM) return RISK_COLORS[2]; // ปานกลาง
  return RISK_COLORS[3]; // ต่ำ
}

/** ✅ ข้อความ legend แบบย่อ */
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

/* Tooltip: ช่วงอายุ (คำอธิบาย) + จำนวน(ราย) */
function AgeTooltip({
  active,
  payload,
}: TooltipProps<number, string>): JSX.Element | null {
  if (active && payload && payload.length) {
    const v = Number(payload[0]?.value ?? 0);
    const row = payload[0]?.payload as AgeData | undefined;
    const range = row?.ageRange ?? "";
    const meta = getAgeLabel(range);
    return (
      <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
        <div className="font-medium text-gray-900">
          {range}
          {meta && meta !== range ? ` (${meta})` : ""}
        </div>
        <div className="text-gray-700">
          ผู้ป่วยสะสม : <span className="font-semibold">{TH_NUMBER(v)}</span>{" "}
          ราย
        </div>
      </div>
    );
  }
  return null;
}

export default function GraphPatientsByAge() {
  const { province, start_date, end_date } = useDashboardStore();
  const [data, setData] = useState<AgeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!province) {
      setData([]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const url = `/api/dashBoard/age-group?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
          province
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");
        const json: AgeData[] = text ? JSON.parse(text) : [];
        setData(json ?? []);
      } catch (err) {
        console.error("❌ Fetch error (age-group):", err);
        setData([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [province, start_date, end_date]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...data.map((d) => Number(d.patients ?? 0)))),
    [data]
  );

  const legend = useMemo(() => riskLegendText(), []);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">
        ผู้ป่วยสะสมรายช่วงอายุ ({province || "—"})
      </h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 64, bottom: 16, left: 8 }}
            barCategoryGap="4%"
            barGap={0}
          >
            <XAxis
              type="number"
              tickFormatter={TH_NUMBER}
              domain={[0, xMax]}
              tickMargin={8}
              allowDecimals={false}
            />

            <YAxis
              type="category"
              dataKey="ageRange"
              width={56}
              interval={0}
              tick={{ fontSize: 12, fill: "#6B7280" }}
            />

            <Tooltip content={<AgeTooltip />} />

            <Bar
              dataKey="patients"
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
              fill={RISK_COLORS[3]} // default
              isAnimationActive={false}
            >
              {/* ✅ สีรายแท่งตามความเสี่ยง */}
              {data.map((row, idx) => (
                <Cell key={`cell-${idx}`} fill={colorByRisk(row.patients)} />
              ))}

              <LabelList
                dataKey="patients"
                content={(p: any) => {
                  const v = Number(p.value ?? 0);
                  const xx = Number(p.x ?? 0) + Number(p.width ?? 0) + 8;
                  const yy = Number(p.y ?? 0) + 14;
                  const range = data[p.index]?.ageRange ?? "";
                  const short = getAgeLabel(range);
                  return (
                    <text x={xx} y={yy} fontSize={13} fill="#555">
                      {short} {TH_NUMBER(v)} ราย
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* ✅ เอากล่อง “ระดับความเสี่ยง” มาด้วย */}
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

      {/* ✅ ข้อความอ้างอิง (เหมือนกราฟภูมิภาค) */}
      <p className="mt-2 text-xs text-gray-500">
        อ้างอิงเกณฑ์จาก DDC: สูงมาก {TH_NUMBER(THRESHOLD_VERY_HIGH)}+ ราย, สูง{" "}
        {TH_NUMBER(THRESHOLD_HIGH)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_VERY_HIGH - 1)} ราย, ปานกลาง{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ถึง{" "}
        {TH_NUMBER(THRESHOLD_HIGH - 1)} ราย, ต่ำ น้อยกว่า{" "}
        {TH_NUMBER(THRESHOLD_MEDIUM)} ราย
      </p>
    </div>
  );
}
