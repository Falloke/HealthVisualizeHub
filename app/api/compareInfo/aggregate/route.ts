import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AggResp = {
  ok: boolean;
  data?: {
    provincePatients?: any;
    provinceDeaths?: any;
    regionTop5?: any;
    agePatients?: any;
    ageDeaths?: any;
    genderPatients?: any;
    genderDeaths?: any;
    genderTrend?: any;
  };
  error?: string;
};

async function fetchJson(req: NextRequest, pathname: string, params: Record<string, string>) {
  const url = new URL(pathname, req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    let msg = text || `Fetch failed: ${pathname}`;
    try {
      const j = text ? JSON.parse(text) : null;
      if (j?.error) msg = `[${pathname}] ${j.error}`;
      else msg = `[${pathname}] ${msg}`;
    } catch {
      msg = `[${pathname}] ${msg}`;
    }
    throw new Error(msg);
  }

  return text ? JSON.parse(text) : null;
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;

    // ✅ ให้ใช้ disease เป็นค่าหลัก (route อื่นก็อ่าน disease/disease_code/code ได้)
    const disease = (p.get("disease") || p.get("disease_code") || p.get("code") || "D01").trim();
    const start_date = (p.get("start_date") || "2024-01-01").trim();
    const end_date = (p.get("end_date") || "2024-12-31").trim();
    const mainProvince = (p.get("mainProvince") || "").trim();
    const compareProvince = (p.get("compareProvince") || "").trim();

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<AggResp>(
        { ok: false, error: "ต้องระบุ mainProvince และ compareProvince" },
        { status: 400 }
      );
    }

    const baseParams = { disease, start_date, end_date, mainProvince, compareProvince };

    const [
      provincePatients,
      provinceDeaths,
      regionTop5,
      agePatients,
      ageDeaths,
      genderPatients,
      genderDeaths,
      genderTrend,
    ] = await Promise.all([
      fetchJson(req, "/api/compareInfo/province-patients", baseParams),
      fetchJson(req, "/api/compareInfo/province-deaths", baseParams),
      fetchJson(req, "/api/compareInfo/region-top5", baseParams),
      fetchJson(req, "/api/compareInfo/age-group", baseParams),
      fetchJson(req, "/api/compareInfo/age-group-deaths", baseParams),
      fetchJson(req, "/api/compareInfo/gender-patients", baseParams),
      fetchJson(req, "/api/compareInfo/gender-deaths", baseParams),
      fetchJson(req, "/api/compareInfo/gender-trend", baseParams),
    ]);

    return NextResponse.json<AggResp>(
      {
        ok: true,
        data: {
          provincePatients,
          provinceDeaths,
          regionTop5,
          agePatients,
          ageDeaths,
          genderPatients,
          genderDeaths,
          genderTrend,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("❌ API ERROR (compareInfo/aggregate):", err);
    return NextResponse.json<AggResp>(
      { ok: false, error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
