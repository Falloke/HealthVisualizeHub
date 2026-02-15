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

function safeJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

export default function CompareNarrativeSection({ prefetchedPayload }: Props) {
  const router = useRouter();

  const province = useDashboardStore((s) => s.province);
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);

  const mainProvince = useCompareStore((s) => s.mainProvince);
  const compareProvince = useCompareStore((s) => s.compareProvince);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBoth = !!mainProvince && !!compareProvince;

  const baseProvince = useMemo(() => {
    return province || mainProvince || compareProvince || "ยังไม่ได้เลือกจังหวัด";
  }, [province, mainProvince, compareProvince]);

  const sectionRef = useRef<HTMLDivElement | null>(null);
  const lastTriggerAtRef = useRef(0);

  const scrollToMe = () => {
    const el = sectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

- จังหวัดหลักใน field "province" ของ JSON คือ "${baseProvince}"
- จังหวัดที่ผู้อ่านใช้เปรียบเทียบชื่อ "${compareProvince}"

ข้อกำหนดสำคัญสำหรับรายงานนี้:
1. ทุกหัวข้อของรายงานต้องมี 1–2 ประโยคที่พูดถึงการ "เปรียบเทียบ" ระหว่าง "${baseProvince}" กับ "${compareProvince}" โดยระบุชื่อจังหวัดชัดเจน
2. ห้ามสร้างตัวเลขของจังหวัด "${compareProvince}" ขึ้นมาเอง ถ้าไม่มีตัวเลขใน JSON ให้เปรียบเทียบเชิงคุณภาพเท่านั้น
3. ต้องเชื่อมโยงว่าข้อมูลจังหวัดหลักใช้เป็นฐานดูความต่างกับ "${compareProvince}" อย่างไร
      `.trim();

      const payload: AINarrativePayload = prefetchedPayload
        ? {
            ...prefetchedPayload,
            extraNotes: [prefetchedPayload.extraNotes, compareNote]
              .filter(Boolean)
              .join("\n\n"),
          }
        : await composeAINarrativePayload(compareNote);

      const res = await fetch("/api/compareInfo/ai-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text().catch(() => "");
      const data = safeJson(text);

      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) || text || "AI request failed";
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
    a.download = `compare_narrative_${baseProvince}_กับ_${compareProvince}_${start_date}_${end_date}.txt`;
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

    window.addEventListener("ai:compare:narrative:generate", onTrigger);
    window.addEventListener("ai:narrative:generate", onTrigger);

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
      window.removeEventListener("ai:narrative:generate", onTrigger);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBoth, baseProvince, compareProvince, start_date, end_date]);

  const shouldShow = expanded || loading || !!article || !!error;

  if (!shouldShow) return <div ref={sectionRef} />;

  return (
    <>
      <div ref={sectionRef} className="mt-6 scroll-mt-24">
        <Card>
          {/* ✅ หัวข้อกล่อง ตามที่ขอ */}
          <CardHeader>
            <CardTitle>AI Narrative — คำอธิบายแดชบอร์ดอัตโนมัติ</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* ✅ ไม่มีปุ่ม Generate แล้ว (กดจาก sidebar เท่านั้น) */}

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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowLockModal(false)}
          />
          <div className="relative z-10 w-[92%] max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 text-lg font-semibold text-gray-900">
              ต้องล็อกอินเพื่อใช้งานฟีเจอร์นี้
            </div>
            <div className="mb-5 text-sm text-gray-600">
              ฟีเจอร์สร้างคำบรรยายการเปรียบเทียบอัตโนมัติ (AI Narrative)
              ใช้ได้เฉพาะสมาชิกเท่านั้น โปรดเข้าสู่ระบบหรือสมัครสมาชิกก่อน
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowLockModal(false)}
                className="border"
              >
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
