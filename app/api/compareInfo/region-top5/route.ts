// app/api/compareInfo/region-top5/route.ts
import { NextRequest, NextResponse } from "next/server";

type RegionByProvinceResp = {
  region?: string;
  topPatients?: Array<{ province: string; patients: number }>;
  selected?: {
    province: string;
    patients: number;
    patientsRank?: number;
    region?: string;
  };
  selectedProvince?: {
    province: string;
    patients: number;
    rank?: number;
    region?: string;
  };
};

type Row = {
  province: string;
  patients: number;
  rank?: number;
  isMain?: boolean;
  isCompare?: boolean;
};

type APIResp = {
  ok: boolean;
  sameRegion: boolean;
  mainRegion?: string;
  compareRegion?: string;
  mainRows: Row[];
  compareRows: Row[];
  note?: string;
  error?: string;
};

// ---------------- helper: call dashboard API ----------------

async function fetchRegionByProvince(
  req: NextRequest,
  opts: { start_date: string; end_date: string; province: string }
): Promise<RegionByProvinceResp | null> {
  const { start_date, end_date, province } = opts;

  const url = new URL("/api/dashBoard/region-by-province", req.url);
  url.searchParams.set("start_date", start_date);
  url.searchParams.set("end_date", end_date);
  url.searchParams.set("province", province);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      text || `โหลดข้อมูลภูมิภาคของจังหวัด ${province} ไม่สำเร็จ`
    );
  }

  if (!text) return null;
  return JSON.parse(text) as RegionByProvinceResp;
}

// ---------------- helper: จัดการ rows เหมือนใน component เดิม ----------------

function sortByPatientsDesc(rows: Row[]): Row[] {
  return rows.sort(
    (a, b) => Number(b.patients ?? 0) - Number(a.patients ?? 0)
  );
}

function normalizeProvinceName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/\s*\(อันดับ\s*\d+\)\s*$/u, "")
    .trim();
}

function ensureSelectedProvince(
  rows: Row[],
  selected:
    | RegionByProvinceResp["selected"]
    | RegionByProvinceResp["selectedProvince"],
  flags: Partial<Row>
) {
  if (!selected || !selected.province) return;

  const norm = normalizeProvinceName(selected.province);
  const patients = Number(selected.patients ?? 0);
  const rank = selected.rank ?? selected.patientsRank;
  const label =
    typeof rank === "number" && rank > 0
      ? `${norm} (อันดับ ${rank})`
      : norm;

  const idx = rows.findIndex(
    (r) => normalizeProvinceName(r.province) === norm
  );

  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      ...flags,
      rank: rows[idx].rank ?? rank,
      province: label,
      patients: rows[idx].patients ?? patients,
    };
  } else {
    rows.push({
      province: label,
      patients,
      rank,
      ...flags,
    });
  }
}

/**
 * จำกัด rows ให้เหลือไม่เกิน 5 แท่ง โดยบังคับให้ importantNames โผล่เสมอ
 */
function ensureLimit5WithSelected(rows: Row[], importantNames: string[]): Row[] {
  const LIMIT = 5;
  sortByPatientsDesc(rows);

  if (rows.length <= LIMIT && importantNames.length === 0) return rows;

  const importantNorms = importantNames
    .map(normalizeProvinceName)
    .filter(Boolean);

  const selectedRows: Row[] = [];
  const otherRows: Row[] = [];

  for (const row of rows) {
    const norm = normalizeProvinceName(row.province);
    if (
      importantNorms.includes(norm) &&
      !selectedRows.some((r) => normalizeProvinceName(r.province) === norm)
    ) {
      selectedRows.push(row);
    } else {
      otherRows.push(row);
    }
  }

  if (selectedRows.length >= LIMIT) {
    return sortByPatientsDesc(selectedRows).slice(0, LIMIT);
  }

  const needOthers = LIMIT - selectedRows.length;
  const chosenOthers = otherRows.slice(0, needOthers);

  const result = [...selectedRows, ...chosenOthers];
  sortByPatientsDesc(result);
  return result;
}

// ---------------- handler ----------------

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;

    const start_date = params.get("start_date") || "2024-01-01";
    const end_date = params.get("end_date") || "2024-12-31";
    const mainProvince = params.get("mainProvince");
    const compareProvince = params.get("compareProvince");

    if (!mainProvince || !compareProvince) {
      return NextResponse.json<APIResp>(
        {
          ok: false,
          sameRegion: false,
          mainRows: [],
          compareRows: [],
          error:
            "ต้องระบุทั้ง mainProvince และ compareProvince สำหรับการเปรียบเทียบ",
        },
        { status: 400 }
      );
    }

    const [jsonMain, jsonCompare] = await Promise.all([
      fetchRegionByProvince(req, { start_date, end_date, province: mainProvince }),
      fetchRegionByProvince(req, {
        start_date,
        end_date,
        province: compareProvince,
      }),
    ]);

    if (!jsonMain) {
      return NextResponse.json<APIResp>(
        {
          ok: false,
          sameRegion: false,
          mainRows: [],
          compareRows: [],
          error: "ไม่พบข้อมูลของจังหวัดหลัก",
        },
        { status: 404 }
      );
    }

    const mRegion =
      jsonMain.selected?.region ||
      jsonMain.selectedProvince?.region ||
      jsonMain.region ||
      "";
    const cRegion =
      jsonCompare?.selected?.region ||
      jsonCompare?.selectedProvince?.region ||
      jsonCompare?.region ||
      "";

    const sameRegion =
      !!mRegion && !!cRegion && mRegion.trim() === cRegion.trim();

    const baseMain: Row[] = (jsonMain.topPatients ?? [])
      .slice(0, 5)
      .map((d, i) => ({
        province: d.province,
        patients: Number(d.patients ?? 0),
        rank: i + 1,
      }));

    const baseCompare: Row[] = (jsonCompare?.topPatients ?? [])
      .slice(0, 5)
      .map((d, i) => ({
        province: d.province,
        patients: Number(d.patients ?? 0),
        rank: i + 1,
      }));

    const mainSelected =
      jsonMain.selectedProvince ?? jsonMain.selected ?? undefined;
    const compareSelected =
      jsonCompare?.selectedProvince ?? jsonCompare?.selected ?? undefined;

    let mainRows: Row[] = [];
    let compareRows: Row[] = [];
    let note = "";

    if (!mRegion) {
      // ไม่มีข้อมูลภูมิภาคของจังหวัดหลัก
      ensureSelectedProvince(baseMain, mainSelected, { isMain: true });
      mainRows = ensureLimit5WithSelected(
        baseMain,
        mainSelected?.province ? [mainSelected.province] : []
      );
      compareRows = [];
      note = "ไม่พบข้อมูลภูมิภาคของจังหวัดหลัก";
    } else if (sameRegion) {
      // รวม top ของภูมิภาคเดียวกัน แล้วบังคับให้ทั้งสองจังหวัดอยู่ในกราฟ
      const combined: Row[] = [...baseMain];

      ensureSelectedProvince(combined, mainSelected, { isMain: true });
      ensureSelectedProvince(combined, compareSelected, { isCompare: true });

      const importantNames: string[] = [];
      if (mainSelected?.province) importantNames.push(mainSelected.province);
      if (compareSelected?.province)
        importantNames.push(compareSelected.province);

      mainRows = ensureLimit5WithSelected(combined, importantNames);
      compareRows = [];
      note =
        "จังหวัดหลักและจังหวัดที่ต้องการเปรียบเทียบอยู่ในภูมิภาคเดียวกัน จะแสดงไม่เกิน 5 จังหวัด โดยบังคับให้ทั้งสองจังหวัดที่เลือกอยู่ในกราฟเสมอ (ถ้าอยู่อันดับเกิน 5 จะดึงขึ้นมาแทนจังหวัดอื่น)";
    } else {
      // อยู่คนละภูมิภาค → แยกกราฟซ้าย/ขวา
      const rowsMain: Row[] = [...baseMain];
      const rowsCompare: Row[] = [...baseCompare];

      ensureSelectedProvince(rowsMain, mainSelected, { isMain: true });
      ensureSelectedProvince(rowsCompare, compareSelected, { isCompare: true });

      mainRows = ensureLimit5WithSelected(
        rowsMain,
        mainSelected?.province ? [mainSelected.province] : []
      );
      compareRows = ensureLimit5WithSelected(
        rowsCompare,
        compareSelected?.province ? [compareSelected.province] : []
      );

      note =
        "จังหวัดที่ต้องการเปรียบเทียบอยู่นอกภูมิภาคของจังหวัดหลัก จึงแสดง Top 5 ของแต่ละภูมิภาคแยกกัน และบังคับให้จังหวัดที่เลือกทั้งสองโผล่ในกราฟของภูมิภาคตัวเองเสมอ (ตัดจังหวัดอื่นออกให้เหลือไม่เกิน 5 แท่ง)";
    }

    return NextResponse.json<APIResp>({
      ok: true,
      sameRegion,
      mainRegion: mRegion || undefined,
      compareRegion: cRegion || undefined,
      mainRows,
      compareRows,
      note,
    });
  } catch (err) {
    console.error("❌ API ERROR (compareInfo/region-top5):", err);
    return NextResponse.json<APIResp>(
      {
        ok: false,
        sameRegion: false,
        mainRows: [],
        compareRows: [],
        error: "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
