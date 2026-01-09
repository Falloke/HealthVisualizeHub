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
  /** API อาจส่งเป็น "1".."7" หรือชื่อไทยเต็ม */
  region?: string | null;
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
  region?: string | null;
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

// ------------------ Region mapping (DB: ref.regions_moph) ------------------

type RegionRow = {
  region_id: number;
  region_name_th: string;
  display_order: number;
};

function compactThai(s: string) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/ฯ/g, "")
    .toLowerCase();
}

function prettyRegion(name: string): string {
  const s = (name || "").trim();
  if (!s) return "";

  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) return "กรุงเทพฯและปริมณฑล";

  return s.replace(/^ภาค\s*/i, "").trim();
}

function resolveRegionName(
  raw: unknown,
  byId: Record<string, string>,
  byKey: Record<string, string>
) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // ตัวเลข => region_id
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return byId[String(n)] || s;

  // ชื่อไทย => key map
  const key = compactThai(s);
  if (byKey[key]) return byKey[key];

  // fallback บางเคส
  if (s.includes("กรุงเทพ") || s.includes("ปริมณฑล")) return byId["7"] || s;

  return s;
}

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

function buildRowsFromMainCompare(
  main?: ProvinceSummary,
  compare?: ProvinceSummary
): Row[] {
  const next: Row[] = [];
  if (main) {
    next.push({
      province: main.province,
      region: main.region ?? undefined,
      value: Number(main.patients ?? 0),
      isMain: true,
    });
  }
  if (compare) {
    next.push({
      province: compare.province,
      region: compare.region ?? undefined,
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
    const main = p.main ?? p.data?.main;
    const compare = p.compare ?? p.data?.compare;

    if (main || compare) return buildRowsFromMainCompare(main, compare);

    const rows = p.rows ?? p.items ?? p.data?.rows ?? p.data?.items;
    if (Array.isArray(rows)) {
      if (
        rows.length &&
        "province" in rows[0] &&
        ("value" in rows[0] || "patients" in rows[0])
      ) {
        return rows.map((r: any) => ({
          province: String(r.province ?? ""),
          region: r.region ?? undefined,
          value: Number(r.value ?? r.patients ?? 0),
          isMain: Boolean(r.isMain),
          isCompare: Boolean(r.isCompare),
        }));
      }
    }
  }
  return null;
}

export default function CompareProvincePatientsChart({
  prefetched,
  parentLoading,
}: Props) {
  const diseaseNameTh = useDashboardStore((s) => s.diseaseNameTh);
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

  // ✅ region mapping from DB
  const [regionById, setRegionById] = useState<Record<string, string>>({});
  const [regionByKey, setRegionByKey] = useState<Record<string, string>>({});
  const regionsLoadedRef = useRef(false);

  useEffect(() => {
    if (regionsLoadedRef.current) return;
    regionsLoadedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/ref/regions-moph", { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลด regions_moph ไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};
        const rows = (json?.rows ?? []) as RegionRow[];

        const byId: Record<string, string> = {};
        const byKey: Record<string, string> = {};

        for (const r of rows) {
          const name = String(r.region_name_th ?? "").trim();
          if (!name) continue;

          byId[String(r.region_id)] = name;
          byKey[compactThai(name)] = name;
          byKey[compactThai(name.replace(/^ภาค\s*/i, ""))] = name;

          if (name.includes("กรุงเทพ") || name.includes("ปริมณฑล")) {
            byKey["กรุงเทพ"] = name;
            byKey["กรุงเทพมหานครและปริมณฑล"] = name;
          }
        }

        setRegionById(byId);
        setRegionByKey(byKey);
      } catch (e) {
        console.error("❌ Load regions_moph error:", e);
        setRegionById({});
        setRegionByKey({});
      }
    })();
  }, []);

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

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...rows.map((r) => Number(r.value ?? 0)))),
    [rows]
  );

  // ✅ ดึงชื่อภูมิภาคจาก DB สำหรับหัวข้อ
  const mainRegionLabel = useMemo(() => {
    const mainRow = rows.find((r) => r.isMain);
    const full = resolveRegionName(mainRow?.region, regionById, regionByKey);
    return full ? prettyRegion(full) : "";
  }, [rows, regionById, regionByKey]);

  const compareRegionLabel = useMemo(() => {
    const compareRow = rows.find((r) => r.isCompare);
    const full = resolveRegionName(compareRow?.region, regionById, regionByKey);
    return full ? prettyRegion(full) : "";
  }, [rows, regionById, regionByKey]);

  const headerLine = useMemo(() => {
    const a = mainProvince || "—";
    const b = compareProvince || "—";

    if (!hasBoth) return `เปรียบเทียบผู้ป่วยสะสมจังหวัด ${a} vs ${b}`;

    // ถ้าได้ชื่อภูมิภาคแล้ว ค่อยแสดง
    if (mainRegionLabel || compareRegionLabel) {
      const left = mainRegionLabel ? `${a} (${mainRegionLabel})` : a;
      const right = compareRegionLabel ? `${b} (${compareRegionLabel})` : b;
      return `เปรียบเทียบผู้ป่วยสะสมจังหวัด ${left} vs ${right}`;
    }

    return `เปรียบเทียบผู้ป่วยสะสมจังหวัด ${a} vs ${b}`;
  }, [hasBoth, mainProvince, compareProvince, mainRegionLabel, compareRegionLabel]);

  return (
    <div className="rounded bg-white p-4 shadow flex flex-col" style={{ height: CARD_H }}>
      <div style={{ minHeight: HEADER_MIN_H }}>
        <h4 className="mb-1 font-bold">{headerLine}</h4>

        {/* (ถ้าอยากโชว์โรค/ช่วงเวลา เปิดได้) */}
        {/* <p className="text-xs text-gray-600">
          โรคที่เลือก: <span className="font-semibold">{diseaseNameTh || "—"}</span> | ช่วงเวลา:{" "}
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

              <Tooltip
                content={<ProvinceCountTooltip seriesName="ผู้ป่วยสะสม" labelKey="province" />}
              />

              <Bar dataKey="value" name="ผู้ป่วยสะสม" radius={[0, 6, 6, 0]} isAnimationActive={false}>
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
