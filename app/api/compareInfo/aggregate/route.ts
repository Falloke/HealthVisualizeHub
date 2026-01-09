import { NextRequest, NextResponse } from "next/server";

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
  const url = new URL(pathname, req.url);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Fetch failed: ${pathname}`);
  return text ? JSON.parse(text) : null;
}

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;

    const start_date = p.get("start_date") || "2024-01-01";
    const end_date = p.get("end_date") || "2024-12-31";
    const mainProvince = p.get("mainProvince") || "";
    const compareProvince = p.get("compareProvince") || "";

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<AggResp>(
        { ok: false, error: "ต้องระบุ mainProvince และ compareProvince" },
        { status: 400 }
      );
    }

    const baseParams = { start_date, end_date, mainProvince, compareProvince };

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

    return NextResponse.json<AggResp>({
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
    });
  } catch (err: any) {
    console.error("❌ API ERROR (compareInfo/aggregate):", err);
    return NextResponse.json<AggResp>(
      { ok: false, error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
