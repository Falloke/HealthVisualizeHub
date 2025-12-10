// app/api/compareInfo/ai-narrative/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy สำหรับหน้า "เปรียบเทียบจังหวัด"
 * - รับ payload จาก client (ที่ได้จาก composeAINarrativePayload)
 * - forward ไปยัง /api/ai/generate
 * - ส่งผลลัพธ์กลับแบบเดิม ไม่เปลี่ยนรูปแบบ
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const targetUrl = new URL("/api/ai/generate", req.nextUrl.origin);

    const aiRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await aiRes.text();

    // ส่งต่อ status / content-type ตามของเดิม
    return new NextResponse(text, {
      status: aiRes.status,
      headers: {
        "Content-Type":
          aiRes.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch (err) {
    console.error("❌ API ERROR (compareInfo/ai-narrative):", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
