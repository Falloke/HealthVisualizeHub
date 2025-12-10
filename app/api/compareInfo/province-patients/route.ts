// app/api/compareInfo/province-patients/route.ts
import { NextRequest, NextResponse } from "next/server";

type ProvinceSummary = {
  province: string;
  region?: string | null;
  patients: number;
};

type APIResp = {
  ok: boolean;
  main?: ProvinceSummary;
  compare?: ProvinceSummary;
  error?: string;
};

// ใช้เรียก API /api/dashBoard/province-summary ที่มีอยู่แล้ว
async function fetchProvinceSummary(
  req: NextRequest,
  opts: { start_date: string; end_date: string; province: string }
): Promise<ProvinceSummary | null> {
  const { start_date, end_date, province } = opts;

  // สร้าง absolute URL จาก req.url (กันปัญหา fetch แบบ relative ใน Node)
  const url = new URL("/api/dashBoard/province-summary", req.url);
  url.searchParams.set("start_date", start_date);
  url.searchParams.set("end_date", end_date);
  url.searchParams.set("province", province);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `โหลดข้อมูลจังหวัด ${province} ไม่สำเร็จ`);
  }

  if (!text) return null;
  return JSON.parse(text) as ProvinceSummary;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const start_date = params.get("start_date") || "2024-01-01";
    const end_date = params.get("end_date") || "2024-12-31";
    const mainProvince = params.get("mainProvince");
    const compareProvince = params.get("compareProvince");

    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        {
          ok: false,
          error:
            "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด",
        },
        { status: 400 }
      );
    }

    const result: APIResp = { ok: true };

    if (mainProvince) {
      const main = await fetchProvinceSummary(req, {
        start_date,
        end_date,
        province: mainProvince,
      });
      if (main) result.main = main;
    }

    if (compareProvince) {
      const compare = await fetchProvinceSummary(req, {
        start_date,
        end_date,
        province: compareProvince,
      });
      if (compare) result.compare = compare;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("❌ API ERROR (compareInfo/province-patients):", err);
    return NextResponse.json<APIResp>(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
