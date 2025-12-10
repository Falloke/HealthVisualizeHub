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
  VerticalProvinceTick,
  ValueLabelRight,
  ProvinceCountTooltip,
  niceMax,
} from "./GraphUtils";

type ProvinceResp = { province: string; region: string; patients: number };

type PatientsSummary = {
  totalPatients: number;
  avgPatientsPerDay: number;
  cumulativePatients: number;
};

type Row = { province: string; region?: string; value: number };

export default function GraphProvinceByPatients() {
  const { province, start_date, end_date } = useDashboardStore();

  const [data, setData] = useState<Row[]>([]);
  const [summary, setSummary] = useState<PatientsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const qs = new URLSearchParams({
          start_date: start_date || "",
          end_date: end_date || "",
          province: province || "",
        }).toString();

        const [provRes, sumRes] = await Promise.all([
          fetch(`/api/dashBoard/province-summary?${qs}`),
          fetch(`/api/dashBoard/patients-summary?${qs}`),
        ]);

        const provText = await provRes.text();
        if (!provRes.ok) throw new Error(provText || "โหลดข้อมูลไม่สำเร็จ");
        const provJson: ProvinceResp = provText
          ? JSON.parse(provText)
          : ({} as any);

        const sumText = await sumRes.text();
        if (!sumRes.ok) throw new Error(sumText || "โหลดข้อมูลสรุปไม่สำเร็จ");
        const sumJson: PatientsSummary | null = sumText
          ? JSON.parse(sumText)
          : null;

        if (!cancelled) {
          if (provJson?.province) {
            setData([
              {
                province: provJson.province,
                region: provJson.region,
                value: provJson.patients,
              },
            ]);
          } else {
            setData([]);
          }
          setSummary(sumJson);
        }
      } catch (e) {
        console.error("❌ Fetch error (province-patients):", e);
        if (!cancelled) {
          setData([]);
          setSummary(null);
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
    () => niceMax(Math.max(0, ...data.map((d) => Number(d.value ?? 0)))),
    [data]
  );

  const headerProvince = province || data[0]?.province || "";

  return (
    <div className="rounded bg-white p-4 shadow">
      {/* ส่วนหัวตัวเลขสรุป */}
      <div className="mb-3">
        <h4 className="font-bold text-gray-900">
          ผู้ป่วยสะสมจังหวัด {headerProvince || "-"}
        </h4>

        {loading ? (
          <p className="mt-1 text-sm text-gray-500">⏳ กำลังโหลด...</p>
        ) : !summary ? (
          <p className="mt-1 text-sm text-gray-500">
            ไม่พบข้อมูลผู้ป่วยในช่วงเวลานี้
          </p>
        ) : (
          <p className="text-2xl font-bold text-red-600">
            {summary.totalPatients?.toLocaleString?.() ?? "-"}{" "}
            <span className="text-base font-normal text-gray-800">ราย</span>
            <span className="ml-3 align-baseline text-xs font-normal text-gray-700 sm:text-sm">
              เฉลี่ยวันละ{" "}
              <span className="font-semibold">
                {summary.avgPatientsPerDay?.toLocaleString?.() ?? "-"}
              </span>{" "}
              คน/วัน <span className="mx-1">•</span> สะสม{" "}
              <span className="font-semibold">
                {summary.cumulativePatients?.toLocaleString?.() ?? "-"}
              </span>{" "}
              ราย
            </span>
          </p>
        )}
      </div>

      {/* กราฟ */}
      {loading ? (
        <p className="text-sm text-gray-500">⏳ กำลังโหลดกราฟ...</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 12, bottom: 8, left: 8 }}
            barSize={22}
          >
            <XAxis type="number" tickFormatter={TH_NUMBER} domain={[0, xMax]} />
            <YAxis
              type="category"
              dataKey="province"
              width={36}
              interval={0}
              tick={<VerticalProvinceTick />}
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
              dataKey="value"
              fill="#2185D5"
              radius={[0, 6, 6, 0]}
              name="ผู้ป่วยสะสม"
            >
              <LabelList dataKey="value" content={<ValueLabelRight />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
