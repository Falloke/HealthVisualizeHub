// app/api/debug/resolve-table/route.ts
import { NextResponse } from "next/server";
import { resolveDiseaseAndTable } from "@/lib/dashboard/resolveDiseaseAndTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const disease = searchParams.get("disease") || "D04";

  try {
    const r = await resolveDiseaseAndTable(disease);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
