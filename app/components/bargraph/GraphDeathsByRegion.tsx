"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { useDashboardStore } from "@/store/useDashboardStore";
import {
  TH_NUMBER,
  niceMax,
  ProvinceCountTooltip,
  ValueLabelRight,
} from "@/app/components/bargraph/GraphUtils";

type DataRow = {
  province: string;
  patients: number;
  deaths: number;
  region?: string;
  regionId?: string;
};

function regionLabel(region?: string | null): string {
  if (!region) return "";
  const raw = String(region).trim();

  if (/[ก-๙]/.test(raw)) {
    if (raw.includes("กรุงเทพ")) return "กรุงเทพและปริมณฑล";
    if (raw.startsWith("ภาค")) return raw;
    return `ภาค${raw}`;
  }

  const code = Number(raw);
  const map: Record<number, string> = {
    1: "ภาคเหนือ",
    2: "ภาคตะวันออกเฉียงเหนือ",
    3: "ภาคกลาง",
    4: "ภาคตะวันออก",
    5: "ภาคตะวันตก",
    6: "ภาคใต้",
    7: "กรุงเทพและปริมณฑล",
  };
  return map[code] ?? raw;
}

function extractRegionFromResp(json: any): string {
  return (
    json?.regionName ??
    json?.region ??
    json?.regionId ??
    json?.mainRegion ??
    json?.data?.regionName ??
    json?.data?.region ??
    json?.data?.regionId ??
    json?.data?.mainRegion ??
    json?.selected?.region ??
    json?.selected?.regionId ??
    json?.topDeaths?.[0]?.region ??
    json?.topDeaths?.[0]?.regionId ??
    ""
  );
}

export default function GraphDeathsByRegion() {
  const { province, start_date, end_date, diseaseCode } = useDashboardStore();

  const [data, setData] = useState<DataRow[]>([]);
  const [regionRaw, setRegionRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!province || !province.trim()) {
          if (!cancelled) {
            setData([]);
            setRegionRaw("");
          }
          return;
        }

        if (!diseaseCode || !diseaseCode.trim()) {
          if (!cancelled) {
            setData([]);
            setRegionRaw("");
          }
          return;
        }

        const url =
          `/api/dashBoard/region-by-province` +
          `?start_date=${encodeURIComponent(start_date || "")}` +
          `&end_date=${encodeURIComponent(end_date || "")}` +
          `&province=${encodeURIComponent(province || "")}` +
          `&disease=${encodeURIComponent(diseaseCode)}`;

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};

        // ✅ รองรับหลายชื่อ field กัน API เปลี่ยน
        const topDeaths: DataRow[] = Array.isArray(json.topDeaths)
          ? json.topDeaths
          : Array.isArray(json.top_deaths)
          ? json.top_deaths
          : [];

        if (cancelled) return;

        setData(topDeaths);

        let reg = extractRegionFromResp(json);

        if (!reg && (topDeaths?.[0]?.region || topDeaths?.[0]?.regionId)) {
          reg = String(topDeaths[0].region ?? topDeaths[0].regionId ?? "");
        }

        setRegionRaw(reg || "");
      } catch (e: any) {
        console.error("❌ Fetch error (deaths by region):", e);
        if (!cancelled) {
          setErr("โหลดข้อมูลไม่สำเร็จ");
          setData([]);
          setRegionRaw("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [province, start_date, end_date, diseaseCode]);

  const xMax = useMemo(
    () => niceMax(Math.max(0, ...data.map((d) => Number(d.deaths ?? 0)))),
    [data]
  );

  const yWidth = useMemo(() => {
    const longest = data.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(180, Math.max(96, longest * 10));
  }, [data]);

  const regionText = useMemo(() => regionLabel(regionRaw), [regionRaw]);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">ผู้เสียชีวิตสะสมใน {regionText || "—"}</h4>

      {!province || !province.trim() ? (
        <p className="text-sm text-gray-500">โปรดเลือกจังหวัดก่อน</p>
      ) : !diseaseCode || !diseaseCode.trim() ? (
        <p className="text-sm text-gray-500">โปรดเลือกโรคก่อน</p>
      ) : loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
            barCategoryGap="2%"
            barGap={0}
          >
            <XAxis
              type="number"
              tickFormatter={TH_NUMBER}
              tickMargin={8}
              domain={[0, xMax]}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="province"
              width={yWidth}
              interval={0}
              tick={{ fontSize: 14 }}
            />

            <Tooltip
              content={
                <ProvinceCountTooltip
                  seriesName="ผู้เสียชีวิตสะสม"
                  labelKey="province"
                />
              }
            />

            <Bar
              dataKey="deaths"
              fill="#6A7075"
              name="ผู้เสียชีวิตสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="deaths" content={<ValueLabelRight />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
