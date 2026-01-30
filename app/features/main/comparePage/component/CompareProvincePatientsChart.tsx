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

type ProvinceSummary = {
  province: string;
  patients: number;
};

type APIResp = {
  ok?: boolean;
  main?: ProvinceSummary;
  compare?: ProvinceSummary;
  data?: { main?: ProvinceSummary; compare?: ProvinceSummary };
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
const Y_AXIS_WIDTH = 120;
const CHART_MARGIN = { top: 8, right: 24, bottom: 8, left: 32 };

// ------------------ Utils ------------------

function safeJson<T>(text: string, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function extractMainCompare(json: APIResp): {
  main?: ProvinceSummary;
  compare?: ProvinceSummary;
} {
  return {
    main: json.main ?? json.data?.main,
    compare: json.compare ?? json.data?.compare,
  };
}

function buildRowsFromMainCompare(main?: ProvinceSummary, compare?: ProvinceSummary): Row[] {
  const next: Row[] = [];

  if (main?.province) {
    next.push({
      province: String(main.province),
      value: Number(main.patients ?? 0),
      isMain: true,
    });
  }

  if (compare?.province) {
    next.push({
      province: String(compare.province),
      value: Number(compare.patients ?? 0),
      isCompare: true,
    });
  }

  return next;
}

function parsePrefetched(prefetched: unknown): Row[] | null {
  if (!prefetched) return null;

  if (typeof prefetched === "object") {
    const p = prefetched as any;

    // payload ตรง ๆ (main/compare)
    const main = p.main ?? p.data?.main;
    const compare = p.compare ?? p.data?.compare;
    if (main || compare) return buildRowsFromMainCompare(main, compare);

    // payload เป็น rows/items ก็ได้
    const rows = p.rows ?? p.items ?? p.data?.rows ?? p.data?.items;
    if (Array.isArray(rows)) {
      if (rows.length && "province" in rows[0] && ("value" in rows[0] || "patients" in rows[0])) {
        return rows.map((r: any) => ({
          province: String(r.province ?? ""),
          value: Number(r.value ?? r.patients ?? 0),
          isMain: Boolean(r.isMain),
          isCompare: Boolean(r.isCompare),
        }));
      }
    }
  }

  return null;
}

export default function CompareProvincePatientsChart({ prefetched, parentLoading }: Props) {
  const diseaseCode = useDashboardStore((s) => s.diseaseCode);
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
      disease: diseaseCode || "",
      start_date: start_date || "",
      end_date: end_date || "",
      mainProvince: mainProvince!,
      compareProvince: compareProvince!,
    }).toString();

    return `/api/compareInfo/province-patients?${qs}`;
  }, [hasBoth, diseaseCode, start_date, end_date, mainProvince, compareProvince]);

  // ✅ prefetched ก่อน
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

    // ✅ กันยิงซ้ำ
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
        if (!res.ok) throw new Error(text || "โหลดข้อมูลเปรียบเทียบผู้ป่วยสะสมไม่สำเร็จ");

        const json = safeJson<APIResp>(text, {});
        if (json.ok === false) throw new Error(json.error || "ไม่สามารถโหลดข้อมูลได้");

        const { main, compare } = extractMainCompare(json);
        const next = buildRowsFromMainCompare(main, compare);

        cacheRef.current.set(requestUrl, { at: Date.now(), data: next });
        setRows(next);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compare province patients):", err);
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

  const xMax = useMemo(() => {
    const m = Math.max(0, ...rows.map((r) => Number(r.value ?? 0)));
    return niceMax(m);
  }, [rows]);

  const headerLine = useMemo(() => {
    const a = mainProvince || "—";
    const b = compareProvince || "—";
    return `เปรียบเทียบผู้ป่วยสะสมจังหวัด ${a} และ ${b}`;
  }, [mainProvince, compareProvince]);

  return (
    <div className="flex flex-col rounded bg-white p-4 shadow" style={{ height: CARD_H }}>
      <div style={{ minHeight: HEADER_MIN_H }}>
        <h4 className="mb-1 font-bold">{headerLine}</h4>

        {/* ถ้าอยากโชว์ช่วงเวลา/โรค เปิดได้ */}
        {/* <p className="text-xs text-gray-600">
          disease: <span className="font-semibold">{diseaseCode || "—"}</span> |{" "}
          <span className="font-semibold">{start_date || "—"} – {end_date || "—"}</span>
        </p> */}
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

              <Tooltip content={<ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />} />

              <Bar
                dataKey="value"
                name="ผู้ป่วยสะสม"
                radius={[0, 6, 6, 0]}
                isAnimationActive={false}
              >
                <LabelList dataKey="value" content={<ValueLabelRight />} />
                {rows.map((r, idx) => (
                  <Cell key={idx} fill={r.isMain ? "#2185D5" : "#6CB3EA"} />
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
