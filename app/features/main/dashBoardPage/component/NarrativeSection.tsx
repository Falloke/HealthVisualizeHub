// E:\HealtRiskHub\app\features\main\dashBoardPage\component\NarrativeSection.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { composeAINarrativePayload } from "../composePayload.client";
import { useDashboardStore } from "@/store/useDashboardStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

export default function NarrativeSection() {
  const router = useRouter();
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const [extraNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);

  // ✅ ซ่อน 100% จนกว่าจะกดปุ่มจาก Sidebar (event)
  const [visible, setVisible] = useState(false);

  // ✅ กันการยิงซ้ำ
  const inFlightRef = useRef(false);
  const lastTriggerAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const { province, start_date, end_date } = useDashboardStore();

  const scrollToNarrative = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("ai-narrative");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleGenerateAuthed = useCallback(async () => {
    const now = Date.now();
    if (inFlightRef.current) return;
    if (now - lastTriggerAtRef.current < 1500) return;
    lastTriggerAtRef.current = now;

    try {
      inFlightRef.current = true;
      setLoading(true);
      setArticle("");

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const payload = await composeAINarrativePayload(extraNotes);

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 429) {
        throw new Error(
          "AI โควต้าเต็ม/เรียกถี่เกินไป (429 Too Many Requests) — รอสักครู่แล้วลองใหม่"
        );
      }

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `AI failed (HTTP ${res.status})`);
      }

      setArticle(data.content);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      alert(msg);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [extraNotes]);

  const handleGenerate = useCallback(() => {
    if (!isAuthed) {
      setShowLockModal(true);
      return;
    }
    void handleGenerateAuthed();
  }, [isAuthed, handleGenerateAuthed]);

  // ✅ ฟัง event จาก Sidebar: ค่อย “โชว์” แล้ว scroll + generate
  useEffect(() => {
    const onExternalGenerate = () => {
      setVisible(true);

      // รอให้ Card render ก่อนแล้วค่อย scroll/generate
      requestAnimationFrame(() => {
        scrollToNarrative();
        handleGenerate();
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("ai:narrative:generate", onExternalGenerate as EventListener);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("ai:narrative:generate", onExternalGenerate as EventListener);
      }
    };
  }, [handleGenerate, scrollToNarrative]);

  function downloadTxt() {
    const blob = new Blob([article], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `narrative_${province || "all"}_${start_date}_${end_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ✅ ซ่อนแบบ “ไม่เห็นอะไรเลย”
  if (!visible) {
    return (
      <>
        {/* Popup ล็อกอินยังต้องทำงานได้ (ถ้าโดนเรียกจาก event ตอนยังไม่ล็อกอิน) */}
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
                ฟีเจอร์สร้างคำบรรยายอัตโนมัติ (AI Narrative) ใช้ได้เฉพาะสมาชิกเท่านั้น
                โปรดเข้าสู่ระบบหรือสมัครสมาชิกก่อน
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

  return (
    <>
      <Card id="ai-narrative" className="mt-6 scroll-mt-24">
        <CardHeader>
          <CardTitle>AI Narrative — คำอธิบายแดชบอร์ดอัตโนมัติ</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* แสดงเฉพาะตอนกำลังโหลด หรือมีบทความแล้ว */}
          {(loading || !!article) && (
            <div className="flex flex-wrap items-center gap-2">
              {article && (
                <Button variant="secondary" onClick={downloadTxt}>
                  ดาวน์โหลด .txt
                </Button>
              )}

              {loading && (
                <div className="text-sm text-muted-foreground">กำลังสร้างบทความ…</div>
              )}
            </div>
          )}

          {article && (
            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-4 leading-7">
              {article}
            </div>
          )}
        </CardContent>
      </Card>

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
              ฟีเจอร์สร้างคำบรรยายอัตโนมัติ (AI Narrative) ใช้ได้เฉพาะสมาชิกเท่านั้น
              โปรดเข้าสู่ระบบหรือสมัครสมาชิกก่อน
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
