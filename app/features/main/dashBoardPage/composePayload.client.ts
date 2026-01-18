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

type GenderDeathsRow = { gender: "ชาย" | "หญิง"; value: number };
type MonthlyGenderTrendRow = { month: string; male: number; female: number };

// payload ที่จะส่งเข้า /api/ai/generate
export type AINarrativePayload = {
  timeRange: { start: string; end: string };
  province: string;
  disease?: string;
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

export async function composeAINarrativePayload(extraNotes?: string): Promise<AINarrativePayload> {
  const { province, start_date, end_date } = useDashboardStore.getState();
  if (!province) throw new Error("กรุณาเลือกจังหวัด");
  if (!start_date || !end_date) throw new Error("กรุณาเลือกระยะเวลา");

  const base = qs({ start_date, end_date, province });

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

  const gp = genderPatientsArr?.[0] ?? { male: 0, female: 0, unknown: 0, province };

  // ✅ คำนวณ total ต่อเดือนไว้ให้ AI ใช้โดยตรง
  const monthlyTotals = (genderTrend ?? [])
    .map((m) => ({ month: m.month, total: (m.male || 0) + (m.female || 0) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const payload: AINarrativePayload = {
    timeRange: { start: start_date, end: end_date },
    province,
    disease: "ไข้หวัดใหญ่ (D01)",
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
    monthlyGenderTrend: (genderTrend ?? []).sort((a, b) => a.month.localeCompare(b.month)),
    extraNotes,
    precomputed: { monthlyTotals },
  };

  return payload;
}
