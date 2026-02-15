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

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function regionLabel(region?: string | null): string {
  if (!region) return "";
  const raw = String(region).trim();

  // ถ้าเป็นภาษาไทยอยู่แล้ว
  if (/[ก-๙]/.test(raw)) {
    if (raw.includes("กรุงเทพ") || raw.includes("ปริมณฑล")) return "กรุงเทพและปริมณฑล";
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

/**
 * ✅ รองรับ response ได้หลายแบบ:
 * A) { topDeaths: [...] , region: ... }
 * B) { topPatients: [...] , region: ... }  (fallback)
 * C) [ { region, patients, deaths }, ... ]  (legacy)
 */
function normalizeRows(json: any): { rows: DataRow[]; regionRaw: string } {
  // legacy: array
  if (Array.isArray(json)) {
    const rows = json
      .map((r: any) => ({
        province: String(r?.province ?? "").trim(),
        patients: toNumber(r?.patients),
        deaths: toNumber(r?.deaths),
        region: r?.region ? String(r.region) : undefined,
      }))
      .filter((r: DataRow) => r.province);

    const regionRaw =
      String(rows?.[0]?.region ?? "").trim() ||
      ""; // legacy มักใส่ region ใน row

    return { rows, regionRaw };
  }

  const regionRaw = String(extractRegionFromResp(json) ?? "").trim();

  const topDeathsArr = Array.isArray(json?.topDeaths) ? json.topDeaths : null;
  if (topDeathsArr) {
    const rows = topDeathsArr
      .map((r: any) => ({
        province: String(r?.province ?? "").trim(),
        patients: toNumber(r?.patients),
        deaths: toNumber(r?.deaths),
        region: r?.region ? String(r.region) : undefined,
      }))
      .filter((r: DataRow) => r.province);

    const region2 = regionRaw || String(rows?.[0]?.region ?? "").trim() || "";
    return { rows, regionRaw: region2 };
  }

  // fallback: ถ้ามีแค่ topPatients ให้แสดง deaths = 0 (กันกราฟพัง)
  const topPatientsArr = Array.isArray(json?.topPatients) ? json.topPatients : null;
  if (topPatientsArr) {
    const rows = topPatientsArr
      .map((r: any) => ({
        province: String(r?.province ?? "").trim(),
        patients: toNumber(r?.patients),
        deaths: toNumber(r?.deaths), // ถ้าไม่มีจะเป็น 0
        region: r?.region ? String(r.region) : undefined,
      }))
      .filter((r: DataRow) => r.province);

    const region2 = regionRaw || String(rows?.[0]?.region ?? "").trim() || "";
    return { rows, regionRaw: region2 };
  }

  return { rows: [], regionRaw };
}

export default function GraphDeathsByRegion() {
  const { province, start_date, end_date } = useDashboardStore();
  const [data, setData] = useState<DataRow[]>([]);
  const [regionRaw, setRegionRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        // ถ้ายังไม่เลือกจังหวัด ไม่ต้องยิง
        if (!province) {
          setData([]);
          setRegionRaw("");
          setLoading(false);
          return;
        }

        setLoading(true);

        const url =
          `/api/dashBoard/region-by-province?start_date=${encodeURIComponent(start_date || "")}` +
          `&end_date=${encodeURIComponent(end_date || "")}` +
          `&province=${encodeURIComponent(province || "")}`;

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลดข้อมูลไม่สำเร็จ");

        const json = text ? JSON.parse(text) : {};
        if (cancelled) return;

        const { rows, regionRaw: regFromApi } = normalizeRows(json);

        setData(rows);
        let reg = regFromApi;

        // fallback สุดท้าย: lookup จากไฟล์จังหวัดใน public (ถ้ามี)
        if (!reg && province) {
          try {
            const mapRes = await fetch("/data/Thailand-ProvinceName.json", {
              cache: "force-cache",
            });
            const mapText = await mapRes.text();
            const arr = mapText ? JSON.parse(mapText) : [];
            const found = Array.isArray(arr)
              ? arr.find(
                  (p: any) =>
                    String(p?.ProvinceNameThai ?? "").trim() === String(province).trim()
                )
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
        if ((err as any)?.name === "AbortError") return;
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
      controller.abort();
    };
  }, [province, start_date, end_date]);

  const xMax = useMemo(() => {
    const maxDeaths = Math.max(0, ...data.map((d) => toNumber(d.deaths)));
    return niceMax(maxDeaths);
  }, [data]);

  const yWidth = useMemo(() => {
    const longest = data.reduce((m, d) => Math.max(m, (d.province ?? "").length), 0);
    return Math.min(180, Math.max(96, longest * 10));
  }, [data]);

  const regionText = useMemo(() => regionLabel(regionRaw), [regionRaw]);

  return (
    <div className="rounded bg-white p-4 shadow">
      <h4 className="mb-2 font-bold">ผู้เสียชีวิตสะสมใน {regionText || "—"}</h4>

      {loading ? (
        <p>⏳ กำลังโหลด...</p>
      ) : !province ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          กรุณาเลือกจังหวัดก่อน เพื่อแสดงผู้เสียชีวิตสะสมในภูมิภาค
        </div>
      ) : data.length === 0 ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          ไม่พบข้อมูลในช่วงวันที่ที่เลือก
        </div>
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
                <ProvinceCountTooltip seriesName="ผู้เสียชีวิตสะสม" labelKey="province" />
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
