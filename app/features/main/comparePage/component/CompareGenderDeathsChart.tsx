"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

type Row = {
  label: string;
  province: string;
  gender: "male" | "female" | "unknown";
  provinceType: "main" | "compare";
  value: number;
};

const MAIN_MALE = "#0EA5E9";
const MAIN_FEMALE = "#EC4899";
const MAIN_UNKNOWN = "#9CA3AF";

const COMPARE_MALE = "#7DD3FC";
const COMPARE_FEMALE = "#F9A8D4";
const COMPARE_UNKNOWN = "#D1D5DB";

function genderLabel(g: Row["gender"]): string {
  if (g === "male") return "ชาย";
  if (g === "female") return "หญิง";
  return "ไม่ระบุ";
}

function colorForRow(r: Row): string {
  if (r.gender === "male") return r.provinceType === "main" ? MAIN_MALE : COMPARE_MALE;
  if (r.gender === "female") return r.provinceType === "main" ? MAIN_FEMALE : COMPARE_FEMALE;
  return r.provinceType === "main" ? MAIN_UNKNOWN : COMPARE_UNKNOWN;
}

const CombinedGenderDeathsTooltip = React.memo(function CombinedGenderDeathsTooltip(
  props: any
) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;

  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-gray-200">
      <div className="mb-1 text-base font-bold text-gray-900">{row.province}</div>
      <div className="text-sm text-gray-800">
        ผู้เสียชีวิตสะสม • {genderLabel(row.gender)} :{" "}
        <span className="font-extrabold">{TH_NUMBER(row.value)}</span> ราย
      </div>
    </div>
  );
});

function renderValueLabel(p: any) {
  const val = Number(p.value ?? 0);
  if (!Number.isFinite(val) || val <= 0) return null;

  const x = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
  const y = Number(p.y ?? 0) + Number(p.height ?? 0) / 2 + 4;

  return (
    <text x={x} y={y} fontSize={12} fill="#374151">
      {TH_NUMBER(val)} ราย
    </text>
  );
}

function buildRows(
  main?: GenderSummary,
  compare?: GenderSummary,
  mainProvinceSelected?: string,
  compareProvinceSelected?: string
): Row[] {
  const out: Row[] = [];

  const pushAll = (
    s: GenderSummary,
    provinceType: Row["provinceType"],
    provinceSelected?: string
  ) => {
    const prov = String(provinceSelected || s.province || "");
    out.push(
      {
        label: `${genderLabel("male")} • ${prov}`,
        province: prov,
        gender: "male",
        provinceType,
        value: Number(s.male ?? 0),
      },
      {
        label: `${genderLabel("female")} • ${prov}`,
        province: prov,
        gender: "female",
        provinceType,
        value: Number(s.female ?? 0),
      },
      {
        label: `${genderLabel("unknown")} • ${prov}`,
        province: prov,
        gender: "unknown",
        provinceType,
        value: Number(s.unknown ?? 0),
      }
    );
  };

  if (main) pushAll(main, "main", mainProvinceSelected);
  if (compare) pushAll(compare, "compare", compareProvinceSelected);

  // ✅ กรองเฉพาะค่าที่มากกว่า 0
  return out.filter((r) => Number.isFinite(r.value) && r.value > 0);
}

function normalizeMainCompare(input: unknown): {
  main?: GenderSummary;
  compare?: GenderSummary;
  ok: boolean;
  error?: string;
} {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "invalid response" };
  }
  const obj: any = input;
  if (obj.ok === false) return { ok: false, error: obj.error || "api error" };

  const main = obj.main ?? obj.data?.main;
  const compare = obj.compare ?? obj.data?.compare;

  return { ok: true, main, compare };
}

function sumSummary(s?: GenderSummary) {
  if (!s) return 0;
  return Number(s.male ?? 0) + Number(s.female ?? 0) + Number(s.unknown ?? 0);
}

type CacheEntry = { at: number; rows: Row[]; noDeaths: boolean };
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

/** ✅ ดึง disease จาก store แบบปลอดภัย */
function getDiseaseFromStore(): string {
  const s = useDashboardStore() as any;
  return String(s?.diseaseCode ?? s?.disease ?? s?.disease_code ?? "").trim();
}

export default function CompareGenderDeathsChart() {
  const { start_date, end_date } = useDashboardStore();
  const disease = getDiseaseFromStore();

  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noDeaths, setNoDeaths] = useState(false);

  const hasBoth = !!mainProvince && !!compareProvince;
  const hasDisease = !!disease;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth || !hasDisease) return "";

    const qs = new URLSearchParams();
    qs.set("disease", disease);
    qs.set("start_date", start_date || "");
    qs.set("end_date", end_date || "");
    qs.set("mainProvince", mainProvince!);
    qs.set("compareProvince", compareProvince!);

    return `/api/compareInfo/gender-deaths?${qs.toString()}`;
  }, [hasBoth, hasDisease, disease, start_date, end_date, mainProvince, compareProvince]);

  useEffect(() => {
    // ✅ reset state เมื่อเงื่อนไขไม่ครบ
    if (!hasBoth) {
      setRows([]);
      setLoading(false);
      setError(null);
      setNoDeaths(false);
      return;
    }

    if (!hasDisease) {
      setRows([]);
      setLoading(false);
      setError(null);
      setNoDeaths(false);
      return;
    }

    if (!requestUrl) return;

    // ✅ เคลียร์ error ก่อน
    setError(null);
    setNoDeaths(false);

    // ✅ cache
    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setRows(cached.rows);
      setNoDeaths(cached.noDeaths);
      return;
    }

    // ✅ abort ทุก request ที่ค้างอยู่ก่อนยิงใหม่ (กัน response เก่ามาทับ)
    for (const [, controller] of inFlightRef.current) {
      controller.abort();
    }
    inFlightRef.current.clear();

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
        if (!res.ok) {
          throw new Error(text || "โหลดข้อมูลเปรียบเทียบผู้เสียชีวิตแยกตามเพศไม่สำเร็จ");
        }

        let json: unknown = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = {};
        }

        const { ok, main, compare, error: e } = normalizeMainCompare(json);
        if (!ok) throw new Error(e || "ไม่สามารถโหลดข้อมูลเปรียบเทียบได้");

        const totalDeaths = sumSummary(main) + sumSummary(compare);
        const nd = totalDeaths === 0;

        const built = nd ? [] : buildRows(main, compare, mainProvince!, compareProvince!);

        cacheRef.current.set(requestUrl, { at: Date.now(), rows: built, noDeaths: nd });
        setRows(built);
        setNoDeaths(nd);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compare gender-deaths):", err);
        setRows([]);
        setNoDeaths(false);
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
  }, [hasBoth, hasDisease, requestUrl]);

  const xMax = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      const v = Number(r.value ?? 0);
      if (Number.isFinite(v)) m = Math.max(m, v);
    }
    return niceMax(m);
  }, [rows]);

  const rightMargin = useMemo(() => {
    const text = `${TH_NUMBER(xMax)} ราย`;
    return Math.min(140, Math.max(48, Math.floor(text.length * 7.5) + 16));
  }, [xMax]);

  const title = useMemo(() => {
    if (!hasBoth) return "เปรียบเทียบผู้เสียชีวิตสะสมแยกตามเพศ (เลือกจังหวัดให้ครบ)";
    return `เปรียบเทียบผู้เสียชีวิตสะสมแยกตามเพศ ${mainProvince} และ ${compareProvince}`;
  }, [hasBoth, mainProvince, compareProvince]);

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ให้ครบก่อน เพื่อดูกราฟ)
      </div>
    );
  }

  if (!hasDisease) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (กรุณาเลือกโรคก่อน)
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      <h2 className="mb-1 text-base font-bold">{title}</h2>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="relative" aria-busy={loading} aria-live="polite">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/60 text-sm text-gray-700">
            ⏳ กำลังโหลด...
          </div>
        )}

        {!loading && noDeaths ? (
          <p className="text-sm font-medium text-gray-700">ไม่มีผู้เสียชีวิตในช่วงเวลานี้</p>
        ) : !loading && rows.length === 0 ? (
          <p className="text-sm text-gray-500">ไม่พบข้อมูลสำหรับการเปรียบเทียบ</p>
        ) : (
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

              <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 12 }} />

              <Tooltip content={<CombinedGenderDeathsTooltip />} wrapperStyle={{ zIndex: 10 }} offset={12} />

              <Bar dataKey="value" barSize={14} radius={[4, 4, 4, 4]} isAnimationActive={false}>
                <LabelList dataKey="value" position="right" content={renderValueLabel} />
                {rows.map((r, idx) => (
                  <Cell key={`${r.provinceType}-${r.gender}-${idx}`} fill={colorForRow(r)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {!noDeaths && rows.length > 0 && (
        <div className="mt-3 text-xs text-gray-600" aria-hidden="true">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded" style={{ background: MAIN_MALE }} />
              ชาย – {mainProvince}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded" style={{ background: COMPARE_MALE }} />
              ชาย – {compareProvince}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded" style={{ background: MAIN_FEMALE }} />
              หญิง – {mainProvince}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded" style={{ background: COMPARE_FEMALE }} />
              หญิง – {compareProvince}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
