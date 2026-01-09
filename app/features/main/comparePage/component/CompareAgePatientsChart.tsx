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
  mainPatients: number;
  comparePatients: number;
};

type CacheEntry = {
  at: number;
  data: RowMerged[];
  noPatients: boolean;
};

const CHART_HEIGHT = 400;
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

const AgeCompareTooltip = React.memo(function AgeCompareTooltip({
  active,
  payload,
}: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as RowMerged | undefined;
  if (!row) return null;

  const main = payload.find((p) => p.dataKey === "mainPatients");
  const compare = payload.find((p) => p.dataKey === "comparePatients");

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
          <span className="font-semibold">
            {TH_NUMBER(Number(compare.value ?? 0))}
          </span>{" "}
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

function normalizeRows(input: unknown): RowMerged[] {
  if (Array.isArray(input)) return input as RowMerged[];
  if (!input || typeof input !== "object") return [];
  const obj: any = input;
  if (obj.ok === false) return [];
  const rows =
    obj.rows ?? obj.data?.rows ?? obj.items ?? obj.data?.items ?? obj.data ?? null;
  if (Array.isArray(rows)) return rows as RowMerged[];
  return [];
}

function sumPatients(rows: RowMerged[]) {
  let total = 0;
  for (const r of rows) {
    total += Number(r.mainPatients ?? 0) + Number(r.comparePatients ?? 0);
  }
  return total;
}

export default function CompareAgePatientsChart() {
  const { start_date, end_date, diseaseCode } = useDashboardStore(); // ✅ เพิ่ม diseaseCode
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<RowMerged[]>([]);
  const [loading, setLoading] = useState(false);
  const [noPatients, setNoPatients] = useState(false);
  const [fetchOk, setFetchOk] = useState(false);

  const hasBoth = !!mainProvince && !!compareProvince;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth) return "";

    const sp = new URLSearchParams();
    sp.set("disease", diseaseCode || ""); // ✅ ส่งโรคไปด้วย
    sp.set("start_date", start_date || "");
    sp.set("end_date", end_date || "");
    sp.set("mainProvince", mainProvince!);
    sp.set("compareProvince", compareProvince!);

    return `/api/compareInfo/age-group?${sp.toString()}`;
  }, [hasBoth, diseaseCode, start_date, end_date, mainProvince, compareProvince]);

  useEffect(() => {
    if (!hasBoth || !requestUrl) {
      setRows([]);
      setLoading(false);
      setNoPatients(false);
      setFetchOk(false);
      return;
    }

    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setRows(cached.data);
      setNoPatients(cached.noPatients);
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
        setNoPatients(false);

        const res = await fetch(requestUrl, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text().catch(() => "");
        if (!res.ok)
          throw new Error(text || "โหลดข้อมูลเปรียบเทียบผู้ป่วยตามช่วงอายุไม่สำเร็จ");

        let json: unknown = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = {};
        }

        const data = normalizeRows(json);
        const total = sumPatients(data);
        const np = total === 0;

        cacheRef.current.set(requestUrl, { at: Date.now(), data, noPatients: np });
        setRows(data);
        setNoPatients(np);
        setFetchOk(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("❌ Fetch error (compare age patients):", err);
        setRows([]);
        setNoPatients(false);
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
  }, [hasBoth, requestUrl]);

  const xMax = useMemo(() => {
    let m = 0;
    for (const d of rows) {
      const a = Number(d.mainPatients ?? 0);
      const b = Number(d.comparePatients ?? 0);
      if (Number.isFinite(a)) m = Math.max(m, a);
      if (Number.isFinite(b)) m = Math.max(m, b);
    }
    return niceMax(m);
  }, [rows]);

  const title = useMemo(() => {
    if (!hasBoth) {
      return "เปรียบเทียบผู้ป่วยสะสมรายช่วงอายุ (เลือกจังหวัดหลักและจังหวัดเปรียบเทียบให้ครบ)";
    }
    return `เปรียบเทียบผู้ป่วยสะสมรายช่วงอายุ (${mainProvince} vs ${compareProvince})`;
  }, [hasBoth, mainProvince, compareProvince]);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h2 className="mb-2 text-base font-bold">{title}</h2>

      {!hasBoth ? (
        <p className="mt-4 text-sm text-gray-500">
          (เลือกจังหวัดให้ครบ 2 จังหวัดจาก Sidebar ก่อน แล้วกราฟเปรียบเทียบจะปรากฏ)
        </p>
      ) : (
        <div className="relative" aria-busy={loading} aria-live="polite">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/60 text-sm text-gray-700">
              ⏳ กำลังโหลด...
            </div>
          )}

          {!loading && fetchOk && noPatients ? (
            <p className="text-sm font-medium text-gray-700">
              ไม่มีผู้ป่วยในช่วงเวลานี้
            </p>
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
                <Tooltip content={<AgeCompareTooltip />} />

                {/* ✅ ซ่อน Legend ถ้าไม่มีผู้ป่วย */}
                {!noPatients && <Legend wrapperStyle={{ fontSize: 12 }} />}

                <Bar
                  dataKey="mainPatients"
                  name={mainProvince ?? "จังหวัดหลัก"}
                  fill="#004680"
                  barSize={22}
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="mainPatients" content={renderMainLabel} />
                </Bar>

                <Bar
                  dataKey="comparePatients"
                  name={compareProvince ?? "จังหวัดเปรียบเทียบ"}
                  fill="#FF4081"
                  barSize={22}
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="comparePatients" content={renderCompareLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
