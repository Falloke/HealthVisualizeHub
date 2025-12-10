// E:\HealtRiskHub\app\features\main\homePage\component\Pagedes.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import SourceInfo from "app/features/main/dashBoardPage/component/SourceInfo";
import GraphByProvince from "@/app/components/bargraph/GraphByProvince";
import { useDashboardStore } from "@/store/useDashboardStore";
import { composeAINarrativePayload } from "@/app/features/main/dashBoardPage/composePayload.client";

import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

const HomeMapInner = dynamic(() => import("./HomeMapInner"), { ssr: false });

const DESC_FULL_TEXT =
  "ระบบเว็บแอปพลิเคชันติดตามแบบเชิงรอบ วิเคราะห์ และนำเสนอข้อมูลโรคระบาดในระดับจังหวัดของประเทศไทย ผู้ใช้งานสามารถค้นหาเชื้อโรคเพื่อศึกษาลักษณะโรค วิธีป้องกัน และดูแนวโน้มการระบาดในแต่ละพื้นที่ นอกจากนี้ยังสามารถสร้างคำอธิบายกราฟอัตโนมัติด้วย AI เพื่อช่วยให้ผู้ใช้งานที่ไม่มีพื้นฐานด้านข้อมูลเข้าใจได้ง่ายขึ้น";

export default function PageDescription() {
  const router = useRouter();
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const { province, start_date, end_date } = useDashboardStore();

  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);

  async function handleGenerateAuthed() {
    try {
      setLoading(true);
      setArticle("");
      const payload = await composeAINarrativePayload("");
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "AI failed");
      setArticle(data.content);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate() {
    if (!isAuthed) {
      setShowLockModal(true);
      return;
    }
    void handleGenerateAuthed();
  }

  function downloadTxt() {
    const blob = new Blob([article], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `narrative_${province}_${start_date}_${end_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col">
      {/* Header */}
      <header className="flex-none rounded-xl bg-gradient-to-r from-pink-100 via-pink-50 to-white px-5 py-4 md:px-6 md:py-5">
        <h1 className="text-[18px] font-extrabold tracking-tight text-pink-700 md:text-[20px]">
          ระบบวิเคราะห์โรคระบาดระดับจังหวัดในประเทศไทย
        </h1>
        <div className="mt-1 max-w-5xl text-[15px] leading-7 text-neutral-800 md:text-[16px]">
          {DESC_FULL_TEXT}
        </div>
      </header>

      {/* เนื้อหาหลัก */}
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]">
        {/* ซ้าย: กราฟ → AI Narrative → แหล่งข้อมูล */}
        <section className="grid content-start gap-4">
          {/* กราฟ */}
          <div className="card p-3.5 md:p-4">
            <GraphByProvince compact />
          </div>

          {/* ✅ AI Narrative — อยู่ใต้กราฟ เหนือแหล่งข้อมูล */}
          <Card className="p-3.5 md:p-4">
            <CardHeader className="p-0">
              <CardTitle>AI Narrative — คำอธิบายหน้าแรก</CardTitle>
            </CardHeader>
            <CardContent className="mt-3 space-y-3 p-0">
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleGenerate} disabled={loading}>
                  {loading ? "กำลังสร้างบทความ…" : "Generate Narrative"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={downloadTxt}
                  disabled={!article}
                  title={!article ? "สร้างบทความก่อนจึงจะดาวน์โหลดได้" : ""}
                >
                  ดาวน์โหลด .txt
                </Button>
              </div>

              {article && (
                <div className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-4 leading-7">
                  {article}
                </div>
              )}
            </CardContent>
          </Card>

          {/* แหล่งที่มาของข้อมูล */}
          <div className="card p-3 md:p-3.5">
            <div className="text-[14px] leading-6">
              <SourceInfo />
            </div>
          </div>
        </section>

        {/* ขวา: แผนที่ */}
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
            <div className="mb-3 text-lg font-semibold text-gray-900">ต้องล็อกอินเพื่อใช้งานฟีเจอร์นี้</div>
            <div className="mb-5 text-sm text-gray-600">
              ฟีเจอร์สร้างคำบรรยายอัตโนมัติ (AI Narrative) ใช้ได้เฉพาะสมาชิกเท่านั้น โปรดเข้าสู่ระบบหรือสมัครสมาชิกก่อน
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
          background: #fff;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
      `}</style>
    </div>
  );
}
