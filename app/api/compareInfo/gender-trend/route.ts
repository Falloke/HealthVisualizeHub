// app/api/compareInfo/gender-trend/route.ts
import { NextRequest, NextResponse } from "next/server";

type TrendData = {
  month: string;   // "2024-01"
  male: number;
  female: number;
};

type CombinedRow = {
  month: string;
  month_th: string;
  male_main?: number;
  female_main?: number;
  male_compare?: number;
  female_compare?: number;
};

type APIResp = {
  ok: boolean;
  rows?: CombinedRow[];
  error?: string;
};

// แปลง "YYYY-MM" -> "ม.ค. 2567"
function toThaiMonthLabel(s?: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  try {
    const y = m ? Number(m[1]) : new Date(s).getFullYear();
    const mo = m ? Number(m[2]) - 1 : new Date(s).getMonth();
    const d = new Date(y, mo, 1);
    return d.toLocaleString("th-TH", { month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

// ดึงข้อมูลจาก /api/dashBoard/gender-trend ของจังหวัดเดียว
async function fetchGenderTrendFromDashboard(
  origin: string,
  baseQs: string,
  province?: string | null
): Promise<TrendData[]> {
  if (!province) return [];

  const url = `${origin}/api/dashBoard/gender-trend?${baseQs}&province=${encodeURIComponent(
    province
  )}`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || "โหลดข้อมูลแนวโน้มเพศไม่สำเร็จ");
  }

  const json = text ? (JSON.parse(text) as TrendData[] | { items: TrendData[] }) : [];
  if (Array.isArray(json)) return json;
  if (Array.isArray((json as any).items)) return (json as any).items;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const urlObj = new URL(req.url);
    const origin = urlObj.origin;

    const params = urlObj.searchParams;
    const start_date = params.get("start_date") || "2024-01-01";
    const end_date = params.get("end_date") || "2024-12-31";
    const mainProvince = params.get("mainProvince");
    const compareProvince = params.get("compareProvince");

    if (!mainProvince && !compareProvince) {
      return NextResponse.json<APIResp>(
        { ok: false, error: "ต้องระบุ mainProvince หรือ compareProvince อย่างน้อย 1 จังหวัด" },
        { status: 400 }
      );
    }

    const baseQs = new URLSearchParams({
      start_date,
      end_date,
    }).toString();

    const [mainTrend, compareTrend] = await Promise.all([
      fetchGenderTrendFromDashboard(origin, baseQs, mainProvince),
      fetchGenderTrendFromDashboard(origin, baseQs, compareProvince),
    ]);

    // รวมเดือนของทั้งสองจังหวัดแล้วเรียงตาม "YYYY-MM"
    const monthSet = new Set<string>();
    mainTrend.forEach((r) => monthSet.add(r.month));
    compareTrend.forEach((r) => monthSet.add(r.month));
    const months = Array.from(monthSet).sort();

    const rows: CombinedRow[] = months.map((m) => {
      const mainRow = mainTrend.find((r) => r.month === m);
      const compareRow = compareTrend.find((r) => r.month === m);
      return {
        month: m,
        month_th: toThaiMonthLabel(m),
        male_main: mainRow?.male ?? 0,
        female_main: mainRow?.female ?? 0,
        male_compare: compareRow?.male ?? 0,
        female_compare: compareRow?.female ?? 0,
      };
    });

    return NextResponse.json<APIResp>({ ok: true, rows });
  } catch (err) {
    console.error("❌ API ERROR (compareInfo/gender-trend):", err);
    return NextResponse.json<APIResp>(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
