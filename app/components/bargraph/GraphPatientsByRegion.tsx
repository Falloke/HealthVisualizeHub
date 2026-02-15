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
  Label,
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

export default function GraphPatientsByRegion() {
  const { province, start_date, end_date } = useDashboardStore();
  const [data, setData] = useState<DataRow[]>([]);
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
        if (!cancelled)
          setData(Array.isArray(json.topPatients) ? json.topPatients : []);
      } catch (err) {
        console.error("❌ Fetch error (patients by region):", err);
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [province, start_date, end_date]);

  // ✅ ปลายแกน X ให้พอดีกับข้อมูล
  const xMax = useMemo(
    () => niceMax(Math.max(0, ...data.map((d) => Number(d.patients ?? 0)))),
    [data]
  );

  // ✅ ความกว้างแกน Y แบบไดนามิก เพื่อ "ชิดซ้าย" เท่าที่จำเป็น
  const yWidth = useMemo(() => {
    const longest = data.reduce(
      (m, d) => Math.max(m, (d.province ?? "").length),
      0
    );
    // คูณ ~8–10px/ตัวอักษร (ภาษาไทยกว้างหน่อย)
    return Math.min(180, Math.max(96, longest * 10));
  }, [data]);

  const regionName = data[0]?.region ? ` ${data[0].region}` : "";

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">ผู้ป่วยสะสมใน{regionName}</h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={data}
            layout="vertical"
            // ✅ ชิดซ้าย: ลด left, เพิ่ม right ให้พอวาง label ของแกน X ด้านขวา
            margin={{ top: 8, right: 64, bottom: 16, left: 16 }}
            barCategoryGap="2%" // ช่องเทาระหว่างแถวให้แคบ
            barGap={0}
          >
            <XAxis
              type="number"
              tickFormatter={TH_NUMBER}
              tickMargin={8}
              domain={[0, xMax]}
              allowDecimals={false}
            ></XAxis>

            <YAxis
              type="category"
              dataKey="province"
              width={yWidth} // ✅ Y-axis แคบพอดี ไม่เว้นช่องซ้ายเยอะ
              interval={0}
              tick={{ fontSize: 14 }}
            />

            {/* ✅ Hover: จังหวัด + ผู้ป่วยสะสม : xx ราย */}
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
              fill="#004680
"
              name="ผู้ป่วยสะสม"
              barSize={26}
              radius={[0, 6, 6, 0]}
            >
              {/* ✅ ปลายแท่งมีหน่วย "ราย" */}
              <LabelList dataKey="patients" content={<ValueLabelRight />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
