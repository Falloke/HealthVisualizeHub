// app/features/main/comparePage/component/CompareNarrativeSection.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

import {
  composeAINarrativePayload,
  type AINarrativePayload,
} from "../../dashBoardPage/composePayload.client";

import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

type Props = {
  prefetchedPayload?: AINarrativePayload | null;
};

/** -----------------------------
 * Types: ให้ตรงกับ generateCompare
 * ------------------------------*/
type ProvinceBlock = {
  province: string;
  overview: any;
  byAge: any;
  byGender: any;
  monthlyGenderTrend: any[];
  regionName?: string;
  regionComparison?: any;
  extraNotes?: string;
  precomputed?: any;
};

type ComparePayload = {
  timeRange: { start: string; end: string };
  diseaseCode?: string;
  diseaseName?: string;
  disease?: string;

  mainProvince: string;
  compareProvince: string;
  mainData: ProvinceBlock;
  compareData: ProvinceBlock;

  compareNotes?: string;
};

/** -----------------------------
 * helpers
 * ------------------------------*/
function safeJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

/** อ่าน field ที่อาจ “ไม่มีใน type AINarrativePayload” แบบปลอดภัย */
function getExtra<T = any>(p: AINarrativePayload, key: string, fallback?: T): T {
  const v = (p as any)?.[key];
  return (v ?? fallback) as T;
}

function toProvinceBlock(p: AINarrativePayload, overrideProvince?: string): ProvinceBlock {
  return {
    province: overrideProvince ?? (p as any).province,
    overview: (p as any).overview,
    byAge: (p as any).byAge,
    byGender: (p as any).byGender,
    monthlyGenderTrend: ((p as any).monthlyGenderTrend ?? []) as any[],

    // optional fields (บางโปรเจคมี บางโปรเจคไม่มี)
    regionName: getExtra<string>(p, "regionName", undefined),
    regionComparison: getExtra<any>(p, "regionComparison", undefined),
    extraNotes: getExtra<string>(p, "extraNotes", undefined),
    precomputed: getExtra<any>(p, "precomputed", undefined),
  };
}

/** ดึงชื่อโรคจาก store แบบ “ไม่พัง type” */
function useDiseaseNameFromStore(): string {
  // ถ้า store ของคุณใช้ field ชื่ออื่น ให้ใส่เพิ่มในนี้ได้
  return useDashboardStore((s: any) => {
    return (
      String(
        s?.diseaseName ??
          s?.disease_name ??
          s?.diseaseNameTh ??
          s?.disease_name_th ??
          ""
      ).trim()
    );
  });
}

export default function CompareNarrativeSection({ prefetchedPayload }: Props) {
  const router = useRouter();

  const province = useDashboardStore((s) => s.province);
  const setProvince = useDashboardStore((s) => s.setProvince);

  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);

  const diseaseCode = useDashboardStore((s) => s.diseaseCode);
  const diseaseName = useDiseaseNameFromStore();

  const mainProvince = useCompareStore((s) => s.mainProvince);
  const compareProvince = useCompareStore((s) => s.compareProvince);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBoth = !!mainProvince && !!compareProvince;

  const sectionRef = useRef<HTMLDivElement | null>(null);
  const lastTriggerAtRef = useRef(0);

  const scrollToMe = () => {
    const el = sectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const baseProvince = useMemo(() => {
    return province || mainProvince || compareProvince || "ยังไม่ได้เลือกจังหวัด";
  }, [province, mainProvince, compareProvince]);

  async function handleGenerate(fromSidebar = false) {
    setExpanded(true);
    if (fromSidebar) window.setTimeout(() => scrollToMe(), 50);

    if (!hasBoth) {
      setArticle("");
      setError("กรุณาเลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบให้ครบก่อน");
      return;
    }

    const session = await getSession();
    if (!session) {
      setShowLockModal(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setArticle("");

      const compareNote = `
โหมดการใช้งาน: หน้า "เปรียบเทียบจังหวัด"
- จังหวัดหลัก: "${mainProvince}"
- จังหวัดเปรียบเทียบ: "${compareProvince}"

ข้อกำหนดสำคัญ:
1) ทุกหัวข้อควรกล่าวถึงการเปรียบเทียบระหว่าง 2 จังหวัดนี้
2) ห้ามสร้างตัวเลขเอง ถ้าไม่มีใน JSON ให้เขียนว่า "ไม่มีข้อมูลเพียงพอ"
`.trim();

      /**
       * ✅ วิธีทำ “2 จังหวัด”:
       * - เปลี่ยน store.province ชั่วคราว แล้วเรียก compose 2 รอบ
       * - จากนั้น restore กลับ
       */
      const originalProvince = province;

      // --- MAIN ---
      setProvince(mainProvince!);

      const mainPayload: AINarrativePayload = prefetchedPayload
        ? ({
            ...prefetchedPayload,
            // บังคับ province ให้ตรงกับ main
            province: mainProvince!,
            // เติม note ให้ชัดว่าเป็น compare
            extraNotes: [getExtra(prefetchedPayload, "extraNotes", ""), compareNote]
              .filter(Boolean)
              .join("\n\n"),
          } as any)
        : await composeAINarrativePayload(compareNote);

      // --- COMPARE ---
      setProvince(compareProvince!);
      const comparePayload: AINarrativePayload = await composeAINarrativePayload(compareNote);

      // --- RESTORE ---
      setProvince(originalProvince || mainProvince!);

      // ดึง disease จาก payload แบบปลอดภัย (กัน type ไม่มี field)
      const payloadDiseaseCode =
        String(getExtra<string>(mainPayload, "diseaseCode", "") || diseaseCode || "").trim() ||
        undefined;

      const payloadDiseaseName =
        String(getExtra<string>(mainPayload, "diseaseName", "") || diseaseName || "").trim() ||
        undefined;

      const payloadDisease =
        String(getExtra<string>(mainPayload, "disease", "") || "").trim() || undefined;

      const reqPayload: ComparePayload = {
        timeRange: (mainPayload as any).timeRange ?? { start: start_date ?? "", end: end_date ?? "" },

        diseaseCode: payloadDiseaseCode,
        diseaseName: payloadDiseaseName,
        disease: payloadDisease,

        mainProvince: mainProvince!,
        compareProvince: compareProvince!,

        mainData: toProvinceBlock(mainPayload, mainProvince!),
        compareData: toProvinceBlock(comparePayload, compareProvince!),

        compareNotes: compareNote,
      };

      // ✅ ยิงไป proxy ของ compareInfo (ให้ไปใช้ generateCompare ฝั่ง api)
      const res = await fetch("/api/compareInfo/ai-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqPayload),
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      const data = safeJson(text);

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || text || "AI request failed";
        throw new Error(msg);
      }
      if (!data || !data.ok) {
        throw new Error((data && data.error) || "AI failed");
      }

      setArticle(String(data.content ?? ""));
      window.setTimeout(() => scrollToMe(), 80);
    } catch (e: any) {
      console.error("❌ Compare AI Narrative error:", e);
      setError(e?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  function downloadTxt() {
    if (!article) return;
    const blob = new Blob([article], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
<<<<<<< HEAD
    a.download = `compare_narrative_${mainProvince}_vs_${compareProvince}_${start_date}_${end_date}.txt`;
=======
    a.download = `compare_narrative_${baseProvince}_กับ_${compareProvince}_${start_date}_${end_date}.txt`;
>>>>>>> feature/Method_F&Method_G
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onTrigger = () => {
      const now = Date.now();
      if (now - lastTriggerAtRef.current < 500) return;
      lastTriggerAtRef.current = now;
      handleGenerate(true);
    };

    // ✅ ฟังเฉพาะ event compare เพื่อไม่ยิงซ้ำ
    window.addEventListener("ai:compare:narrative:generate", onTrigger);

    // รองรับ pending จาก sidebar
    const pending = (window as any).__HHUB_COMPARE_NARRATIVE_PENDING__;
    if (pending && typeof pending === "number") {
      const age = Date.now() - pending;
      if (age >= 0 && age <= 8000) {
        (window as any).__HHUB_COMPARE_NARRATIVE_PENDING__ = null;
        window.setTimeout(() => onTrigger(), 120);
      }
    }

    return () => {
      window.removeEventListener("ai:compare:narrative:generate", onTrigger);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBoth, mainProvince, compareProvince, start_date, end_date]);

  const shouldShow = expanded || loading || !!article || !!error;
  if (!shouldShow) return <div ref={sectionRef} />;

  return (
    <>
      <div ref={sectionRef} className="mt-6 scroll-mt-24">
        <Card>
          <CardHeader>
            <CardTitle>AI Narrative — คำอธิบายแดชบอร์ดอัตโนมัติ</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}

            {loading && (
              <div className="rounded-lg bg-muted p-4 text-sm text-gray-700">
                กำลังสร้างคำอธิบาย… โปรดรอสักครู่
              </div>
            )}

            {article && (
              <>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="secondary" onClick={downloadTxt}>
                    ดาวน์โหลด .txt
                  </Button>
                </div>

                <div className="whitespace-pre-wrap rounded-lg bg-muted p-4 leading-7">
                  {article}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {showLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLockModal(false)} />
          <div className="relative z-10 w-[92%] max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 text-lg font-semibold text-gray-900">ต้องล็อกอินเพื่อใช้งานฟีเจอร์นี้</div>
            <div className="mb-5 text-sm text-gray-600">
              ฟีเจอร์สร้างคำบรรยายการเปรียบเทียบอัตโนมัติ (AI Narrative)
              ใช้ได้เฉพาะสมาชิกเท่านั้น โปรดเข้าสู่ระบบหรือสมัครสมาชิกก่อน
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowLockModal(false)} className="border">
                ปิด
              </Button>
              <Button variant="secondary" onClick={() => router.push("/register")}>
                Register
              </Button>
              <Button onClick={() => router.push("/login")}>Login</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
