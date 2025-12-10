// E:\HealtRiskHub\app\features\main\dashBoardPage\component\NarrativeSection.tsx
"use client";

import { useState } from "react";
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

  const [extraNotes] = useState(""); // ถ้าอยากเปิดช่องโน้ตค่อยนำมาใช้
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);

  const { province, start_date, end_date } = useDashboardStore();

  async function handleGenerateAuthed() {
    try {
      setLoading(true);
      setArticle("");
      const payload = await composeAINarrativePayload(extraNotes);
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
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>AI Narrative — คำอธิบายแดชบอร์ดอัตโนมัติ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
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
            <div className="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-4 leading-7">
              {article}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Popup แบบไม่พึ่งไลบรารี เพิ่มเติม */}
      {showLockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          {/* ฉากหลัง */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowLockModal(false)}
          />

          {/* กล่องโหมดัล */}
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
              <Button
                variant="secondary"
                onClick={() => router.push("/register")}
              >
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
