// app/features/main/comparePage/component/CompareNarrativeSection.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";
import { composeAINarrativePayload } from "../../dashBoardPage/composePayload.client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

export default function CompareNarrativeSection() {
  const router = useRouter();
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const { province, start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState("");
  const [showLockModal, setShowLockModal] = useState(false);

  // ต้องเลือกทั้งจังหวัดหลักและจังหวัดที่เปรียบเทียบให้ครบ
  const hasBoth = !!mainProvince && !!compareProvince;

  // จังหวัดฐานหลักที่ใช้ใน payload (เอา current province ก่อน แล้วค่อย fallback)
  const baseProvince =
    province || mainProvince || compareProvince || "ยังไม่ได้เลือกจังหวัด";

  // ----------------- สร้าง AI Narrative -----------------
  async function handleGenerateAuthed() {
    // ถ้ายังไม่เลือกจังหวัดครบ 2 จังหวัด ห้าม gen
    if (!hasBoth) {
      alert("กรุณาเลือกจังหวัดหลัก และจังหวัดที่ต้องการเปรียบเทียบให้ครบก่อน");
      return;
    }

    try {
      setLoading(true);
      setArticle("");

      // คำสั่งพิเศษที่ให้ AI เน้น "เปรียบเทียบสองจังหวัด" ในทุกหัวข้อ
      const compareNote = `
โหมดการใช้งาน: หน้า "เปรียบเทียบจังหวัด"

- จังหวัดหลักใน field "province" ของ JSON คือ "${baseProvince}"
- จังหวัดที่ผู้อ่านใช้เปรียบเทียบชื่อ "${compareProvince}"

ข้อกำหนดสำคัญสำหรับรายงานนี้:
1. ทุกหัวข้อของรายงาน (**รายงานสถานการณ์**, **แนวโน้มรายเดือน**, **การเปรียบเทียบจังหวัดกับภูมิภาค**, **การกระจายตามกลุ่มอายุ**, **เปรียบเทียบเพศ**, **ข้อเสนอแนะเชิงปฏิบัติ**, **สรุปย่อ**) ต้องมีอย่างน้อย 1–2 ประโยคที่พูดถึงการ "เปรียบเทียบ" ระหว่างจังหวัดหลัก "${baseProvince}" กับจังหวัดที่ใช้เปรียบเทียบ "${compareProvince}" โดยระบุชื่อจังหวัดให้ชัดเจน
2. ห้ามสร้างตัวเลขของจังหวัด "${compareProvince}" ขึ้นมาเอง ถ้าไม่มีตัวเลขใน JSON ให้เปรียบเทียบเชิงคุณภาพเท่านั้น เช่น
   - ชี้แนะให้ผู้อ่านดูกราฟหรือแดชบอร์ดเพื่อเห็นว่าจังหวัดใดมีแนวโน้มสูง/ต่ำกว่า
   - หรือระบุว่า "ไม่มีตัวเลขของจังหวัดที่เปรียบเทียบในชุดข้อมูลนี้"
3. ในแต่ละหัวข้อให้เขียนเชื่อมโยงชัด ๆ ว่า ข้อมูลของจังหวัดหลักสามารถใช้เป็นฐานในการดูความแตกต่างกับจังหวัด "${compareProvince}" ได้อย่างไร (เช่น แนวโน้ม, กลุ่มอายุที่เด่น, เพศที่มีผู้ป่วยมากกว่า เป็นต้น)
`.trim();

      const payload = await composeAINarrativePayload(compareNote);

      // 🔁 เปลี่ยนให้เรียก API ใหม่ใต้ /compareInfo
      const res = await fetch("/api/compareInfo/ai-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // ถ้า parsing ไม่ได้ ให้ถือว่า error
        throw new Error("รูปแบบข้อมูลที่ได้จาก AI ไม่ถูกต้อง");
      }

      if (!data.ok) throw new Error(data.error || "AI failed");

      setArticle(data.content as string);
    } catch (e: any) {
      console.error("❌ Compare AI Narrative error:", e);
      alert(e?.message ?? "เกิดข้อผิดพลาด");
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
    if (!article) return;
    const blob = new Blob([article], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compare_narrative_${baseProvince}_${start_date}_${end_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----------------- UI -----------------
  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            AI Narrative — คำอธิบายการเปรียบเทียบแดชบอร์ดอัตโนมัติ
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            ระบบจะสร้างคำบรรยายอัตโนมัติจากตัวกรองปัจจุบัน โดยใช้จังหวัด{" "}
            <span className="font-semibold">{baseProvince}</span>{" "}
            เป็นฐานข้อมูลหลัก
            {hasBoth && (
              <>
                {" "}
                และใช้บริบทการเปรียบเทียบระหว่าง{" "}
                <span className="font-semibold">{mainProvince}</span> กับ{" "}
                <span className="font-semibold">{compareProvince}</span>
              </>
            )}
            .
          </p>

          {!hasBoth && (
            <p className="text-xs text-amber-600">
              (ต้องเลือกทั้งจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบ
              จึงจะสามารถสร้าง AI Narrative ได้)
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={loading || !hasBoth}
              title={
                !hasBoth
                  ? "กรุณาเลือกจังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบให้ครบก่อน"
                  : ""
              }
            >
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

      {/* Modal บังคับล็อกอิน */}
      {showLockModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-modal="true"
          role="dialog"
        >
          {/* ฉากดำด้านหลัง */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowLockModal(false)}
          />

          {/* กล่อง modal */}
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
