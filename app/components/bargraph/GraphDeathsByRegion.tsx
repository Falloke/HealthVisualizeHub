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
};

function regionLabel(region?: string | null): string {
  if (!region) return "";
  const raw = String(region).trim();

  // รองรับกรณีเป็นชื่อ/ภาษาไทย
  if (/[ก-๙]/.test(raw)) {
    if (raw.includes("กรุงเทพ")) return "กรุงเทพและปริมณฑล";
    if (raw.startsWith("ภาค")) return raw;
    return `ภาค${raw}`;
  }

  // รองรับกรณีเป็นโค้ดตัวเลข
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
    json?.mainRegion ??
    json?.data?.regionName ??
    json?.data?.region ??
    json?.data?.mainRegion ??
    json?.topDeaths?.[0]?.region ??
    json?.topPatients?.[0]?.region ??
    ""
  );
}

export default function GraphDeathsByRegion() {
  const { province, start_date, end_date } = useDashboardStore();
  const [data, setData] = useState<DataRow[]>([]);
  const [regionRaw, setRegionRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const url =
          `/api/dashBoard/region-by-province` +
          `?start_date=${encodeURIComponent(start_date)}` +
          `&end_date=${encodeURIComponent(end_date)}` +
          `&province=${encodeURIComponent(province)}`;

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};

        if (cancelled) return;

        // ✅ กราฟ deaths ต้องใช้ topDeaths เป็นหลัก
        const rows: DataRow[] = Array.isArray(json.topDeaths) ? json.topDeaths : [];

        // fallback เฉพาะกรณี API เก่ามาก ๆ ยังไม่ส่ง topDeaths มา
        const fallbackRows: DataRow[] =
          rows.length > 0
            ? rows
            : (Array.isArray(json.topPatients) ? json.topPatients : []);

        // เรียงตาม deaths เสมอสำหรับกราฟนี้
        const sorted = [...fallbackRows].sort(
          (a, b) => Number(b.deaths ?? 0) - Number(a.deaths ?? 0)
        );

        setData(sorted);

        let reg = extractRegionFromResp(json);
        if (!reg && sorted?.[0]?.region) reg = String(sorted[0].region);
        setRegionRaw(reg || "");
      } catch (err) {
        console.error("❌ Fetch error (deaths by region):", err);
        if (!cancelled) {
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
  }, [province, start_date, end_date]);

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

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-600">ไม่มีข้อมูลในช่วงวันที่ที่เลือก</p>
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
