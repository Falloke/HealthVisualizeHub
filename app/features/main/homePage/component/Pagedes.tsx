"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import HomeSidebar from "@/app/components/sidebar/HomeSidebar";

import SourceInfo from "app/features/main/dashBoardPage/component/SourceInfo";
import GraphByProvince from "@/app/components/bargraph/GraphByProvince";
import { useDashboardStore } from "@/store/useDashboardStore";
import { composeAINarrativePayload } from "@/app/features/main/dashBoardPage/composePayload.client";

import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

const HomeMapInner = dynamic(() => import("./HomeMapInner"), { ssr: false });

const DESC_FULL_TEXT =
  "ระบบเว็บแอปพลิเคชันติดตามแบบเชิงรอบ วิเคราะห์ และนำเสนอข้อมูลโรคระบาดในระดับจังหวัดของประเทศไทย ผู้ใช้งานสามารถค้นหาเชื้อโรคเพื่อศึกษาลักษณะโรค วิธีป้องกัน และดูแนวโน้มการระบาดในแต่ละพื้นที่ นอกจากนี้ยังสามารถสร้างคำอธิบายกราฟอัตโนมัติด้วย AI เพื่อช่วยให้ผู้ใช้งานที่ไม่มีพื้นฐานด้านข้อมูลเข้าใจได้ง่ายขึ้น";

const HOME_NARRATIVE_EVENT = "ai:home:narrative:generate";
const CLIENT_COOLDOWN_MS = 1500;

export default function PageDescription() {
  const router = useRouter();
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const { province, start_date, end_date } = useDashboardStore();

  // ✅ ซ่อน AI section ไว้ก่อน
  const [narrativeVisible, setNarrativeVisible] = useState(false);

  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);

  // ✅ กันยิงซ้ำ
  const inFlightRef = useRef(false);
  const lastTriggerAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToHomeNarrative = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("home-ai-narrative");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleGenerateAuthed = useCallback(async () => {
    const now = Date.now();
    if (inFlightRef.current) return;
    if (now - lastTriggerAtRef.current < CLIENT_COOLDOWN_MS) return;
    lastTriggerAtRef.current = now;

    try {
      inFlightRef.current = true;
      setLoading(true);
      setArticle("");

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const payload = await composeAINarrativePayload("");

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.status === 429) {
        throw new Error("AI โควต้าเต็ม/เรียกถี่เกินไป (429) — รอสักครู่แล้วลองใหม่");
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
  }, []);

  const handleGenerate = useCallback(() => {
    if (!isAuthed) {
      setShowLockModal(true);
      return;
    }
    void handleGenerateAuthed();
  }, [isAuthed, handleGenerateAuthed]);

  // ✅ ฟัง event จากปุ่มใหม่ใน HomeSidebar
  useEffect(() => {
    const onGenerate = () => {
      setNarrativeVisible(true);

      requestAnimationFrame(() => {
        scrollToHomeNarrative();
        handleGenerate();
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener(HOME_NARRATIVE_EVENT, onGenerate as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(HOME_NARRATIVE_EVENT, onGenerate as EventListener);
      }
    };
  }, [handleGenerate, scrollToHomeNarrative]);

  function downloadTxt() {
    const safeProvince = (province || "all").replaceAll(" ", "_");
    const blob = new Blob([article], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `home_narrative_${safeProvince}_${start_date}_${end_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-10 2xl:px-14 flex flex-col">
      {/* Header – กรอบฟ้า */}
      <header className="flex-none rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-sky-100 to-sky-200/50 px-5 py-4 md:px-6 md:py-5">
        <h1 className="text-[18px] font-extrabold tracking-tight text-sky-800 md:text-[20px]">
          ระบบวิเคราะห์โรคระบาดระดับจังหวัดในประเทศไทย
        </h1>
        <div className="mt-1 max-w-5xl text-[15px] leading-7 text-gray-800 md:text-[16px]">
          {DESC_FULL_TEXT}
        </div>
      </header>

      {/* ตัวกรอง: ใต้ header */}
      <div className="mt-4">
        <HomeSidebar />
      </div>

      {/* เนื้อหาหลัก */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]">
        <section className="grid content-start gap-4">
          <div className="card p-3.5 md:p-4">
            <GraphByProvince compact />
          </div>

          {/* ✅ ซ่อน AI Narrative ทั้งก้อนจนกว่าจะกดปุ่ม Generate ใหม่ */}
          {narrativeVisible && (
            <Card id="home-ai-narrative" className="p-3.5 md:p-4 scroll-mt-24">
              <CardHeader className="p-0">
                <CardTitle>AI Narrative — คำอธิบายหน้าแรก</CardTitle>
              </CardHeader>

              <CardContent className="mt-3 space-y-3 p-0">
                {/* ✅ ลบปุ่ม Generate ตรงนี้ออก เหลือแค่ดาวน์โหลด + สถานะ */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={downloadTxt}
                    disabled={!article}
                    title={!article ? "ยังไม่มีบทความ (ให้กด Generate ด้านบนก่อน)" : ""}
                  >
                    ดาวน์โหลด .txt
                  </Button>

                  {loading && (
                    <div className="text-sm text-muted-foreground">
                      กำลังสร้างบทความ…
                    </div>
                  )}

                  {!loading && !article && (
                    <div className="text-sm text-muted-foreground">
                      กด <span className="font-medium">Generate Narrative</span> ด้านบนเพื่อสร้างคำอธิบาย
                    </div>
                  )}
                </div>

                {article && (
                  <div className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-4 leading-7">
                    {article}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="card p-3 md:p-3.5">
            <div className="text-[14px] leading-6">
              <SourceInfo />
            </div>
          </div>
        </section>

        <aside className="card p-3.5 md:p-4">
          <h2 className="mb-2 text-base font-semibold text-neutral-900 md:text-lg">
            แผนที่โรคระบาด
          </h2>
          <div className="min-h-[420px]">
            <HomeMapInner className="h-[520px] w-full md:h-[560px] lg:h-[600px]" />
          </div>
        </aside>
      </div>

      {/* Popup ต้องล็อกอิน */}
      {showLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLockModal(false)} />
          <div className="relative z-10 w-[92%] max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-3 text-lg font-semibold text-gray-900">
              ต้องล็อกอินเพื่อใช้งานฟีเจอร์นี้
            </div>
            <div className="mb-5 text-sm text-gray-600">
              ฟีเจอร์สร้างคำบรรยายอัตโนมัติ (AI Narrative) ใช้ได้เฉพาะสมาชิกเท่านั้น
              โปรดเข้าสู่ระบบหรือสมัครสมาชิกก่อน
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

      <style jsx>{`
        .card {
          position: relative;
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
      `}</style>
    </div>
  );
}
