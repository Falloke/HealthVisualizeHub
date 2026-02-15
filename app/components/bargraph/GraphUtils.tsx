"use client";

import React from "react";
import type { LabelProps, TooltipProps } from "recharts";

/** แปลงตัวเลขแบบไทย */
export const TH_NUMBER = (n: number) =>
  Number(n).toLocaleString("th-TH", { maximumFractionDigits: 0 });

/** ปัดปลายแกนแบบ 1–2–5 ให้สเกล X พอดีกับข้อมูล */
export function niceMax(n: number) {
  if (!n || n <= 0) return 1;
  const x = Math.ceil(n * 1.1); // เผื่อ 10%
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const m = x / base;
  const k = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return k * base;
}

/** Tick แนวตั้งสำหรับชื่อจังหวัดบนแกน Y */
export function VerticalProvinceTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  return (
    <g transform={`translate(${x ?? 0}, ${y ?? 0})`}>
      <text
        x={-8}
        y={4}
        fontSize={12}
        fill="#374151"
        textAnchor="end"
        transform="rotate(-90)"
      >
        {payload?.value}
      </text>
    </g>
  );
}

/** Label ปลายแท่งด้านขวา + หน่วย “ราย” (ใช้ร่วมกัน) */
export function ValueLabelRight(props: LabelProps) {
  const { x, y, width, value } = props as any;
  if (typeof value !== "number") return null;
  const textX = (x ?? 0) + (width ?? 0) + 8;
  const textY = (y ?? 0) + 14;
  return (
    <text x={textX} y={textY} fontSize={14} fill="#555">
      {TH_NUMBER(value)} ราย
    </text>
  );
}

/** Tooltip เรียบง่าย: “จำนวน : xx ราย” */
export function CountTooltip({
  active,
  payload,
}: TooltipProps<number, string>): JSX.Element | null {
  if (active && payload && payload.length) {
    const v = Number(payload[0]?.value ?? 0);
    return (
      <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
        <div className="text-gray-700">
          จำนวน : <span className="font-semibold">{TH_NUMBER(v)}</span> ราย
        </div>
      </div>
    );
  }
  return null;
}

/** Tooltip สวยขึ้น: แสดง “จังหวัด + ชื่อซีรีส์ + จำนวน(ราย)” */
export function ProvinceCountTooltip({
  active,
  payload,
  seriesName = "จำนวน",
  labelKey = "label", // ชื่อ key ที่เก็บชื่อจังหวัดใน data
  unit = "ราย",
}: TooltipProps<number, string> & {
  seriesName?: string;
  labelKey?: string;
  unit?: string;
}): JSX.Element | null {
  if (active && payload && payload.length) {
    const v = Number(payload[0]?.value ?? 0);
    const row = payload[0]?.payload as any;
    const province = row?.[labelKey] ?? row?.province ?? "";
    return (
      <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
        <div className="font-medium text-gray-900">{province}</div>
        <div className="text-gray-700">
          {seriesName} : <span className="font-semibold">{TH_NUMBER(v)}</span>{" "}
          {unit}
        </div>
      </div>
    );
  }
  return null;
}
