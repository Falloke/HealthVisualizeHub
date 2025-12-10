// app/features/main/comparePage/component/CompareGenderDeathsChart.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
  Cell,
} from "recharts";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";
import { TH_NUMBER, niceMax } from "@/app/components/bargraph/GraphUtils";

type GenderSummary = {
  province: string;
  male: number;
  female: number;
  unknown: number;
};

type APIResp = {
  ok?: boolean;
  main?: GenderSummary;
  compare?: GenderSummary;
  error?: string;
};

type Row = {
  label: string; // ใช้บนแกน Y เช่น "กรุงเทพมหานคร • ชาย"
  province: string;
  gender: "male" | "female" | "unknown";
  provinceType: "main" | "compare";
  value: number;
};

// สี: จังหวัดหลัก = โทนเข้ม, จังหวัดเปรียบเทียบ = โทนอ่อน
const MAIN_MALE = "#0EA5E9";
const MAIN_FEMALE = "#EC4899";
const MAIN_UNKNOWN = "#9CA3AF";

const COMPARE_MALE = "#7DD3FC";
const COMPARE_FEMALE = "#F9A8D4";
const COMPARE_UNKNOWN = "#D1D5DB";

function colorForRow(r: Row): string {
  if (r.gender === "male") {
    return r.provinceType === "main" ? MAIN_MALE : COMPARE_MALE;
  }
  if (r.gender === "female") {
    return r.provinceType === "main" ? MAIN_FEMALE : COMPARE_FEMALE;
  }
  // unknown
  return r.provinceType === "main" ? MAIN_UNKNOWN : COMPARE_UNKNOWN;
}

function genderLabel(g: Row["gender"]): string {
  if (g === "male") return "ชาย";
  if (g === "female") return "หญิง";
  return "ไม่ระบุ";
}

function CombinedGenderDeathsTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as Row;
  const gText = genderLabel(row.gender);
  const typeText =
    row.provinceType === "main" ? "จังหวัดหลัก" : "จังหวัดที่เปรียบเทียบ";

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-gray-200">
      <div className="mb-1 text-base font-bold text-gray-900">
        {row.province}
      </div>
      <div className="text-sm text-gray-800">
        {gText} ({typeText}) :{" "}
        <span className="font-extrabold">{TH_NUMBER(row.value)}</span> ราย
      </div>
    </div>
  );
}

export default function CompareGenderDeathsChart() {
  const { start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // ต้องเลือกครบ 2 จังหวัดก่อนถึงจะให้ดูกราฟ
  const hasBoth = !!mainProvince && !!compareProvince;

  useEffect(() => {
    if (!hasBoth) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const qs = new URLSearchParams({
          start_date: start_date || "",
          end_date: end_date || "",
          mainProvince: mainProvince!,
          compareProvince: compareProvince!,
        });

        const res = await fetch(
          `/api/compareInfo/gender-deaths?${qs.toString()}`,
          { cache: "no-store" }
        );

        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลเปรียบเทียบเพศไม่สำเร็จ");

        const json: APIResp = text ? JSON.parse(text) : {};
        if (cancelled) return;

        const result: Row[] = [];
        const main = json.main;
        const compare = json.compare;

        if (main) {
          if (main.male > 0) {
            result.push({
              label: `${main.province} • ชาย`,
              province: main.province,
              gender: "male",
              provinceType: "main",
              value: main.male,
            });
          }
          if (main.female > 0) {
            result.push({
              label: `${main.province} • หญิง`,
              province: main.province,
              gender: "female",
              provinceType: "main",
              value: main.female,
            });
          }
          if (main.unknown > 0) {
            result.push({
              label: `${main.province} • ไม่ระบุ`,
              province: main.province,
              gender: "unknown",
              provinceType: "main",
              value: main.unknown,
            });
          }
        }

        if (compare) {
          if (compare.male > 0) {
            result.push({
              label: `${compare.province} • ชาย`,
              province: compare.province,
              gender: "male",
              provinceType: "compare",
              value: compare.male,
            });
          }
          if (compare.female > 0) {
            result.push({
              label: `${compare.province} • หญิง`,
              province: compare.province,
              gender: "female",
              provinceType: "compare",
              value: compare.female,
            });
          }
          if (compare.unknown > 0) {
            result.push({
              label: `${compare.province} • ไม่ระบุ`,
              province: compare.province,
              gender: "unknown",
              provinceType: "compare",
              value: compare.unknown,
            });
          }
        }

        if (!cancelled) setRows(result);
      } catch (err) {
        console.error("❌ Fetch error (compare gender-deaths):", err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasBoth, mainProvince, compareProvince, start_date, end_date]);

  const xMax = useMemo(() => {
    const maxVal = Math.max(0, ...rows.map((r) => Number(r.value ?? 0)));
    return niceMax(maxVal);
  }, [rows]);

  const rightMargin = useMemo(() => {
    const text = `${TH_NUMBER(xMax)} ราย`;
    return Math.min(140, Math.max(40, Math.floor(text.length * 7.5) + 16));
  }, [xMax]);

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar
        ให้ครบก่อน เพื่อดูกราฟเปรียบเทียบผู้เสียชีวิตสะสมแยกตามเพศ)
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      <h3 className="mb-1 text-lg font-bold">
        เปรียบเทียบผู้เสียชีวิตสะสมแยกตามเพศ
      </h3>
      <p className="mb-3 text-xs text-gray-600">
        ช่วงเวลา: {start_date || "—"} – {end_date || "—"} | จังหวัดหลัก:{" "}
        <span className="font-semibold">{mainProvince}</span> | จังหวัดเปรียบเทียบ:{" "}
        <span className="font-semibold">{compareProvince}</span>
      </p>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: rightMargin, bottom: 24, left: 8 }}
              barCategoryGap="18%"
              barGap={4}
            >
              <XAxis
                type="number"
                tickFormatter={TH_NUMBER}
                allowDecimals={false}
                domain={[0, xMax]}
                tickMargin={8}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={180}
                tick={{ fontSize: 12 }}
              />

              <Tooltip
                content={<CombinedGenderDeathsTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                wrapperStyle={{ zIndex: 10 }}
                offset={12}
              />

              <Bar dataKey="value" barSize={14} radius={[4, 4, 4, 4]}>
                <LabelList
                  dataKey="value"
                  position="right"
                  content={(p: any) => {
                    const val = Number(p.value ?? 0);
                    const x = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                    const y =
                      Number(p.y ?? 0) + Number(p.height ?? 0) / 2 + 4;
                    return (
                      <text x={x} y={y} fontSize={12} fill="#374151">
                        {TH_NUMBER(val)} ราย
                      </text>
                    );
                  }}
                />
                {rows.map((r, idx) => (
                  <Cell key={idx} fill={colorForRow(r)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend แยกสี */}
          <div className="mt-3 text-xs text-gray-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: MAIN_MALE }}
                />
                ชาย – จังหวัดหลัก
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: COMPARE_MALE }}
                />
                ชาย – จังหวัดเปรียบเทียบ
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: MAIN_FEMALE }}
                />
                หญิง – จังหวัดหลัก
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: COMPARE_FEMALE }}
                />
                หญิง – จังหวัดเปรียบเทียบ
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: MAIN_UNKNOWN }}
                />
                ไม่ระบุ – จังหวัดหลัก
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: COMPARE_UNKNOWN }}
                />
                ไม่ระบุ – จังหวัดเปรียบเทียบ
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
