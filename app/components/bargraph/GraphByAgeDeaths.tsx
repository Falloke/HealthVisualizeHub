"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

import { useDashboardStore } from "@/store/useDashboardStore";
import { TH_NUMBER, niceMax } from "@/app/components/bargraph/GraphUtils";

type AgeRow = { ageRange: string; deaths: number };

// ✅ FIX: สร้าง type Tooltip เอง (กัน type ของ recharts แต่ละเวอร์ชัน)
type AnyTooltipPayloadItem = {
  value?: number | string;
  payload?: any;
};

type AgeDeathsTooltipProps = {
  active?: boolean;
  payload?: AnyTooltipPayloadItem[];
};

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

// ✅ FIX: ห้ามใช้ JSX.Element ใน return type → ใช้ ReactElement แทน
function AgeDeathsTooltip({
  active,
  payload,
}: AgeDeathsTooltipProps): ReactElement | null {
  if (active && payload && payload.length) {
    const v = Number(payload[0]?.value ?? 0);
    const row = payload[0]?.payload as AgeRow | undefined;
    const range = row?.ageRange ?? "";
    const meta = getAgeLabel(range, "full");

    return (
      <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
        <div className="font-medium text-gray-900">
          {range}
          {meta && meta !== range ? ` (${meta})` : ""}
        </div>
        <div className="text-gray-700">
          ผู้เสียชีวิตสะสม :{" "}
          <span className="font-semibold">{TH_NUMBER(v)}</span> ราย
        </div>
      </div>
    );
  }
  return null;
}

export default function GraphByAgeDeaths() {
  const { province, start_date, end_date, disease } = useDashboardStore() as any;
  const [data, setData] = useState<AgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const provinceLabel = (province || "").trim();
  const diseaseCode = (disease || "").trim();

  useEffect(() => {
    if (!provinceLabel || !diseaseCode) {
      setData([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const url =
          `/api/dashBoard/age-group-deaths` +
          `?start_date=${encodeURIComponent(start_date)}` +
          `&end_date=${encodeURIComponent(end_date)}` +
          `&province=${encodeURIComponent(provinceLabel)}` +
          `&disease=${encodeURIComponent(diseaseCode)}`;

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json: AgeRow[] = text ? JSON.parse(text) : [];
        if (!cancelled) setData(json ?? []);
      } catch (err) {
        console.error("❌ Fetch error (age-group-deaths):", err);
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provinceLabel, diseaseCode, start_date, end_date]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...data.map((d) => Number(d.deaths ?? 0)))),
    [data]
  );

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">
        ผู้เสียชีวิตสะสมรายช่วงอายุ ({provinceLabel || "—"})
      </h4>

      {!diseaseCode ? (
        <p className="text-sm text-gray-600">⚠️ กรุณาเลือกโรคก่อน</p>
      ) : loading ? (
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
              width={36}
              interval={0}
              tick={{ fontSize: 12, fill: "#6B7280" }}
            />

            {/* ✅ ใช้ Tooltip custom แบบไม่ผูกกับ types ของ recharts */}
            <Tooltip content={<AgeDeathsTooltip />} />

            <Bar
              dataKey="deaths"
              fill="#6D7378"
              name="ผู้เสียชีวิตสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="deaths"
                content={(p: any) => {
                  const v = Number(p.value ?? 0);
                  const xx = Number(p.x ?? 0) + Number(p.width ?? 0) + 8;
                  const yy = Number(p.y ?? 0) + 14;
                  const range = data[p.index]?.ageRange ?? "";
                  const short = getAgeLabel(range, "short");
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
    </div>
  );
}
