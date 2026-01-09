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
  Cell,
} from "recharts";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";
import {
  TH_NUMBER,
  niceMax,
  ValueLabelRight,
  ProvinceCountTooltip,
} from "@/app/components/bargraph/GraphUtils";

type APIResp = {
  ok?: boolean;
  main?: { province: string; deaths: number };
  compare?: { province: string; deaths: number };
  data?: {
    main?: { province: string; deaths: number };
    compare?: { province: string; deaths: number };
  };
  error?: string;
};

type Row = {
  province: string;
  value: number;
  isMain?: boolean;
  isCompare?: boolean;
};

type Props = {
  prefetched?: unknown;
  parentLoading?: boolean;
};

type CacheEntry = { at: number; data: Row[] };
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

const CARD_H = 360;
const HEADER_MIN_H = 72;

const BAR_SIZE = 22;
const Y_AXIS_WIDTH = 90;
const CHART_MARGIN = { top: 8, right: 24, bottom: 8, left: 32 };

function safeJson<T>(text: string, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function extractMainCompare(json: APIResp) {
  return {
    main: json.main ?? json.data?.main,
    compare: json.compare ?? json.data?.compare,
  };
}

function buildRows(
  main?: { province: string; deaths: number },
  compare?: { province: string; deaths: number }
): Row[] {
  const next: Row[] = [];
  if (main)
    next.push({
      province: main.province,
      value: Number(main.deaths ?? 0),
      isMain: true,
    });
  if (compare)
    next.push({
      province: compare.province,
      value: Number(compare.deaths ?? 0),
      isCompare: true,
    });
  return next;
}

function parsePrefetched(prefetched: unknown): Row[] | null {
  if (!prefetched) return null;

  if (typeof prefetched === "object") {
    const p = prefetched as any;
    const main = p.main ?? p.data?.main;
    const compare = p.compare ?? p.data?.compare;

    if (main || compare) return buildRows(main, compare);

    const rows = p.rows ?? p.items ?? p.data?.rows ?? p.data?.items;
    if (Array.isArray(rows)) {
      return rows.map((r: any) => ({
        province: String(r.province ?? ""),
        value: Number(r.value ?? r.deaths ?? 0),
        isMain: Boolean(r.isMain),
        isCompare: Boolean(r.isCompare),
      }));
    }
  }
  return null;
}

export default function CompareProvinceDeathsChart({
  prefetched,
  parentLoading,
}: Props) {
  const diseaseCode = useDashboardStore((s) => s.diseaseCode); // ✅ เพิ่ม
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);

  const mainProvince = useCompareStore((s) => s.mainProvince);
  const compareProvince = useCompareStore((s) => s.compareProvince);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBoth = !!mainProvince && !!compareProvince;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth) return "";
    const qs = new URLSearchParams({
      disease: diseaseCode || "", // ✅ ส่งโรคไปด้วย
      start_date: start_date || "",
      end_date: end_date || "",
      mainProvince: mainProvince!,
      compareProvince: compareProvince!,
    }).toString();
    return `/api/compareInfo/province-deaths?${qs}`;
  }, [hasBoth, diseaseCode, start_date, end_date, mainProvince, compareProvince]);

  useEffect(() => {
    const parsed = parsePrefetched(prefetched);
    if (parsed) {
      setRows(parsed);
      setError(null);
    }
  }, [prefetched]);

  useEffect(() => {
    if (!hasBoth || !requestUrl) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setRows(cached.data);
      setError(null);
      return;
    }

    if (inFlightRef.current.has(requestUrl)) return;

    const ac = new AbortController();
    inFlightRef.current.set(requestUrl, ac);

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(requestUrl, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text().catch(() => "");
        if (!res.ok)
          throw new Error(text || "โหลดข้อมูลเปรียบเทียบผู้เสียชีวิตสะสมไม่สำเร็จ");

        const json = safeJson<APIResp>(text, {});
        if (json.ok === false)
          throw new Error(json.error || "ไม่สามารถโหลดข้อมูลได้");

        const { main, compare } = extractMainCompare(json);
        const next = buildRows(main, compare);

        cacheRef.current.set(requestUrl, { at: Date.now(), data: next });
        setRows(next);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compare province deaths):", err);
        setRows([]);
        setError(err?.message || "ไม่สามารถโหลดข้อมูลได้");
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

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...rows.map((r) => Number(r.value ?? 0)))),
    [rows]
  );

  return (
    <div className="rounded bg-white p-4 shadow flex flex-col" style={{ height: CARD_H }}>
      <div style={{ minHeight: HEADER_MIN_H }}>
        <h4 className="mb-1 font-bold">
          ผู้เสียชีวิตสะสมจังหวัด {mainProvince || "—"} vs {compareProvince || "—"}
        </h4>
      </div>

      <div className="relative flex-1 min-h-0">
        {!hasBoth ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            กรุณาเลือกจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ก่อน
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-600">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            {loading ? "⏳ กำลังโหลด..." : "ไม่พบข้อมูลสำหรับการเปรียบเทียบ"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={CHART_MARGIN} barSize={BAR_SIZE}>
              <XAxis
                type="number"
                tickFormatter={TH_NUMBER}
                domain={[0, xMax]}
                tickMargin={8}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="province"
                width={Y_AXIS_WIDTH}
                interval={0}
                tick={{ fontSize: 13 }}
              />

              <Tooltip
                content={
                  <ProvinceCountTooltip seriesName="ผู้เสียชีวิตสะสม" labelKey="province" />
                }
              />

              <Bar
                dataKey="value"
                name="ผู้เสียชีวิตสะสม"
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
              >
                <LabelList dataKey="value" content={<ValueLabelRight />} />
                {rows.map((r, idx) => (
                  <Cell key={idx} fill={r.isMain ? "#4B5563" : "#8594A1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {(parentLoading || (loading && rows.length > 0)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40 text-sm text-gray-700">
            ⏳ กำลังอัปเดต...
          </div>
        )}
      </div>
    </div>
  );
}
