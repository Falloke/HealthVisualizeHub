// app/api/ai/generate/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs"; // กันปัญหา env บน edge

// ---------- Types ----------
type AINarrativePayload = {
  timeRange: { start: string; end: string }; // YYYY-MM-DD
  province: string;

  // ✅ รองรับ payload ใหม่ (จาก composePayload.client.ts)
  diseaseCode?: string; // เช่น "D04"
  diseaseName?: string; // เช่น "ไข้หวัดใหญ่"

  // ✅ รองรับ payload เก่า (ถ้ายังมีบางจุดส่ง)
  // อาจเป็น "D01" หรือ "ไข้หวัดใหญ่ (D01)" หรือไม่ส่งมาก็ได้
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

// ---------- Helper: ดึง diseaseCode จาก payload ให้ชัวร์ ----------
function extractDiseaseCode(raw?: string) {
  const s = String(raw ?? "").trim();

  // ถ้าเป็น D01/D02/...
  if (/^D\d{2}$/i.test(s)) return s.toUpperCase();

  // ถ้าเป็น "ไข้หวัดใหญ่ (D01)" หรือ "...(D01)"
  const m = s.match(/\b(D\d{2})\b/i);
  if (m?.[1]) return m[1].toUpperCase();

  // ถ้าเป็น "01" หรือ "1" (กันไว้)
  const n = s.match(/\b(\d{1,2})\b/);
  if (n?.[1]) return `D${n[1].padStart(2, "0")}`;

  return "";
}

// ---------- Helper: ดึงชื่อโรคจาก DB (กันขึ้นแต่ D04) ----------
// ✅ สำคัญ: เราทำแบบ "ลองหลาย schema" เพื่อไม่พังถ้าคอลัมน์ชื่อไม่ตรงกัน
async function resolveDiseaseNameFromDB(diseaseCode: string): Promise<string> {
  if (!diseaseCode) return "";

  // --- try#1: columns ที่พบบ่อยในโปรเจคแนวนี้ ---
  try {
    const row = await db
      .selectFrom("diseases")
      .select([
        "disease_code" as any,
        "disease_name_th" as any,
        "disease_name_en" as any,
      ])
      .where("disease_code" as any, "=", diseaseCode)
      .executeTakeFirst();

    const th = String((row as any)?.disease_name_th ?? "").trim();
    if (th) return th;

    const en = String((row as any)?.disease_name_en ?? "").trim();
    if (en) return en;
  } catch {
    // ignore
  }

  // --- try#2: columns แบบ name_th/name_en ---
  try {
    const row = await db
      .selectFrom("diseases")
      .select(["code" as any, "name_th" as any, "name_en" as any])
      .where("code" as any, "=", diseaseCode)
      .executeTakeFirst();

    const th = String((row as any)?.name_th ?? "").trim();
    if (th) return th;

    const en = String((row as any)?.name_en ?? "").trim();
    if (en) return en;
  } catch {
    // ignore
  }

  // --- try#3: columns แบบ disease_name หรือ name ---
  try {
    const row = await db
      .selectFrom("diseases")
      .select([
        "disease_code" as any,
        sql<string>`COALESCE(disease_name, name, '')`.as("name"),
      ])
      .where("disease_code" as any, "=", diseaseCode)
      .executeTakeFirst();

    const name = String((row as any)?.name ?? "").trim();
    if (name) return name;
  } catch {
    // ignore
  }

  return "";
}

// ---------- Helper: รวมยอดภูมิภาค ----------
async function buildRegionComparison(args: {
  start_date: string;
  end_date: string;
  province: string;
  diseaseCode: string;
  baseUrl: string;
}) {
  const { start_date, end_date, province, diseaseCode, baseUrl } = args;

  // ✅ province-summary
  const sumURL = new URL(
    `/api/dashBoard/province-summary?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
      province
    )}&disease=${encodeURIComponent(diseaseCode)}`,
    baseUrl
  );

  const sumRes = await fetch(sumURL.toString(), { cache: "no-store" });
  if (!sumRes.ok) throw new Error("Failed to fetch province-summary");
  const sumJson = await sumRes.json();

  const provincePatients = Number(sumJson?.patients ?? 0);
  const provinceDeaths = Number(sumJson?.deaths ?? 0);

  // ✅ region-by-province
  const regURL = new URL(
    `/api/dashBoard/region-by-province?start_date=${start_date}&end_date=${end_date}&province=${encodeURIComponent(
      province
    )}&disease=${encodeURIComponent(diseaseCode)}`,
    baseUrl
  );

  const regRes = await fetch(regURL.toString(), { cache: "no-store" });
  if (!regRes.ok) throw new Error("Failed to fetch region-by-province");

  const regText = await regRes.text();
  const regJson = regText ? JSON.parse(regText) : {};

  const topPatients = Array.isArray(regJson?.topPatients) ? regJson.topPatients : [];
  const topDeaths = Array.isArray(regJson?.topDeaths) ? regJson.topDeaths : [];

  // ✅ หมายเหตุ: ตอนนี้รวมจาก top5 ตาม API ที่คุณมี
  const regionPatients = topPatients.reduce(
    (s: number, r: any) => s + Number(r.patients ?? 0),
    0
  );
  const regionDeaths = topDeaths.reduce(
    (s: number, r: any) => s + Number(r.deaths ?? 0),
    0
  );

  const regionName =
    String(sumJson?.region ?? "").trim() || String(regJson?.region ?? "").trim();

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
  'คุณเป็น "แพทย์" อธิบายสถานการณ์โรคให้คนทั่วไปเข้าใจง่าย แบบสั้น กระชับ และเป็นมิตร',
  'สร้าง "บทความ Markdown ภาษาไทย" จาก JSON ที่ให้เท่านั้น (ห้ามเดาค่าที่ไม่มีใน JSON)',
  "",
  "รูปแบบหัวข้อ (สำคัญมาก):",
  "- ใช้หัวข้อเป็นตัวหนาเท่านั้น เช่น **รายงานสถานการณ์** (ห้ามใช้ #/##/###)",
  "- เนื้อความปกติห้ามใส่ตัวหนา ยกเว้นหัวข้อเท่านั้น",
  "",
  "ต้องมีหัวข้อเหล่านี้เรียงตามลำดับทุกครั้ง:",
  "**รายงานสถานการณ์**",
  "- ระบุโรค, จังหวัด, ช่วงวันที่แบบไทย",
  '- สรุป "จำนวนผู้ป่วย", "เฉลี่ยต่อวัน", "สะสม" (หน่วย: ราย)',
  '- สรุป "จำนวนผู้เสียชีวิต", "เฉลี่ยต่อวัน", "สะสม" (หน่วย: ราย)',
  "",
  "**คำอธิบายเชิงการแพทย์**",
  "- อธิบายแบบหมอคุยกับคนไข้ 2–4 ประโยค",
  "- เน้นว่าโรคนี้คืออะไร, อาการพบบ่อย, กลุ่มเสี่ยง, และควรทำอย่างไรเมื่อเริ่มมีอาการ",
  "- ห้ามใส่ตัวเลขที่ไม่ได้อยู่ใน JSON และห้ามแต่งเรื่องเพิ่ม",
  "",
  "**แนวโน้มรายเดือน**",
  "- วิเคราะห์แนวโน้มรายเดือน จำแนกตามเพศ (ชาย/หญิง) แบบสั้นๆ",
  "- ใช้เดือนภาษาไทยแบบย่อ + ปี พ.ศ. (เช่น ม.ค. 2567)",
  "- หากมี precomputed.monthlyTotals ให้ใช้ในการเทียบเดือนสูงสุด/ต่ำสุดโดยตรง",
  "",
  "**การเปรียบเทียบจังหวัดกับภูมิภาค**",
  "- ใช้ค่าจาก regionComparison เท่านั้น (ถ้าไม่มีให้ระบุว่า ไม่มีข้อมูลเพียงพอ)",
  '- เปรียบเทียบ "ผู้ป่วยสะสม จังหวัด vs ภูมิภาคของจังหวัดนั้น" (หน่วย: ราย)',
  '- เปรียบเทียบ "ผู้เสียชีวิตสะสม จังหวัด vs ภูมิภาคของจังหวัดนั้น" (หน่วย: ราย)',
  '- เขียนสั้น ชัด ว่า "สูงกว่า/ต่ำกว่า/ใกล้เคียง" (ถ้ามีข้อมูล)',
  "",
  "**การกระจายตามกลุ่มอายุ**",
  '- ผู้ป่วยสะสม "รายช่วงอายุ" และแม็ปเป็น "ช่วงวัย"',
  '- ผู้เสียชีวิตสะสม "รายช่วงอายุ" และแม็ปเป็น "ช่วงวัย"',
  '- แสดงตัวเลขพร้อมหน่วย "ราย"',
  "",
  "**เปรียบเทียบเพศ**",
  "- ผู้ป่วยสะสมแยกตามเพศ: ชาย/หญิง (+ ไม่ระบุ ถ้ามี)",
  "- ผู้เสียชีวิตสะสมแยกตามเพศ: ชาย/หญิง (+ ไม่ระบุ ถ้ามี)",
  "- สรุปเพศที่มากกว่า (ถ้าต่างกันชัดเจน)",
  "",
  "**ข้อเสนอแนะเชิงปฏิบัติ**",
  "- แนะนำสั้นๆ แบบหมอ: ป้องกัน, ลดการแพร่เชื้อ, เมื่อไหร่ควรไปพบแพทย์",
  "",
  "**สรุปย่อ**",
  "- 2–4 บรรทัด สรุปใจความสำคัญที่สุด",
  "",
  "ข้อกำหนดเคร่งครัด:",
  "- แสดงตัวเลขด้วยตัวคั่นหลักพัน (เช่น 6,541)",
  "- ทุกตัวเลขต้องมาจาก JSON เท่านั้น (ห้ามคาดเดา)",
  '- หากไม่มีข้อมูล ให้เขียนว่า "ไม่มีข้อมูลเพียงพอ"',
  "- เดือนใช้รูปแบบย่อภาษาไทย + ปี พ.ศ.",
  "- ต้องจบครบทุกหัวข้อ",
].join("\n");

// ---------- Prompt Builder ----------
function makeDiseaseLabel(p: AINarrativePayload) {
  const name = String(p.diseaseName ?? "").trim();
  const code = String(p.diseaseCode ?? "").trim();

  // ✅ สำคัญ: ถ้ามีชื่อ -> ใช้ชื่ออย่างเดียว (ไม่เอา D04)
  if (name) return name;

  // ✅ ถ้าไม่มีชื่อ -> ค่อยใช้ code แทน
  if (code) return code;

  // fallback เก่า
  const old = String(p.disease ?? "").trim();
  return old || "ไม่ระบุ";
}

function makeUserPrompt(p: AINarrativePayload) {
  const diseaseLabel = makeDiseaseLabel(p);

  const header = `โรค: ${diseaseLabel} | จังหวัด: ${p.province} | ช่วงเวลา: ${
    p.timeRange.start
  } ถึง ${p.timeRange.end} | ภูมิภาค: ${p.regionName ?? "ไม่ระบุ"} | วิธีรวมภูมิภาค: ${
    p.regionComparison?.includeProvinceInRegion ? "รวมจังหวัด" : "ไม่รวมจังหวัด"
  }`;

  const guidance = `
ข้อกำหนดเพิ่มเติม:
- เขียนให้สั้น อ่านง่าย เหมือนหมออธิบายให้คนทั่วไปฟัง
- หัวข้อ "คำอธิบายเชิงการแพทย์" จำกัด 2–4 ประโยค (สั้นๆ)
- ในหัวข้อ "การเปรียบเทียบจังหวัดกับภูมิภาค": ใช้ regionComparison เท่านั้น
- ทุกตัวเลขใส่หน่วย "ราย" และคั่นหลักพัน
- เดือนแนวโน้มใช้ภาษาไทยแบบย่อ + พ.ศ.
`.trim();

  const json = JSON.stringify(p, null, 2);

  return `${header}

${guidance}

ข้อมูลแดชบอร์ด (JSON):
${json}

คำสั่ง:
- ยึดหัวข้อและกฎใน System Prompt อย่างเคร่งครัด
- ใช้ค่า precomputed.monthlyTotals (ถ้ามี) เพื่อหาเดือนสูงสุด/ต่ำสุดโดยตรง
- ห้ามหยุดก่อนจบหัวข้อ "**สรุปย่อ**"
`;
}

// ---------- Completeness Checker ----------
function looksIncomplete(markdown: string) {
  const mustHave = [
    "**รายงานสถานการณ์**",
    "**คำอธิบายเชิงการแพทย์**",
    "**แนวโน้มรายเดือน**",
    "**การเปรียบเทียบจังหวัดกับภูมิภาค**",
    "**การกระจายตามกลุ่มอายุ**",
    "**เปรียบเทียบเพศ**",
    "**ข้อเสนอแนะเชิงปฏิบัติ**",
    "**สรุปย่อ**",
  ];
  return !mustHave.every((h) => markdown.includes(h));
}

// ---------- Deterministic summaries ----------
function mapAgeRangeToGroup(ageRange: string): string {
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
  if (ageRange.includes("+") || ageRange.includes("60")) return "ผู้สูงอายุ";
  return "ไม่ระบุ";
}

function buildSummaries(p: AINarrativePayload) {
  const provinceTotals = {
    patients: Number(p.overview?.cumulativePatients ?? p.overview?.totalPatients ?? 0),
    deaths: Number(p.overview?.cumulativeDeaths ?? p.overview?.totalDeaths ?? 0),
    avgPatientsPerDay: Number(p.overview?.avgPatientsPerDay ?? 0),
    avgDeathsPerDay: Number(p.overview?.avgDeathsPerDay ?? 0),
  };

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

    // ✅ 1) เอา diseaseCode ให้ชัวร์ (รองรับทั้ง payload ใหม่/เก่า)
    const diseaseCode =
      String(payload.diseaseCode ?? "").trim() ||
      extractDiseaseCode(payload.disease) ||
      "";

    if (!diseaseCode) {
      return NextResponse.json(
        { ok: false, error: "Missing diseaseCode" },
        { status: 400 }
      );
    }

    // ✅ 2) เอาชื่อโรค: ถ้าไม่ส่งมา -> ดึงจาก DB
    const diseaseNameFromPayload = String(payload.diseaseName ?? "").trim();
    const diseaseNameFromDB = diseaseNameFromPayload
      ? ""
      : await resolveDiseaseNameFromDB(diseaseCode);

    const diseaseNameFinal = diseaseNameFromPayload || diseaseNameFromDB || "";

    // ✅ (สำคัญ) ใช้ชื่อโรคอย่างเดียวใน prompt (ไม่ต่อท้าย D04)
    const diseaseLabel = diseaseNameFinal || diseaseCode;

    // เติม regionComparison จาก API (ต้องส่ง diseaseCode)
    const region = await buildRegionComparison({
      start_date: payload.timeRange.start,
      end_date: payload.timeRange.end,
      province: payload.province,
      diseaseCode,
      baseUrl,
    });

    // ✅ payload หลักสำหรับ return + summaries (เก็บ diseaseCode ไว้ใช้ logic ต่อได้)
    const aiPayload: AINarrativePayload = {
      ...payload,

      diseaseCode,
      diseaseName: diseaseNameFinal || payload.diseaseName,
      disease: diseaseLabel,

      regionName: region.regionName || payload.regionName,
      regionComparison: {
        provincePatients: region.provincePatients,
        regionPatients: region.regionPatients,
        provinceDeaths: region.provinceDeaths,
        regionDeaths: region.regionDeaths,
        includeProvinceInRegion: true,
      },
    };

    // ✅ ป้องกันไม่ให้ LLM เอา "D04" ไปเขียนในรายงานเอง
    // เราจะ "ซ่อน diseaseCode" เฉพาะตอนทำ prompt เท่านั้น
    const promptPayload: AINarrativePayload = {
      ...aiPayload,
      diseaseCode: undefined, // ✅ ตัดออกจาก JSON ที่ส่งให้ Gemini
      disease: diseaseNameFinal || aiPayload.disease, // ✅ ย้ำให้เป็นชื่อโรค
    };

    // เตรียม summaries แบบ deterministic
    const summaries = buildSummaries(aiPayload);

    // เรียก LLM เพื่อสร้าง Markdown
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    const basePrompt = `System:\n${SYS_PROMPT}\n\nUser:\n${makeUserPrompt(
      promptPayload
    )}`;

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

    const content = text.trim();

    return NextResponse.json({ ok: true, content, summaries });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
