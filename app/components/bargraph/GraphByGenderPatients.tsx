"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { useDashboardStore } from "@/store/useDashboardStore";
import {
  TH_NUMBER,
  niceMax,
  VerticalProvinceTick,
} from "@/app/components/bargraph/GraphUtils";

type PatientsData = {
  province: string;
  male: number;
  female: number;
  unknown?: number;
};

type TooltipItem = {
  dataKey?: string;
  value?: number | string;
  payload?: PatientsData;
};

type GenderTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipItem[];
};

function LineStyleGenderTooltip({ active, label, payload }: GenderTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const row = (payload[0]?.payload ?? {}) as PatientsData;
  const provinceName = row?.province ?? String(label ?? "");
  const provinceLabel = provinceName ? `จังหวัด${provinceName}` : "ทุกจังหวัด";

  const maleItem = payload.find((p) => p.dataKey === "male");
  const femaleItem = payload.find((p) => p.dataKey === "female");
  const unknownItem = payload.find((p) => p.dataKey === "unknown");

  const male = Number(maleItem?.value ?? 0);
  const female = Number(femaleItem?.value ?? 0);
  const unknown = Number(unknownItem?.value ?? 0);

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-gray-200">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-base font-bold text-gray-900">ผู้ป่วยสะสม</div>
        <div className="text-base font-bold text-gray-900">{provinceLabel}</div>
      </div>

      <div className="flex items-center gap-2 text-gray-800">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#4FC3F7" }}
        />
        ชาย: <span className="font-extrabold">{TH_NUMBER(male)}</span> ราย
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-gray-800">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#F48FB1" }}
        />
        หญิง: <span className="font-extrabold">{TH_NUMBER(female)}</span> ราย
      </div>

      {unknown > 0 && (
        <div className="mt-1.5 flex items-center gap-2 text-gray-800">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "#BDBDBD" }}
          />
          ไม่ระบุ:{" "}
          <span className="font-extrabold">{TH_NUMBER(unknown)}</span> ราย
        </div>
      )}
    </div>
  );
}

export default function GraphByGenderPatients() {
  const { province, start_date, end_date, diseaseCode } = useDashboardStore();
  const [data, setData] = useState<PatientsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const provinceLabel = (province || "").trim();
  const titleProvinceText = provinceLabel
    ? `จังหวัด${provinceLabel}`
    : "ทุกจังหวัด";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // ✅ ถ้าไม่มีโรค -> ไม่ต้องยิง API (เพราะ API ต้องการ disease)
        if (!diseaseCode || !diseaseCode.trim()) {
          if (!cancelled) setData([]);
          return;
        }

        const url =
          `/api/dashBoard/gender-patients` +
          `?start_date=${encodeURIComponent(start_date)}` +
          `&end_date=${encodeURIComponent(end_date)}` +
          `&province=${encodeURIComponent(provinceLabel)}` +
          `&disease=${encodeURIComponent(diseaseCode)}`;

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "โหลดข้อมูลผู้ป่วยไม่สำเร็จ");
        }

        const json = (await res.json()) as PatientsData[];

        if (cancelled) return;
        setData(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error("❌ Fetch error (gender-patients):", e);
        if (!cancelled) {
          setErr("โหลดข้อมูลผู้ป่วยไม่สำเร็จ");
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provinceLabel, start_date, end_date, diseaseCode]);

  const xMax = useMemo(() => {
    const maxVal = Math.max(
      0,
      ...data.flatMap((r) => [
        Number(r.male || 0),
        Number(r.female || 0),
        Number(r.unknown || 0),
      ])
    );
    return niceMax(maxVal);
  }, [data]);

  const rightMargin = useMemo(() => {
    const text = `${TH_NUMBER(xMax)} ราย`;
    return Math.min(120, Math.max(40, Math.floor(text.length * 7.5) + 14));
  }, [xMax]);

  return (
    <div className="overflow-hidden rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">
        ผู้ป่วยสะสมแยกตามเพศ {titleProvinceText}
      </h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: rightMargin, bottom: 28, left: 8 }}
            barCategoryGap="12%"
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
              dataKey="province"
              type="category"
              width={56}
              tick={<VerticalProvinceTick />}
            />

            <Tooltip
              content={<LineStyleGenderTooltip />}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              wrapperStyle={{ zIndex: 10 }}
              offset={12}
            />

            <Legend
              verticalAlign="bottom"
              align="center"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, lineHeight: "12px" }}
            />

            <Bar
              dataKey="male"
              name="ชาย"
              fill="#4FC3F7"
              barSize={14}
              radius={[4, 4, 4, 4]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="male"
                position="right"
                content={(p: any) => {
                  const val = Number(p.value ?? 0);
                  const x = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                  const y = Number(p.y ?? 0) + Number(p.height ?? 0) / 2 + 4;
                  return (
                    <text x={x} y={y} fontSize={12} fill="#374151">
                      {TH_NUMBER(val)} ราย
                    </text>
                  );
                }}
              />
            </Bar>

            <Bar
              dataKey="female"
              name="หญิง"
              fill="#F48FB1"
              barSize={14}
              radius={[4, 4, 4, 4]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="female"
                position="right"
                content={(p: any) => {
                  const val = Number(p.value ?? 0);
                  const x = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                  const y = Number(p.y ?? 0) + Number(p.height ?? 0) / 2 + 4;
                  return (
                    <text x={x} y={y} fontSize={12} fill="#374151">
                      {TH_NUMBER(val)} ราย
                    </text>
                  );
                }}
              />
            </Bar>

            {data.some((r) => (r.unknown ?? 0) > 0) && (
              <Bar
                dataKey="unknown"
                name="ไม่ระบุ"
                fill="#BDBDBD"
                barSize={14}
                radius={[4, 4, 4, 4]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="unknown"
                  position="right"
                  content={(p: any) => {
                    const val = Number(p.value ?? 0);
                    const x = Number(p.x ?? 0) + Number(p.width ?? 0) + 6;
                    const y = Number(p.y ?? 0) + Number(p.height ?? 0) / 2 + 4;
                    return (
                      <text x={x} y={y} fontSize={12} fill="#374151">
                        {TH_NUMBER(val)} ราย
                      </text>
                    );
                  }}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
