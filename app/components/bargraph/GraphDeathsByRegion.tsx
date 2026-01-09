// app/components/bargraph/GraphDeathsByRegion.tsx
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
  region?: string; // บาง API อาจไม่มี
};

function regionLabel(region?: string | null): string {
  if (!region) return "";
  const raw = String(region).trim();

  // ถ้าเป็นภาษาไทยอยู่แล้ว
  if (/[ก-๙]/.test(raw)) {
    if (raw.includes("กรุงเทพ")) return "กรุงเทพและปริมณฑล";
    if (raw.startsWith("ภาค")) return raw;
    return `ภาค${raw}`;
  }

  // ถ้าเป็นโค้ดเลข
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
  // ✅ ไล่ดู key ที่มักจะเจอจาก API หลายแบบ
  return (
    json?.regionName ??
    json?.region ??
    json?.mainRegion ??
    json?.data?.regionName ??
    json?.data?.region ??
    json?.data?.mainRegion ??
    json?.topDeaths?.[0]?.region ??
    ""
  );
}

export default function GraphDeathsByRegion() {
  const { province, start_date, end_date } = useDashboardStore();
  const [data, setData] = useState<DataRow[]>([]);
  const [regionRaw, setRegionRaw] = useState<string>(""); // ✅ เก็บภูมิภาคแยก
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const url = `/api/dashBoard/region-by-province?start_date=${start_date}&end_date=${end_date}&province=${province}`;
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};
        const topDeaths: DataRow[] = Array.isArray(json.topDeaths) ? json.topDeaths : [];

        if (cancelled) return;

        setData(topDeaths);

        // ✅ 1) เอาภูมิภาคจาก response ระดับบนก่อน
        let reg = extractRegionFromResp(json);

        // ✅ 2) fallback: บาง API ใส่ region ไว้ใน row
        if (!reg && topDeaths?.[0]?.region) reg = String(topDeaths[0].region);

        // ✅ 3) fallback สุดท้าย: lookup จากไฟล์จังหวัดใน public (ถ้ามี)
        if (!reg && province) {
          try {
            const mapRes = await fetch("/data/Thailand-ProvinceName.json", { cache: "force-cache" });
            const mapText = await mapRes.text();
            const arr = mapText ? JSON.parse(mapText) : [];
            const found = Array.isArray(arr)
              ? arr.find((p: any) => String(p?.ProvinceNameThai ?? "").trim() === String(province).trim())
              : null;

            reg =
              found?.Region_VaccineRollout_MOPH ??
              found?.Region ??
              found?.region ??
              found?.regionName ??
              "";
          } catch {
            // ignore
          }
        }

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
    const longest = data.reduce((m, d) => Math.max(m, (d.province ?? "").length), 0);
    return Math.min(180, Math.max(96, longest * 10));
  }, [data]);

  const regionText = useMemo(() => regionLabel(regionRaw), [regionRaw]);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">
        ผู้เสียชีวิตสะสมใน {regionText || "—"}
      </h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
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
