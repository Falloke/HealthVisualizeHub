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
  Legend,
} from "recharts";
import type { TooltipProps } from "recharts";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";
import { TH_NUMBER, niceMax } from "@/app/components/bargraph/GraphUtils";

type RowMerged = {
  ageRange: string;
  mainDeaths: number;
  compareDeaths: number;
};

function AgeDeathsCompareTooltip({
  active,
  payload,
}: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as RowMerged | undefined;
  if (!row) return null;

  const main = payload.find((p) => p.dataKey === "mainDeaths");
  const compare = payload.find((p) => p.dataKey === "compareDeaths");

  return (
    <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
      <div className="font-medium text-gray-900">{row.ageRange}</div>
      {main && (
        <div className="text-gray-700">
          {main.name} :{" "}
          <span className="font-semibold">
            {TH_NUMBER(Number(main.value ?? 0))}
          </span>{" "}
          ราย
        </div>
      )}
      {compare && (
        <div className="text-gray-700">
          {compare.name} :{" "}
          <span className="font-semibold">
            {TH_NUMBER(Number(compare.value ?? 0))}
          </span>{" "}
          ราย
        </div>
      )}
    </div>
  );
}

export default function CompareAgeDeathsChart() {
  const { start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<RowMerged[]>([]);
  const [loading, setLoading] = useState(false);

  const hasBoth = !!mainProvince && !!compareProvince;

  useEffect(() => {
    if (!hasBoth) {
      setRows([]);
      return;
    }

    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setRows([]);

        const url = `/api/compareInfo/age-group-deaths?start_date=${start_date}&end_date=${end_date}&mainProvince=${encodeURIComponent(
          mainProvince!
        )}&compareProvince=${encodeURIComponent(compareProvince!)}`;

        const res = await fetch(url, {
          cache: "no-store",
          signal: ac.signal,
        });

        const text = await res.text();
        if (!res.ok) {
          throw new Error(
            text || "โหลดข้อมูลเปรียบเทียบผู้เสียชีวิตตามช่วงอายุไม่สำเร็จ"
          );
        }

        const json: RowMerged[] = text ? JSON.parse(text) : [];
        setRows(Array.isArray(json) ? json : []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("❌ Fetch error (compare age deaths):", err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [hasBoth, start_date, end_date, mainProvince, compareProvince]);

  const xMax = useMemo(
    () =>
      niceMax(
        Math.max(
          0,
          ...rows.map((d) =>
            Math.max(Number(d.mainDeaths ?? 0), Number(d.compareDeaths ?? 0))
          )
        )
      ),
    [rows]
  );

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">
        เปรียบเทียบผู้เสียชีวิตสะสมรายช่วงอายุ{" "}
        {hasBoth
          ? `(${mainProvince} vs ${compareProvince})`
          : "(เลือกระบุจังหวัดหลักและจังหวัดเปรียบเทียบให้ครบ)"}
      </h4>

      {!hasBoth ? (
        <p className="mt-4 text-sm text-gray-500">
          (เลือกจังหวัดให้ครบ 2 จังหวัดจาก Sidebar ก่อน แล้วกราฟเปรียบเทียบจะปรากฏ)
        </p>
      ) : loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 64, bottom: 16, left: 40 }}
            barCategoryGap="8%"
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
            <Tooltip content={<AgeDeathsCompareTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            <Bar
              dataKey="mainDeaths"
              name={mainProvince ?? "จังหวัดหลัก"}
              fill="#6D7378"
              barSize={22}
              radius={[0, 6, 6, 0]}
            >
              <LabelList
                dataKey="mainDeaths"
                content={(p: any) => {
                  const v = Number(p.value ?? 0);
                  if (!isFinite(v) || v <= 0) return null;
                  const xx = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                  const yy = Number(p.y ?? 0) + 12;
                  return (
                    <text x={xx} y={yy} fontSize={12} fill="#374151">
                      {TH_NUMBER(v)} ราย
                    </text>
                  );
                }}
              />
            </Bar>

            <Bar
              dataKey="compareDeaths"
              name={compareProvince ?? "จังหวัดเปรียบเทียบ"}
              fill="#A0A4A8"
              barSize={22}
              radius={[0, 6, 6, 0]}
            >
              <LabelList
                dataKey="compareDeaths"
                content={(p: any) => {
                  const v = Number(p.value ?? 0);
                  if (!isFinite(v) || v <= 0) return null;
                  const xx = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                  const yy = Number(p.y ?? 0) + 12;
                  return (
                    <text x={xx} y={yy} fontSize={12} fill="#4B5563">
                      {TH_NUMBER(v)} ราย
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
