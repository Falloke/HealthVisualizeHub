// D:\HealtRiskHub\store\useDashboardStore.ts
import { create } from "zustand";

type DashboardState = {
  province: string;
  start_date: string;
  end_date: string;

  // ✅ เก็บรหัสโรค เช่น D01, D04
  diseaseCode: string;

  // ✅ เก็บชื่อโรคภาษาไทย เช่น "ไข้หวัดใหญ่"
  diseaseNameTh: string;

  // ✅ alias รองรับของเก่า (บาง API/กราฟอาจอ่าน disease)
  // ⚠️ ต้องเป็น "รหัสโรค" เท่านั้น (ไม่ใช่ชื่อ)
  disease: string;

  setProvince: (p: string) => void;
  setDateRange: (start: string, end: string) => void;

  // ✅ set โรค (code + thai name)
  setDisease: (code: string, nameTh: string) => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  province: "กรุงเทพมหานคร",
  start_date: "2024-01-01",
  end_date: "2024-06-30",

  diseaseCode: "D01",
  diseaseNameTh: "ไข้หวัดใหญ่",

  // ✅ alias = diseaseCode
  disease: "D01",

  setProvince: (p) => set({ province: (p || "").trim() }),

  setDateRange: (start, end) => {
    const s = (start || "").trim();
    const e = (end || "").trim();
    set({ start_date: s, end_date: e });
  },

  setDisease: (code, nameTh) => {
    const c = (code || "").trim();
    const n = (nameTh || "").trim();

    // ✅ สำคัญมาก: ต้องอัปเดตทั้ง diseaseCode และ disease (alias)
    set({
      diseaseCode: c,
      disease: c,
      diseaseNameTh: n,
    });
  },
}));
