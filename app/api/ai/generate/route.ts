// app/api/ai/generate/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs"; // กันปัญหา env บน edge

// ---------- Types ----------
type AINarrativePayload = {
  timeRange: { start: string; end: string }; // YYYY-MM-DD
  province: string;
  disease?: string;
  overview: {
    totalPatients: number;
    avgPatientsPerDay: number;
    cumulativePatients: number;
    totalDeaths: number;
    avgDeathsPerDay: number;
    cumulativeDeaths: number;
  };
  regionName?: string;
  regionComparison?: {
    provincePatients: number;
    regionPatients: number;
    provinceDeaths: number;
    regionDeaths: number;
    includeProvinceInRegion?: boolean;
  };
  byAge: {
    patients: Array<{ ageRange: string; patients: number }>;
    deaths: Array<{ ageRange: string; deaths: number }>;
  };
  byGender: {
    patients: { male: number; female: number; unknown: number };
    deaths: Array<{ gender: "ชาย" | "หญิง" | "ไม่ระบุ"; value: number }>;
  };
  monthlyGenderTrend: Array<{ month: string; male: number; female: number }>;
  extraNotes?: string;
  precomputed?: { monthlyTotals?: Array<{ month: string; total: number }> };
};

// ---------- Model config ----------
const MODEL_ID = "gemini-2.5-flash";
const generationConfig = {
  temperature: 0.2,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 5000,
};

// ---------- Helper: รวมยอดภูมิภาค ----------
async function buildRegionComparison(args: {
  start_date: string;
  end_date: string;
  province: string;
  baseUrl: string;
}) {
  const { start_date, end_date, province, baseUrl } = args;

  const sumURL = new URL(
    `/api/dashBoard/province-summary?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
      province
    )}`,
    baseUrl
  );
  const sumRes = await fetch(sumURL.toString(), { cache: "no-store" });
  if (!sumRes.ok) throw new Error("Failed to fetch province-summary");
  const sumJson = await sumRes.json();
  const provincePatients = Number(sumJson?.patients ?? 0);
  const provinceDeaths = Number(sumJson?.deaths ?? 0);
  const regionName = String(sumJson?.region ?? "");

  const regURL = new URL(
    `/api/dashBoard/region-by-province?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
      province
    )}`,
    baseUrl
  );
  const regRes = await fetch(regURL.toString(), { cache: "no-store" });
  if (!regRes.ok) throw new Error("Failed to fetch region-by-province");
  const regText = await regRes.text();
  const regJson = regText ? JSON.parse(regText) : {};
  const topPatients = Array.isArray(regJson?.topPatients)
    ? regJson.topPatients
    : [];
  const topDeaths = Array.isArray(regJson?.topDeaths) ? regJson.topDeaths : [];

  const regionPatients = topPatients.reduce(
    (s: number, r: any) => s + Number(r.patients ?? 0),
    0
  );
  const regionDeaths = topDeaths.reduce(
    (s: number, r: any) => s + Number(r.deaths ?? 0),
    0
  );

  return {
    regionName,
    provincePatients,
    provinceDeaths,
    regionPatients,
    regionDeaths,
  };
}

// ---------- Prompt (หัวข้อเป็นตัวหนา ไม่ใช้ ##) ----------
const SYS_PROMPT = [
  'คุณเป็นนักระบาดวิทยา สร้าง "บทความ Markdown ภาษาไทย" จาก JSON ที่ให้เท่านั้น (ห้ามเดาค่าที่ไม่มีใน JSON)',
  "",
  "รูปแบบหัวข้อ (สำคัญมาก):",
  "- ใช้หัวข้อเป็นตัวหนาเท่านั้น เช่น **รายงานสถานการณ์** (ห้ามใช้ #/##/### หรือ heading อื่นใด)",
  "- เนื้อความปกติห้ามใส่ตัวหนา ยกเว้นหัวข้อเท่านั้น",
  "",
  "ต้องมีหัวข้อเหล่านี้เรียงตามลำดับทุกครั้ง:",
  "**รายงานสถานการณ์**",
  "- ระบุโรค, จังหวัด, ช่วงวันที่แบบไทย (เช่น 01 มกราคม 2567 ถึง 30 มิถุนายน 2567)",
  '- สรุป "จำนวนผู้ป่วย", "เฉลี่ยต่อวัน", "สะสม" (หน่วย: ราย)',
  '- สรุป "จำนวนผู้เสียชีวิต", "เฉลี่ยต่อวัน", "สะสม" (หน่วย: ราย)',
  "",
  "**แนวโน้มรายเดือน**",
  "- วิเคราะห์แนวโน้มรายเดือน จำแนกตามเพศ (ชาย/หญิง)",
  "- ใช้เดือนภาษาไทยแบบย่อ + ปี พ.ศ. (เช่น ม.ค. 2567)",
  "- หากมี precomputed.monthlyTotals ให้ใช้ในการเทียบเดือนสูงสุด/ต่ำสุดโดยตรง",
  "",
  "**การเปรียบเทียบจังหวัดกับภูมิภาค**",
  "- ใช้ค่าจาก regionComparison เท่านั้น ถ้ามี (ถ้าไม่มีให้ระบุว่า ไม่มีข้อมูลเพียงพอ)",
  '- เปรียบเทียบ \"ผู้ป่วยสะสม จังหวัด vs ภูมิภาคของจังหวัดนั้น\" (หน่วย: ราย)',
  '- เปรียบเทียบ \"ผู้เสียชีวิตสะสม จังหวัด vs ภูมิภาคของจังหวัดนั้น\" (หน่วย: ราย)',
  '- เขียนสั้น กระชับ ชี้ชัดว่าจังหวัดอยู่ "สูงกว่าหรือต่ำกว่า" ค่าในภูมิภาค (ถ้ามีข้อมูล)',
  "",
  "**การกระจายตามกลุ่มอายุ**",
  '- ผู้ป่วยสะสม "รายช่วงอายุ" และแม็ปเป็น "ช่วงวัย" (ตัวอย่าง: 0-4 = ทารก/ก่อนเรียน, 5-9/10-14 = วัยเรียน, 15-19 = วัยรุ่น, 20-24 = วัยเริ่มทำงาน, 25-44 = วัยทำงานหลัก, 45-59 = ผู้ใหญ่ตอนปลาย, 60+ = ผู้สูงอายุ)',
  '- ผู้เสียชีวิตสะสม "รายช่วงอายุ" พร้อมแม็ปช่วงวัยเช่นเดียวกัน',
  '- แสดงตัวเลขพร้อมหน่วย "ราย"',
  "",
  "**เปรียบเทียบเพศ**",
  "- ผู้ป่วยสะสมแยกตามเพศ: ชาย/หญิง (+ ไม่ระบุ ถ้ามี)",
  "- ผู้เสียชีวิตสะสมแยกตามเพศ: ชาย/หญิง (+ ไม่ระบุ ถ้ามี)",
  "- ให้สรุปว่าเพศใดมากกว่า (ถ้าค่าต่างกันชัดเจน)",
  "",
  "**ข้อเสนอแนะเชิงปฏิบัติ**",
  "- สรุปแนวทางป้องกันและข้อควรปฏิบัติที่เหมาะสมกับโรคนี้ (ไม่ต้องสมมุติตัวเลข)",
  "",
  "**สรุปย่อ**",
  "- สรุปรายสั้น ๆ เน้นประเด็นสำคัญและแนวโน้มที่ควรเฝ้าระวัง",
  "",
  "ข้อกำหนดเคร่งครัด:",
  "- แสดงตัวเลขด้วยตัวคั่นหลักพัน (เช่น 6,541)",
  "- ทุกตัวเลขที่กล่าวถึงต้องมาจาก JSON เท่านั้น (ห้ามคาดเดา)",
  '- หากไม่มีข้อมูล ให้เขียนว่า "ไม่มีข้อมูลเพียงพอ"',
  "- เดือนให้ใช้รูปแบบย่อภาษาไทย + ปี พ.ศ.",
  "- จบครบทุกหัวข้อ",
].join("\n");

// ---------- Prompt Builder ----------
function makeUserPrompt(p: AINarrativePayload) {
  const header = `โรค: ${p.disease ?? "ไม่ระบุ"} | จังหวัด: ${p.province} | ช่วงเวลา: ${p.timeRange.start} ถึง ${p.timeRange.end} | ภูมิภาค: ${p.regionName ?? "ไม่ระบุ"} | วิธีรวมภูมิภาค: ${p.regionComparison?.includeProvinceInRegion ? "รวมจังหวัด" : "ไม่รวมจังหวัด"}`;

  const guidance = `
ข้อกำหนดเพิ่มเติมสำหรับข้อมูลชุดนี้:
- ในหัวข้อ "การเปรียบเทียบจังหวัดกับภูมิภาค": ให้ยึด ${p.province} เทียบกับ ${p.regionName ?? "ภูมิภาคของจังหวัด"} โดยใช้ค่าจาก regionComparison เท่านั้น (ถ้าไม่มีให้ระบุว่าไม่มีข้อมูลเพียงพอ)
- ในหัวข้อ "การกระจายตามกลุ่มอายุ": ระบุ "ช่วงวัย" สำหรับแต่ละช่วงอายุ
- ทุกตัวเลขให้พิมพ์ด้วยหลักพัน และใส่หน่วย "ราย" เสมอ
- เดือนแนวโน้มให้สื่อสารเป็นภาษาไทยแบบย่อ + พ.ศ.
`.trim();

  const json = JSON.stringify(p, null, 2);
  return `${header}

${guidance}

ข้อมูลแดชบอร์ด (JSON):
${json}

คำสั่ง:
- ยึดหัวข้อและกฎใน System Prompt อย่างเคร่งครัด
- ใช้ค่า precomputed.monthlyTotals (ถ้ามี) เพื่อตอบเดือนสูงสุด/ต่ำสุดโดยตรง
- ห้ามหยุดก่อนจบหัวข้อ "**สรุปย่อ**"
`;
}

// ---------- Completeness Checker ----------
function looksIncomplete(markdown: string) {
  const mustHave = [
    "**รายงานสถานการณ์**",
    "**แนวโน้มรายเดือน**",
    "**การเปรียบเทียบจังหวัดกับภูมิภาค**",
    "**การกระจายตามกลุ่มอายุ**",
    "**เปรียบเทียบเพศ**",
    "**ข้อเสนอแนะเชิงปฏิบัติ**",
    "**สรุปย่อ**",
  ];
  return !mustHave.every((h) => markdown.includes(h));
}

// ---------- Deterministic “per-graph summaries” (ไม่พึ่ง LLM) ----------
function mapAgeRangeToGroup(ageRange: string): string {
  // ตัวอย่าง mapping แบบย่อ
  // ปรับเพิ่มได้ตามช่วงที่คุณใช้จริง
  const [a, b] = ageRange.split("-").map((s) => parseInt(s.trim(), 10));
  if (!isNaN(a) && !isNaN(b)) {
    if (b <= 4) return "ทารก/ก่อนเรียน";
    if (b <= 14) return "วัยเรียน";
    if (b <= 19) return "วัยรุ่น";
    if (b <= 24) return "วัยเริ่มทำงาน";
    if (b <= 44) return "วัยทำงานหลัก";
    if (b <= 59) return "ผู้ใหญ่ตอนปลาย";
    return "ผู้สูงอายุ";
  }
  // กรณี 60+ หรือรูปแบบอื่น
  if (ageRange.includes("+") || ageRange.includes("60")) return "ผู้สูงอายุ";
  return "ไม่ระบุ";
}

function buildSummaries(p: AINarrativePayload) {
  // province totals
  const provinceTotals = {
    patients: Number(
      p.overview?.cumulativePatients ?? p.overview?.totalPatients ?? 0
    ),
    deaths: Number(
      p.overview?.cumulativeDeaths ?? p.overview?.totalDeaths ?? 0
    ),
    avgPatientsPerDay: Number(p.overview?.avgPatientsPerDay ?? 0),
    avgDeathsPerDay: Number(p.overview?.avgDeathsPerDay ?? 0),
  };

  // region comparison
  const rc = p.regionComparison;
  const regionComparison = rc
    ? {
        provincePatients: Number(rc.provincePatients ?? 0),
        regionPatients: Number(rc.regionPatients ?? 0),
        provinceDeaths: Number(rc.provinceDeaths ?? 0),
        regionDeaths: Number(rc.regionDeaths ?? 0),
        includeProvinceInRegion: !!rc.includeProvinceInRegion,
        regionName: p.regionName ?? "",
      }
    : {
        provincePatients: provinceTotals.patients,
        regionPatients: null as number | null,
        provinceDeaths: provinceTotals.deaths,
        regionDeaths: null as number | null,
        includeProvinceInRegion: null as boolean | null,
        regionName: p.regionName ?? "",
      };

  // by age
  const agePatientsDist = (p.byAge?.patients ?? []).map((it) => ({
    ageRange: it.ageRange,
    groupName: mapAgeRangeToGroup(it.ageRange),
    patients: Number(it.patients ?? 0),
  }));
  const ageDeathsDist = (p.byAge?.deaths ?? []).map((it) => ({
    ageRange: it.ageRange,
    groupName: mapAgeRangeToGroup(it.ageRange),
    deaths: Number(it.deaths ?? 0),
  }));

  const topAgePatients =
    agePatientsDist.slice().sort((a, b) => b.patients - a.patients)[0] ?? null;
  const topAgeDeaths =
    ageDeathsDist.slice().sort((a, b) => b.deaths - a.deaths)[0] ?? null;

  // by gender
  const pg = p.byGender?.patients ?? { male: 0, female: 0, unknown: 0 };
  const deathsByGender = { male: 0, female: 0, unknown: 0 };
  for (const d of p.byGender?.deaths ?? []) {
    if (d.gender === "ชาย") deathsByGender.male += Number(d.value ?? 0);
    else if (d.gender === "หญิง") deathsByGender.female += Number(d.value ?? 0);
    else deathsByGender.unknown += Number(d.value ?? 0);
  }
  const dominantPatients =
    pg.male === pg.female ? "เท่ากัน" : pg.male > pg.female ? "ชาย" : "หญิง";
  const dominantDeaths =
    deathsByGender.male === deathsByGender.female
      ? "เท่ากัน"
      : deathsByGender.male > deathsByGender.female
        ? "ชาย"
        : "หญิง";

  // monthlyGenderTrend + peak/trough
  const months = (p.monthlyGenderTrend ?? []).map((m) => ({
    month: m.month,
    male: Number(m.male ?? 0),
    female: Number(m.female ?? 0),
    total: Number(m.male ?? 0) + Number(m.female ?? 0),
  }));

  let peak: { month: string; total: number } | null = null;
  let trough: { month: string; total: number } | null = null;

  const monthlyTotals =
    p.precomputed?.monthlyTotals && p.precomputed.monthlyTotals.length > 0
      ? p.precomputed.monthlyTotals.map((t) => ({
          month: t.month,
          total: Number(t.total ?? 0),
        }))
      : months.map(({ month, total }) => ({ month, total }));

  if (monthlyTotals.length > 0) {
    peak = monthlyTotals.slice().sort((a, b) => b.total - a.total)[0];
    trough = monthlyTotals.slice().sort((a, b) => a.total - b.total)[0];
  }

  return {
    provinceTotals,
    regionComparison,
    byAge: {
      distributionPatients: agePatientsDist,
      distributionDeaths: ageDeathsDist,
      topAgeGroupPatients: topAgePatients,
      topAgeGroupDeaths: topAgeDeaths,
    },
    byGender: {
      patients: pg,
      deaths: deathsByGender,
      dominantPatients,
      dominantDeaths,
    },
    monthlyGenderTrend: {
      months,
      peak,
      trough,
    },
  };
}

// ---------- Main route ----------
export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as AINarrativePayload;

    // สร้าง absolute base URL สำหรับเรียก API ภายใน
    const host =
      (req.headers.get("x-forwarded-host") ?? req.headers.get("host")) || "";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const originEnv = process.env.NEXT_PUBLIC_BASE_URL;
    const baseUrl =
      originEnv && originEnv.trim().length > 0
        ? originEnv
        : `${proto}://${host}`;

    // เติม regionComparison จาก API
    const region = await buildRegionComparison({
      start_date: payload.timeRange.start,
      end_date: payload.timeRange.end,
      province: payload.province,
      baseUrl,
    });

    const aiPayload: AINarrativePayload = {
      ...payload,
      regionName: region.regionName || payload.regionName,
      regionComparison: {
        provincePatients: region.provincePatients,
        regionPatients: region.regionPatients,
        provinceDeaths: region.provinceDeaths,
        regionDeaths: region.regionDeaths,
        includeProvinceInRegion: true, // ปรับได้ตามนโยบายรวม/ไม่รวม
      },
    };

    // เตรียม summaries (สรุปต่อกราฟ) แบบ deterministic
    const summaries = buildSummaries(aiPayload);

    // เรียก LLM เพื่อสร้าง Markdown (เฉพาะบทความ)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({ model: MODEL_ID });
    const basePrompt = `System:\n${SYS_PROMPT}\n\nUser:\n${makeUserPrompt(aiPayload)}`;

    // 1st run
    const r1 = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: basePrompt }] }],
      generationConfig,
    });
    let text = r1.response.text() ?? "";

    // retry once if incomplete
    if (looksIncomplete(text)) {
      const continuePrompt =
        basePrompt +
        `\n\nข้อควรระวัง: เนื้อหายังไม่ครบทุกหัวข้อ โปรดเขียนต่อให้จบครบทั้งหมด โดยยึดรูปแบบเดิมทุกประการ`;
      const r2 = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: continuePrompt }] }],
        generationConfig,
      });
      const t2 = r2.response.text() ?? "";
      if (!looksIncomplete(t2) || t2.length > text.length) text = t2;
    }

    // ไม่แทรกบล็อก tooltips ใด ๆ ใน Markdown
    const content = text.trim();

    return NextResponse.json({ ok: true, content, summaries });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
