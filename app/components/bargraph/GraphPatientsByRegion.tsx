// app/components/bargraph/GraphPatientsByRegion.tsx
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
  regionId?: string; // ✅ รองรับ API ใหม่
};

function getRegionNameFromResp(json: any, rows: DataRow[]) {
  return (
    json?.regionName ??
    json?.regionId ??
    json?.region ??
    json?.selected?.regionId ??
    json?.selected?.region ??
    rows?.[0]?.regionId ??
    rows?.[0]?.region ??
    ""
  );
}

export default function GraphPatientsByRegion() {
  const { province, start_date, end_date, diseaseCode } = useDashboardStore();
  const [data, setData] = useState<DataRow[]>([]);
  const [regionNameRaw, setRegionNameRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // ✅ ถ้าไม่มีโรค -> ไม่ยิง API
        if (!diseaseCode || !diseaseCode.trim()) {
          if (!cancelled) {
            setData([]);
            setRegionNameRaw("");
          }
          return;
        }

        const url =
          `/api/dashBoard/region-by-province` +
          `?start_date=${encodeURIComponent(start_date)}` +
          `&end_date=${encodeURIComponent(end_date)}` +
          `&province=${encodeURIComponent(province || "")}` +
          `&disease=${encodeURIComponent(diseaseCode)}`;

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};
        const rows: DataRow[] = Array.isArray(json.topPatients)
          ? json.topPatients
          : [];

        if (cancelled) return;

        setData(rows);
        setRegionNameRaw(getRegionNameFromResp(json, rows));
      } catch (e: any) {
        console.error("❌ Fetch error (patients by region):", e);
        if (!cancelled) {
          setErr("โหลดข้อมูลไม่สำเร็จ");
          setData([]);
          setRegionNameRaw("");
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
    () => niceMax(Math.max(0, ...data.map((d) => Number(d.patients ?? 0)))),
    [data]
  );

  const yWidth = useMemo(() => {
    const longest = data.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    return Math.min(180, Math.max(96, longest * 10));
  }, [data]);

  const regionName = regionNameRaw ? ` ${regionNameRaw}` : "";

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">ผู้ป่วยสะสมใน{regionName || " —"}</h4>

      {loading ? (
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
                  seriesName="ผู้ป่วยสะสม"
                  labelKey="province"
                />
              }
            />

            <Bar
              dataKey="patients"
              fill="#004680"
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="patients" content={<ValueLabelRight />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
