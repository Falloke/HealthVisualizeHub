// D:\HealtRiskHub\app\features\main\comparePage\component\CompareAgeDeathsChart.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

type CacheEntry = {
  at: number;
  data: RowMerged[];
  noDeaths: boolean;
};

const CHART_HEIGHT = 400;
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

const AgeDeathsCompareTooltip = React.memo(function AgeDeathsCompareTooltip({
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
          <span className="font-semibold">{TH_NUMBER(Number(main.value ?? 0))}</span>{" "}
          ราย
        </div>
      )}

      {compare && (
        <div className="text-gray-700">
          {compare.name} :{" "}
          <span className="font-semibold">{TH_NUMBER(Number(compare.value ?? 0))}</span>{" "}
          ราย
        </div>
      )}
    </div>
  );
});

function renderMainLabel(p: any) {
  const v = Number(p.value ?? 0);
  if (!Number.isFinite(v) || v <= 0) return null;
  const xx = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
  const yy = Number(p.y ?? 0) + 12;
  return (
    <text x={xx} y={yy} fontSize={12} fill="#374151">
      {TH_NUMBER(v)} ราย
    </text>
  );
}

function renderCompareLabel(p: any) {
  const v = Number(p.value ?? 0);
  if (!Number.isFinite(v) || v <= 0) return null;
  const xx = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
  const yy = Number(p.y ?? 0) + 12;
  return (
    <text x={xx} y={yy} fontSize={12} fill="#4B5563">
      {TH_NUMBER(v)} ราย
    </text>
  );
}

/** ✅ รองรับ response หลายรูปแบบ */
function normalizeRows(input: unknown): RowMerged[] {
  if (Array.isArray(input)) return input as RowMerged[];
  if (!input || typeof input !== "object") return [];
  const obj: any = input;
  if (obj.ok === false) return [];
  const rows = obj.rows ?? obj.data?.rows ?? obj.items ?? obj.data?.items ?? obj.data ?? null;
  if (Array.isArray(rows)) return rows as RowMerged[];
  return [];
}

function sumDeaths(rows: RowMerged[]) {
  let total = 0;
  for (const r of rows) {
    total += Number(r.mainDeaths ?? 0) + Number(r.compareDeaths ?? 0);
  }
  return total;
}

/** ✅ ดึง disease จาก store แบบปลอดภัย */
function getDiseaseFromStore(): string {
  const s = useDashboardStore() as any;
  return String(s?.diseaseCode ?? s?.disease ?? s?.disease_code ?? "").trim();
}

export default function CompareAgeDeathsChart() {
  const { start_date, end_date } = useDashboardStore();
  const disease = getDiseaseFromStore();

  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<RowMerged[]>([]);
  const [loading, setLoading] = useState(false);
  const [noDeaths, setNoDeaths] = useState(false);
  const [fetchOk, setFetchOk] = useState(false);

  const hasBoth = !!mainProvince && !!compareProvince;
  const hasDisease = !!disease;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth || !hasDisease) return "";

    const sp = new URLSearchParams();
    sp.set("disease", disease);
    sp.set("start_date", start_date || "");
    sp.set("end_date", end_date || "");
    sp.set("mainProvince", mainProvince!);
    sp.set("compareProvince", compareProvince!);

    return `/api/compareInfo/age-group-deaths?${sp.toString()}`;
  }, [hasBoth, hasDisease, disease, start_date, end_date, mainProvince, compareProvince]);

  useEffect(() => {
    if (!hasBoth || !hasDisease || !requestUrl) {
      setRows([]);
      setLoading(false);
      setNoDeaths(false);
      setFetchOk(false);
      return;
    }

    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setRows(cached.data);
      setNoDeaths(cached.noDeaths);
      setFetchOk(true);
      return;
    }

    if (inFlightRef.current.has(requestUrl)) return;

    const ac = new AbortController();
    inFlightRef.current.set(requestUrl, ac);

    (async () => {
      try {
        setLoading(true);
        setFetchOk(false);
        setNoDeaths(false);

        const res = await fetch(requestUrl, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) {
          throw new Error(text || "โหลดข้อมูลเปรียบเทียบผู้เสียชีวิตตามช่วงอายุไม่สำเร็จ");
        }

        let json: unknown = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = {};
        }

        const data = normalizeRows(json);
        const total = sumDeaths(data);
        const nd = total === 0;

        cacheRef.current.set(requestUrl, { at: Date.now(), data, noDeaths: nd });
        setRows(data);
        setNoDeaths(nd);
        setFetchOk(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("❌ Fetch error (compare age deaths):", err);
        setRows([]);
        setNoDeaths(false);
        setFetchOk(false);
      } finally {
        inFlightRef.current.delete(requestUrl);
        setLoading(false);
      }
    })();

    return () => {
      ac.abort();
      inFlightRef.current.delete(requestUrl);
    };
  }, [hasBoth, hasDisease, requestUrl]);

  const xMax = useMemo(() => {
    let m = 0;
    for (const d of rows) {
      const a = Number(d.mainDeaths ?? 0);
      const b = Number(d.compareDeaths ?? 0);
      if (Number.isFinite(a)) m = Math.max(m, a);
      if (Number.isFinite(b)) m = Math.max(m, b);
    }
    return niceMax(m);
  }, [rows]);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">
        เปรียบเทียบผู้เสียชีวิตสะสมรายช่วงอายุ{" "}
        {hasBoth ? `(${mainProvince} vs ${compareProvince})` : "(เลือกระบุจังหวัดให้ครบ)"}
      </h4>

      {!hasBoth ? (
        <p className="mt-4 text-sm text-gray-500">
          (เลือกจังหวัดให้ครบ 2 จังหวัดจาก Sidebar ก่อน แล้วกราฟเปรียบเทียบจะปรากฏ)
        </p>
      ) : !hasDisease ? (
        <p className="mt-4 text-sm text-gray-500">(กรุณาเลือกโรคก่อน)</p>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/60 text-sm text-gray-700">
              ⏳ กำลังโหลด...
            </div>
          )}

          {!loading && fetchOk && noDeaths ? (
            <p className="text-sm font-medium text-gray-700">ไม่มีผู้เสียชีวิตในช่วงเวลานี้</p>
          ) : !loading && rows.length === 0 ? (
            <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
          ) : (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
                {!noDeaths && <Legend wrapperStyle={{ fontSize: 12 }} />}

                <Bar
                  dataKey="mainDeaths"
                  name={mainProvince ?? "จังหวัดหลัก"}
                  fill="#6D7378"
                  barSize={22}
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="mainDeaths" content={renderMainLabel} />
                </Bar>

                <Bar
                  dataKey="compareDeaths"
                  name={compareProvince ?? "จังหวัดเปรียบเทียบ"}
                  fill="#A0A4A8"
                  barSize={22}
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="compareDeaths" content={renderCompareLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
