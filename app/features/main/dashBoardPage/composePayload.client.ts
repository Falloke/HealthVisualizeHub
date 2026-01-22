// D:\HealtRiskHub\app\features\main\dashBoardPage\composePayload.client.ts
"use client";

import { useDashboardStore } from "@/store/useDashboardStore";

type DashBoardOverview = {
  totalPatients: number;
  avgPatientsPerDay: number;
  cumulativePatients: number;
  totalDeaths: number;
  avgDeathsPerDay: number;
  cumulativeDeaths: number;
};

type AgePatientsRow = { ageRange: string; patients: number };
type AgeDeathsRow = { ageRange: string; deaths: number };

type GenderPatientsRow = {
  province: string;
  male: number;
  female: number;
  unknown: number;
};

type GenderDeathsRow = { gender: "ชาย" | "หญิง" | "ไม่ระบุ"; value: number };
type MonthlyGenderTrendRow = { month: string; male: number; female: number };

// payload ที่จะส่งเข้า /api/ai/generate
export type AINarrativePayload = {
  timeRange: { start: string; end: string };
  province: string;

  // ✅ ส่งทั้ง code และชื่อโรค
  diseaseCode: string;
  diseaseName?: string;

  overview: DashBoardOverview;
  byAge: { patients: AgePatientsRow[]; deaths: AgeDeathsRow[] };
  byGender: {
    patients: { male: number; female: number; unknown: number };
    deaths: GenderDeathsRow[];
  };
  monthlyGenderTrend: MonthlyGenderTrendRow[];
  extraNotes?: string;
  precomputed?: {
    monthlyTotals?: Array<{ month: string; total: number }>;
  };
};

const qs = (o: Record<string, string>) => "?" + new URLSearchParams(o).toString();

async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    let detail = "";
    try {
      const t = await res.text();
      detail = t ? ` — ${t}` : "";
    } catch {}
    throw new Error(`API failed: ${url} (HTTP ${res.status})${detail}`);
  }

  return (await res.json()) as T;
}

// ✅ helper: ดึงชื่อโรคจาก store แบบถูกต้อง (ห้ามหยิบ state.disease เพราะมันคือ "D04")
function pickDiseaseNameFromStore(state: any): string | undefined {
  // ✅ เอาเฉพาะ key ที่เป็น "ชื่อโรค" จริง ๆ
  const candidates = [
    state?.diseaseNameTh, // ✅ ของจริงใน store คุณ
    state?.diseaseName, // เผื่อบางไฟล์ใช้ชื่ออื่น
    state?.disease_name_th,
    state?.diseaseTH,
    state?.diseaseTh,
    state?.diseaseLabel,
    state?.selectedDiseaseName,
  ];

  for (const v of candidates) {
    const s = String(v ?? "").trim();
    // ✅ กันพลาด: อย่าให้ชื่อโรคกลายเป็น Dxx
    if (s && !/^D\d{2}$/i.test(s)) return s;
  }

  return undefined;
}

export async function composeAINarrativePayload(
  extraNotes?: string
): Promise<AINarrativePayload> {
  const state = useDashboardStore.getState() as any;

  const province = String(state?.province ?? "").trim();
  const start_date = String(state?.start_date ?? "").trim();
  const end_date = String(state?.end_date ?? "").trim();

  const diseaseCode = String(state?.diseaseCode ?? "").trim();
  const diseaseName = pickDiseaseNameFromStore(state);

  if (!province) throw new Error("กรุณาเลือกจังหวัด");
  if (!start_date || !end_date) throw new Error("กรุณาเลือกระยะเวลา");

  // ✅ สำคัญมาก: ต้องมีโรค
  if (!diseaseCode) {
    throw new Error("กรุณาเลือกโรคก่อนกด Generate");
  }

  // ✅ ใส่ diseaseCode ไปทุก API (แก้เปลี่ยนโรคแล้วข้อมูลไม่เปลี่ยน)
  const base = qs({
    start_date,
    end_date,
    province,
    disease: diseaseCode,
  });

  const [
    overview,
    agePatients,
    ageDeaths,
    genderPatientsArr,
    genderDeaths,
    genderTrend,
  ] = await Promise.all([
    fetchJsonOrThrow<DashBoardOverview>(`/api/dashBoard${base}`),
    fetchJsonOrThrow<AgePatientsRow[]>(`/api/dashBoard/age-group${base}`),
    fetchJsonOrThrow<AgeDeathsRow[]>(`/api/dashBoard/age-group-deaths${base}`),
    fetchJsonOrThrow<GenderPatientsRow[]>(`/api/dashBoard/gender-patients${base}`),
    fetchJsonOrThrow<GenderDeathsRow[]>(`/api/dashBoard/gender-deaths${base}`),
    fetchJsonOrThrow<MonthlyGenderTrendRow[]>(`/api/dashBoard/gender-trend${base}`),
  ]);

  const gp =
    genderPatientsArr?.[0] ?? { male: 0, female: 0, unknown: 0, province };

  // ✅ คำนวณ total ต่อเดือนไว้ให้ AI ใช้โดยตรง
  const monthlyTotals = (genderTrend ?? [])
    .map((m) => ({
      month: m.month,
      total: (m.male || 0) + (m.female || 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    timeRange: { start: start_date, end: end_date },
    province,

    // ✅ ส่ง code แน่นอน
    diseaseCode,

    // ✅ ส่งชื่อโรคจริง (ถ้าไม่มีให้ /api/ai/generate ไปดึง DB เอง)
    diseaseName,

    overview,
    byAge: { patients: agePatients ?? [], deaths: ageDeaths ?? [] },
    byGender: {
      patients: {
        male: Number(gp.male || 0),
        female: Number(gp.female || 0),
        unknown: Number(gp.unknown || 0),
      },
      deaths: (genderDeaths ?? []).map((d) => ({
        gender: d.gender,
        value: Number(d.value || 0),
      })),
    },
    monthlyGenderTrend: (genderTrend ?? []).sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
    extraNotes,
    precomputed: { monthlyTotals },
  };
}
