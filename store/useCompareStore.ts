// store/useCompareStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type CompareState = {
  mainProvince: string | null;
  compareProvince: string | null;
  setMainProvince: (p: string | null) => void;
  setCompareProvince: (p: string | null) => void;
  swapProvince: () => void;
  reset: () => void;
};

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      // ค่าตั้งต้น (ถ้าใน localStorage มีอยู่แล้ว จะถูก override ตอน rehydrate)
      mainProvince: null,
      compareProvince: null,

      setMainProvince: (p) => set({ mainProvince: p }),
      setCompareProvince: (p) => set({ compareProvince: p }),

      // สลับจังหวัดหลัก ↔ จังหวัดเปรียบเทียบ (ถ้ามีใช้)
      swapProvince: () => {
        const { mainProvince, compareProvince } = get();
        set({
          mainProvince: compareProvince,
          compareProvince: mainProvince,
        });
      },

      // ใช้เวลาอยากเคลียร์ค่าที่เลือกทั้งหมด
      reset: () => set({ mainProvince: null, compareProvince: null }),
    }),
    {
      name: "hrh-compare-store", // key ที่ใช้เก็บใน localStorage
      version: 1,
    }
  )
);
