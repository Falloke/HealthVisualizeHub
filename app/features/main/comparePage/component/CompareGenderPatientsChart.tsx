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
  label: string; // “จังหวัด • เพศ”
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

const TITLE_W = 383.2;
const TITLE_H = 48;

function genderLabel(g: Row["gender"]): string {
  if (g === "male") return "ชาย";
  if (g === "female") return "หญิง";
  return "ไม่ระบุ";
}

function colorForRow(r: Row): string {
  if (r.gender === "male")
    return r.provinceType === "main" ? MAIN_MALE : COMPARE_MALE;
  if (r.gender === "female")
    return r.provinceType === "main" ? MAIN_FEMALE : COMPARE_FEMALE;
  return r.provinceType === "main" ? MAIN_UNKNOWN : COMPARE_UNKNOWN;
}

const CombinedGenderPatientsTooltip = React.memo(function CombinedGenderPatientsTooltip({
  active,
  payload,
}: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-gray-200">
      <div className="mb-1 text-base font-bold text-gray-900">{row.province}</div>
      <div className="text-sm text-gray-800">
        ผู้ป่วยสะสม • {genderLabel(row.gender)} :{" "}
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

function buildRows(main?: GenderSummary, compare?: GenderSummary): Row[] {
  const out: Row[] = [];

  const pushAll = (s: GenderSummary, provinceType: Row["provinceType"]) => {
    const prov = String(s.province ?? "");
    out.push(
      {
        label: `${prov} • ชาย`,
        province: prov,
        gender: "male",
        provinceType,
        value: Number(s.male ?? 0),
      },
      {
        label: `${prov} • หญิง`,
        province: prov,
        gender: "female",
        provinceType,
        value: Number(s.female ?? 0),
      },
      {
        label: `${prov} • ไม่ระบุ`,
        province: prov,
        gender: "unknown",
        provinceType,
        value: Number(s.unknown ?? 0),
      }
    );
  };

  if (main) pushAll(main, "main");
  if (compare) pushAll(compare, "compare");

  return out.filter((r) => Number.isFinite(r.value) && r.value > 0);
}

function normalizeMainCompare(input: unknown): {
  main?: GenderSummary;
  compare?: GenderSummary;
  ok: boolean;
  error?: string;
} {
  if (!input || typeof input !== "object")
    return { ok: false, error: "invalid response" };
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

type CacheEntry = { at: number; rows: Row[]; noPatients: boolean };
const CLIENT_CACHE_TTL_MS = 2 * 60 * 1000;

export default function CompareGenderPatientsChart() {
  const { start_date, end_date, diseaseCode } = useDashboardStore(); // ✅ เพิ่ม diseaseCode
  const { mainProvince, compareProvince } = useCompareStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPatients, setNoPatients] = useState(false);

  const hasBoth = !!mainProvince && !!compareProvince;

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<Map<string, AbortController>>(new Map());

  const requestUrl = useMemo(() => {
    if (!hasBoth) return "";
    const qs = new URLSearchParams();
    qs.set("disease", diseaseCode || ""); // ✅ ส่งโรค
    qs.set("start_date", start_date || "");
    qs.set("end_date", end_date || "");
    qs.set("mainProvince", mainProvince!);
    qs.set("compareProvince", compareProvince!);
    return `/api/compareInfo/gender-patients?${qs.toString()}`;
  }, [hasBoth, diseaseCode, start_date, end_date, mainProvince, compareProvince]);

  useEffect(() => {
    if (!hasBoth || !requestUrl) {
      setRows([]);
      setLoading(false);
      setError(null);
      setNoPatients(false);
      return;
    }

    setError(null);
    setNoPatients(false);

    const now = Date.now();
    const cached = cacheRef.current.get(requestUrl);
    if (cached && now - cached.at < CLIENT_CACHE_TTL_MS) {
      setRows(cached.rows);
      setNoPatients(cached.noPatients);
      return;
    }

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
        if (!res.ok)
          throw new Error(text || "โหลดข้อมูลเปรียบเทียบผู้ป่วยตามเพศไม่สำเร็จ");

        let json: unknown = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          json = {};
        }

        const { ok, main, compare, error: e } = normalizeMainCompare(json);
        if (!ok) throw new Error(e || "ไม่สามารถโหลดข้อมูลได้");

        const total = sumSummary(main) + sumSummary(compare);
        const np = total === 0;

        const built = np ? [] : buildRows(main, compare);

        cacheRef.current.set(requestUrl, { at: Date.now(), rows: built, noPatients: np });
        setRows(built);
        setNoPatients(np);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("❌ Fetch error (compare gender-patients):", err);
        setRows([]);
        setNoPatients(false);
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
    let m = 0;
    for (const r of rows) {
      const v = Number(r.value ?? 0);
      if (Number.isFinite(v)) m = Math.max(m, v);
    }
    return niceMax(m);
  }, [rows]);

  const rightMargin = useMemo(() => {
    const text = `${TH_NUMBER(xMax)} ราย`;
    return Math.min(140, Math.max(40, Math.floor(text.length * 7.5) + 16));
  }, [xMax]);

  if (!hasBoth) {
    return (
      <div className="rounded bg-white p-4 text-sm text-gray-500 shadow">
        (เลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบจาก Sidebar ให้ครบก่อน
        เพื่อดูกราฟเปรียบเทียบผู้ป่วยสะสมแยกตามเพศ)
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-4 shadow">
      <h3
        className="mb-1 text-lg font-bold whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ width: TITLE_W, height: TITLE_H, lineHeight: `${TITLE_H}px` }}
      >
        เปรียบเทียบผู้ป่วยสะสมแยกตามเพศ
      </h3>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="relative" aria-busy={loading} aria-live="polite">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/60 text-sm text-gray-700">
            ⏳ กำลังโหลด...
          </div>
        )}

        {!loading && noPatients ? (
          <p className="text-sm font-medium text-gray-700">
            ไม่มีผู้ป่วยในช่วงเวลานี้
          </p>
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

              <YAxis
                type="category"
                dataKey="label"
                width={180}
                tick={{ fontSize: 12 }}
              />

              <Tooltip
                content={<CombinedGenderPatientsTooltip />}
                wrapperStyle={{ zIndex: 10 }}
                offset={12}
              />

              <Bar
                dataKey="value"
                barSize={14}
                radius={[4, 4, 4, 4]}
                isAnimationActive={false}
              >
                <LabelList dataKey="value" position="right" content={renderValueLabel} />
                {rows.map((r, idx) => (
                  <Cell key={`${r.label}-${idx}`} fill={colorForRow(r)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ✅ ซ่อน Legend เมื่อไม่มีข้อมูล/ไม่มีผู้ป่วย */}
      {!noPatients && rows.length > 0 && (
        <div className="mt-3 text-xs text-gray-600">
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
