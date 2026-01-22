"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";
import { TH_NUMBER } from "@/app/components/bargraph/GraphUtils";

type CombinedRow = {
  month: string; // "YYYY-MM"
  month_th?: string;
  male_main?: number;
  female_main?: number;
  male_compare?: number;
  female_compare?: number;
};

type APIResp = {
  ok?: boolean;
  rows?: CombinedRow[];
  data?: { rows?: CombinedRow[] };
  error?: string;
};

function toThaiMonthLabel(s?: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  try {
    const y = m ? Number(m[1]) : new Date(s).getFullYear();
    const mo = m ? Number(m[2]) - 1 : new Date(s).getMonth();
    const d = new Date(y, mo, 1);
    return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
  } catch {
    return s ?? "";
  }
}

/** ✅ โทนสี: จังหวัดหลัก = เข้ม (เส้นทึบ), จังหวัดเปรียบเทียบ = อ่อน (เส้นประ) */
const MAIN_MALE = "#0EA5E9";
const MAIN_FEMALE = "#EC4899";
const COMPARE_MALE = "#7DD3FC";
const COMPARE_FEMALE = "#F9A8D4";

/** ✅ Legend แบบ “เส้นล้วน” (ไม่มีวงกลม) + จัดกลางล่าง */
const CenterBottomLegend = React.memo(function CenterBottomLegend({
  mainProvince,
  compareProvince,
}: {
  mainProvince: string;
  compareProvince: string;
}) {
  const Item = ({
    color,
    dashed,
    label,
  }: {
    color: string;
    dashed?: boolean;
    label: string;
  }) => (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        className="inline-block"
        style={{
          width: 22,
          borderTopWidth: 2,
          borderTopStyle: dashed ? "dashed" : "solid",
          borderTopColor: color,
          transform: "translateY(-1px)",
        }}
      />
      <span>{label}</span>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <Item color={MAIN_MALE} label={`ชาย — ${mainProvince}`} />
      <Item color={MAIN_FEMALE} label={`หญิง — ${mainProvince}`} />
      <Item color={COMPARE_MALE} dashed label={`ชาย — ${compareProvince}`} />
      <Item color={COMPARE_FEMALE} dashed label={`หญิง — ${compareProvince}`} />
    </div>
  );
});

/** ✅ FIX: type tooltip แบบ minimal (Recharts บางเวอร์ชัน TooltipProps ไม่มี payload ใน type) */
type TooltipContentProps = {
  active?: boolean;
  payload?: Array<any>;
  label?: any;
};

/* Tooltip: จัดให้อ่านง่าย + โทนเข้ม/อ่อนตามจังหวัด */
const CompareTrendTooltip = React.memo(function CompareTrendTooltip({
  active,
  payload,
}: TooltipContentProps): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as (CombinedRow & { label_th?: string }) | undefined;
  if (!row) return null;

  const order = ["male_main", "female_main", "male_compare", "female_compare"];
  const sorted = [...payload].sort(
    (a, b) => order.indexOf(String(a.dataKey)) - order.indexOf(String(b.dataKey))
  );

  return (
    <div className="rounded-md bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-gray-200">
      <div className="mb-1 font-medium text-gray-900">
        {row.month_th || row.label_th || toThaiMonthLabel(row.month)}
      </div>

      {sorted.map((p) => {
        const val = Number(p.value ?? 0);
        if (!Number.isFinite(val)) return null;

        return (
          <div
            key={String(p.dataKey)}
            className="flex items-center gap-2 text-gray-700"
          >
            <span
              className="inline-block"
              style={{
                width: 18,
                borderTopWidth: 2,
                borderTopStyle: String(p.dataKey).includes("compare")
                  ? "dashed"
                  : "solid",
                borderTopColor: (p.color as string) || "#888",
                transform: "translateY(-1px)",
              }}
            />
            {p.name} : <span className="font-semibold">{TH_NUMBER(val)}</span> ราย
          </div>
        );
      })}
    </div>
  );
});

function normalizeRows(input: unknown): CombinedRow[] {
  if (Array.isArray(input)) return input as CombinedRow[];
  if (!input || typeof input !== "object") return [];
  const obj: any = input;
  if (obj.ok === false) return [];

  const rows =
    obj.rows ??
    obj.data?.rows ??
    obj.items ??
    obj.data?.items ??
    obj.data ??
    null;

  return Array.isArray(rows) ? (rows as CombinedRow[]) : [];
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function monthKeyToNumber(m?: string) {
  // "YYYY-MM" -> YYYY*12 + MM
  if (!m) return 0;
  const mm = m.match(/^(\d{4})[-/](\d{1,2})/);
  if (!mm) return 0;
  const y = Number(mm[1]);
  const mo = Number(mm[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return 0;
  return y * 12 + mo;
}

type CacheEntry = { at: number; data: (CombinedRow & { label_th: string })[] };
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

export default function CompareGenderTrendChart() {
  const { start_date, end_date, diseaseCode } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<(CombinedRow & { label_th: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBoth = !!mainProvince && !!compareProvince;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth) return "";

    const qs = new URLSearchParams();
    qs.set("disease", diseaseCode || "");
    qs.set("start_date", start_date || "");
    qs.set("end_date", end_date || "");
    qs.set("mainProvince", mainProvince!);
    qs.set("compareProvince", compareProvince!);

    return `/api/compareInfo/gender-trend?${qs.toString()}`;
  }, [hasBoth, diseaseCode, start_date, end_date, mainProvince, compareProvince]);

  useEffect(() => {
    if (!hasBoth || !requestUrl) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    setError(null);

    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setRows(cached.data);
      return;
    }

    // ✅ abort request เก่าเวลาสลับตัวกรองเร็ว ๆ
    const prev = inFlightRef.current.get(requestUrl);
    if (prev) prev.abort();

    const ac = new AbortController();
    inFlightRef.current.set(requestUrl, ac);

    (async () => {
      try {
        setLoading(true);

        const res = await fetch(requestUrl, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text().catch(() => "");
        if (!res.ok) throw new Error(text || "โหลดข้อมูลแนวโน้มไม่สำเร็จ");

        const json = safeJson<APIResp>(text, {});
        if (json.ok === false) throw new Error(json.error || "ไม่สามารถโหลดข้อมูลได้");

        const dataRaw = normalizeRows(json);

        const data = dataRaw
          .map((r) => ({
            ...r,
            label_th: r.month_th || toThaiMonthLabel(r.month),
          }))
          .sort((a, b) => monthKeyToNumber(a.month) - monthKeyToNumber(b.month));

        cacheRef.current.set(requestUrl, { at: Date.now(), data });
        setRows(data);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compare gender-trend):", err);
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

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ให้ครบก่อน
        เพื่อดูกราฟแนวโน้มผู้ป่วยจำแนกตามเพศ)
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-1 font-bold">
        เปรียบเทียบแนวโน้มผู้ป่วยจำแนกตามเพศ (รายเดือน, หน่วย: ราย)
      </h4>

      <p className="mb-3 text-xs text-gray-600">
        ช่วงเวลา: {start_date || "—"} – {end_date || "—"} | จังหวัดหลัก:{" "}
        <span className="font-semibold">{mainProvince}</span> | จังหวัดเปรียบเทียบ:{" "}
        <span className="font-semibold">{compareProvince}</span>
      </p>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="relative" aria-busy={loading} aria-live="polite">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/60 text-sm text-gray-700">
            ⏳ กำลังโหลด...
          </div>
        )}

        {!loading && rows.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่พบข้อมูลแนวโน้มสำหรับการเปรียบเทียบ</p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 56, left: 8 }}>
              <XAxis
                dataKey="label_th"
                interval="preserveStartEnd"
                tickMargin={8}
                padding={{ left: 0, right: 18 }}
                height={28}
              />
              <YAxis tickFormatter={TH_NUMBER} tickMargin={8} allowDecimals={false} />

              {/* ✅ FIX: Tooltip ใช้ component ที่ไม่พึ่ง TooltipProps */}
              <Tooltip content={<CompareTrendTooltip />} />

              <Legend
                verticalAlign="bottom"
                align="center"
                content={
                  <CenterBottomLegend
                    mainProvince={mainProvince || "—"}
                    compareProvince={compareProvince || "—"}
                  />
                }
              />

              {/* จังหวัดหลัก (เข้ม) */}
              <Line
                type="monotone"
                dataKey="male_main"
                name={`ชาย — ${mainProvince}`}
                stroke={MAIN_MALE}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="female_main"
                name={`หญิง — ${mainProvince}`}
                stroke={MAIN_FEMALE}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />

              {/* จังหวัดเปรียบเทียบ (อ่อน + เส้นประ) */}
              <Line
                type="monotone"
                dataKey="male_compare"
                name={`ชาย — ${compareProvince}`}
                stroke={COMPARE_MALE}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="female_compare"
                name={`หญิง — ${compareProvince}`}
                stroke={COMPARE_FEMALE}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
