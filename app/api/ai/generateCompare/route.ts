// app/api/ai/generateCompare/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import db from "@/lib/kysely/db";
import { sql } from "kysely";

export const runtime = "nodejs";

// -------------------- Types --------------------
type ProvinceBlock = {
  province: string;

  diseaseCode?: string;
  diseaseName?: string;
  disease?: string;

  overview: {
    totalPatients: number;
    avgPatientsPerDay: number;
    cumulativePatients: number;
    totalDeaths: number;
    avgDeathsPerDay: number;
    cumulativeDeaths: number;
  };

  // ยังเก็บไว้ได้ แต่ "prompt compare" จะไม่เอาไปทำส่วนเทียบภูมิภาค
  regionName?: string;
  regionComparison?: any;

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

type ComparePayload = {
  timeRange: { start: string; end: string }; // YYYY-MM-DD

  diseaseCode?: string;
  diseaseName?: string;
  disease?: string;

  mainProvince: string;
  compareProvince: string;

  mainData: ProvinceBlock;
  compareData: ProvinceBlock;

  compareNotes?: string;
};

// -------------------- Model config --------------------
const MODEL_ID = "gemini-2.5-flash";
const generationConfig = {
  temperature: 0.2,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 5000,
};

// -------------------- Helpers --------------------
function extractDiseaseCode(raw?: string) {
  const s = String(raw ?? "").trim();
  if (/^D\d{2}$/i.test(s)) return s.toUpperCase();
  const m = s.match(/\b(D\d{2})\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  const n = s.match(/\b(\d{1,2})\b/);
  if (n?.[1]) return `D${n[1].padStart(2, "0")}`;
  return "";
}

async function resolveDiseaseNameFromDB(diseaseCode: string): Promise<string> {
  if (!diseaseCode) return "";

  // try#1
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

  // try#2
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

  // try#3
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

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function mapAgeRangeToGroup(ageRange: string): string {
  const [a, b] = String(ageRange)
    .split("-")
    .map((s) => parseInt(s.trim(), 10));

  if (!Number.isNaN(a) && !Number.isNaN(b)) {
    if (b <= 4) return "ทารก/ก่อนเรียน";
    if (b <= 14) return "วัยเรียน";
    if (b <= 19) return "วัยรุ่น";
    if (b <= 24) return "วัยเริ่มทำงาน";
    if (b <= 44) return "วัยทำงานหลัก";
    if (b <= 59) return "ผู้ใหญ่ตอนปลาย";
    return "ผู้สูงอายุ";
  }
  if (String(ageRange).includes("+") || String(ageRange).includes("60"))
    return "ผู้สูงอายุ";
  return "ไม่ระบุ";
}

function toMonthlyTotals(block: ProvinceBlock) {
  const fromPre =
    block.precomputed?.monthlyTotals && block.precomputed.monthlyTotals.length > 0
      ? block.precomputed.monthlyTotals.map((t) => ({
          month: String(t.month),
          total: num(t.total),
        }))
      : null;

  if (fromPre) return fromPre;

  const trend = Array.isArray(block.monthlyGenderTrend) ? block.monthlyGenderTrend : [];
  return trend.map((m) => ({
    month: String(m.month),
    total: num(m.male) + num(m.female),
  }));
}

function sumDeathsByGender(block: ProvinceBlock) {
  const out = { male: 0, female: 0, unknown: 0 };
  const arr = Array.isArray(block.byGender?.deaths) ? block.byGender.deaths : [];
  for (const d of arr) {
    if (d.gender === "ชาย") out.male += num(d.value);
    else if (d.gender === "หญิง") out.female += num(d.value);
    else out.unknown += num(d.value);
  }
  return out;
}

function topAge(block: ProvinceBlock, kind: "patients" | "deaths") {
  const list =
    kind === "patients"
      ? Array.isArray(block.byAge?.patients)
        ? block.byAge.patients
        : []
      : Array.isArray(block.byAge?.deaths)
      ? block.byAge.deaths
      : [];

  const mapped = list.map((it: any) => ({
    ageRange: String(it.ageRange ?? ""),
    groupName: mapAgeRangeToGroup(String(it.ageRange ?? "")),
    value: kind === "patients" ? num(it.patients) : num(it.deaths),
  }));

  mapped.sort((a, b) => b.value - a.value);
  return mapped[0] ?? null;
}

function dominant2(a: number, b: number) {
  if (a === b) return "เท่ากัน";
  return a > b ? "จังหวัดหลัก" : "จังหวัดเปรียบเทียบ";
}

function buildCompareSummaries(p: ComparePayload) {
  const A = p.mainData;
  const B = p.compareData;

  const aPatients = num(A.overview?.cumulativePatients ?? A.overview?.totalPatients);
  const bPatients = num(B.overview?.cumulativePatients ?? B.overview?.totalPatients);
  const aDeaths = num(A.overview?.cumulativeDeaths ?? A.overview?.totalDeaths);
  const bDeaths = num(B.overview?.cumulativeDeaths ?? B.overview?.totalDeaths);

  const diffPatients = aPatients - bPatients;
  const diffDeaths = aDeaths - bDeaths;

  const absPatients = Math.abs(diffPatients);
  const absDeaths = Math.abs(diffDeaths);

  const whoPatients =
    diffPatients === 0 ? "เท่ากัน" : diffPatients > 0 ? "จังหวัดหลัก" : "จังหวัดเปรียบเทียบ";
  const whoDeaths =
    diffDeaths === 0 ? "เท่ากัน" : diffDeaths > 0 ? "จังหวัดหลัก" : "จังหวัดเปรียบเทียบ";

  const aGenderP = A.byGender?.patients ?? { male: 0, female: 0, unknown: 0 };
  const bGenderP = B.byGender?.patients ?? { male: 0, female: 0, unknown: 0 };
  const aGenderD = sumDeathsByGender(A);
  const bGenderD = sumDeathsByGender(B);

  const aTopAgeP = topAge(A, "patients");
  const bTopAgeP = topAge(B, "patients");
  const aTopAgeD = topAge(A, "deaths");
  const bTopAgeD = topAge(B, "deaths");

  const aMonthly = toMonthlyTotals(A);
  const bMonthly = toMonthlyTotals(B);

  const aPeak =
    aMonthly.length > 0 ? aMonthly.slice().sort((x, y) => y.total - x.total)[0] : null;
  const bPeak =
    bMonthly.length > 0 ? bMonthly.slice().sort((x, y) => y.total - x.total)[0] : null;

  const aTrough =
    aMonthly.length > 0 ? aMonthly.slice().sort((x, y) => x.total - y.total)[0] : null;
  const bTrough =
    bMonthly.length > 0 ? bMonthly.slice().sort((x, y) => x.total - y.total)[0] : null;

  return {
    totals: {
      main: { patients: aPatients, deaths: aDeaths },
      compare: { patients: bPatients, deaths: bDeaths },
      diff: {
        patients: diffPatients,
        deaths: diffDeaths,
        absPatients,
        absDeaths,
        whoPatients,
        whoDeaths,
      },
    },
    byGender: {
      mainPatients: { ...aGenderP },
      comparePatients: { ...bGenderP },
      mainDeaths: { ...aGenderD },
      compareDeaths: { ...bGenderD },
    },
    byAge: {
      topPatientsMain: aTopAgeP,
      topPatientsCompare: bTopAgeP,
      topDeathsMain: aTopAgeD,
      topDeathsCompare: bTopAgeD,
    },
    monthly: {
      main: { peak: aPeak, trough: aTrough },
      compare: { peak: bPeak, trough: bTrough },
    },
  };
}

// -------------------- Prompt --------------------
// ✅ เน้น “เทียบ 2 จังหวัด” + “ใส่ตัวเลขทั้งสองฝั่ง + ส่วนต่าง + ใครมากกว่า”
// ✅ ตัดหัวข้อ “จังหวัด vs ภูมิภาค” ออกเลย (แก้ตามรูปที่วงไว้)
const SYS_PROMPT = [
  'คุณเป็น "แพทย์" อธิบายสถานการณ์โรคให้คนทั่วไปเข้าใจง่าย แบบสั้น กระชับ และเป็นมิตร',
  'สร้าง "บทความ Markdown ภาษาไทย" จาก JSON ที่ให้เท่านั้น (ห้ามเดาค่าที่ไม่มีใน JSON)',
  "",
  "รูปแบบหัวข้อ (สำคัญมาก):",
  "- ใช้หัวข้อเป็นตัวหนาเท่านั้น เช่น **รายงานเปรียบเทียบ** (ห้ามใช้ #/##/###)",
  "- เนื้อความปกติห้ามใส่ตัวหนา ยกเว้นหัวข้อเท่านั้น",
  "",
  "ต้องมีหัวข้อเหล่านี้เรียงตามลำดับทุกครั้ง:",
  "**รายงานเปรียบเทียบ**",
  "- ระบุโรค, จังหวัดหลัก, จังหวัดเปรียบเทียบ, ช่วงวันที่แบบไทย",
  '- สรุป "ผู้ป่วยสะสม" ของทั้ง 2 จังหวัด พร้อม "ส่วนต่าง (ราย)" และบอกว่า "ใครมากกว่า"',
  '- สรุป "ผู้เสียชีวิตสะสม" ของทั้ง 2 จังหวัด พร้อม "ส่วนต่าง (ราย)" และบอกว่า "ใครมากกว่า"',
  "",
  "**คำอธิบายเชิงการแพทย์**",
  "- อธิบายแบบหมอคุยกับคนไข้ 2–4 ประโยค",
  "- เน้นว่าโรคนี้คืออะไร, อาการพบบ่อย, กลุ่มเสี่ยง, และควรทำอย่างไรเมื่อเริ่มมีอาการ",
  "- ห้ามใส่ตัวเลขที่ไม่ได้อยู่ใน JSON และห้ามแต่งเรื่องเพิ่ม",
  "",
  "**แนวโน้มรายเดือน**",
  "- วิเคราะห์แนวโน้มรายเดือนของทั้ง 2 จังหวัดแบบสั้นๆ",
  "- ต้องมีประโยคสรุปว่าเดือนพีค/ต่ำสุดของแต่ละจังหวัดคือเดือนไหน (ถ้ามีข้อมูล)",
  '- ถ้ามีข้อมูลเพียงพอ ให้สรุปว่า "จังหวัดไหนพีคสูงกว่า" ด้วยตัวเลขรวมของเดือนนั้น',
  "- เดือนใช้รูปแบบย่อภาษาไทย + ปี พ.ศ. (เช่น ม.ค. 2567)",
  "",
  "**การเปรียบเทียบระหว่างจังหวัด**",
  "- หัวข้อนี้ต้องเขียนแบบตรงประเด็น (เหมือนในรูปที่ผู้ใช้ต้องการ):",
  "  - แสดงตัวเลขของทั้ง 2 จังหวัดในบรรทัดเดียวกัน (เช่น กทม X ราย vs ชม Y ราย)",
  "  - ต่อท้ายด้วยส่วนต่าง (ต่างกัน Z ราย) และบอกว่าใครมากกว่า",
  "- เปรียบเทียบอย่างน้อย 2 เรื่อง:",
  '  1) "ผู้ป่วยสะสม" และ 2) "ผู้เสียชีวิตสะสม"',
  "- ห้ามพูดถึงคำว่า ภูมิภาค/region ในหัวข้อนี้",
  "",
  "**การกระจายตามกลุ่มอายุ**",
  "- ของทั้ง 2 จังหวัด: ระบุช่วงอายุ/ช่วงวัยที่มากที่สุด (ผู้ป่วย และผู้เสียชีวิต ถ้ามี)",
  "- ต้องเขียนแบบเทียบกัน เช่น จังหวัดหลักมากสุดช่วงวัย..., จังหวัดเปรียบเทียบมากสุดช่วงวัย...",
  '- แสดงตัวเลขพร้อมหน่วย "ราย"',
  "",
  "**เปรียบเทียบเพศ**",
  "- ของทั้ง 2 จังหวัด: ผู้ป่วยสะสมแยกเพศ ชาย/หญิง (+ ไม่ระบุ ถ้ามี)",
  "- ของทั้ง 2 จังหวัด: ผู้เสียชีวิตสะสมแยกเพศ ชาย/หญิง (+ ไม่ระบุ ถ้ามี)",
  "- สรุปว่าเพศไหนเด่นในแต่ละจังหวัด และจังหวัดไหนมีจำนวนรวมมากกว่า (ถ้ามีข้อมูล)",
  "",
  "**ข้อเสนอแนะเชิงปฏิบัติ**",
  "- แนะนำสั้นๆ แบบหมอ: ป้องกัน, ลดการแพร่เชื้อ, เมื่อไหร่ควรไปพบแพทย์",
  "- ถ้าจังหวัดใดมีภาระสูงกว่า (ตามตัวเลขสะสม) ให้เน้นมาตรการเชิงรุกกับจังหวัดนั้น",
  "",
  "**สรุปย่อ**",
  "- 2–4 บรรทัด สรุปใจความสำคัญที่สุด โดยต้องมี 1 บรรทัดที่บอกว่าใครมากกว่าในผู้ป่วย และใครมากกว่าในผู้เสียชีวิต",
  "",
  "ข้อกำหนดเคร่งครัด:",
  "- แสดงตัวเลขด้วยตัวคั่นหลักพัน (เช่น 6,541)",
  "- ทุกตัวเลขต้องมาจาก JSON เท่านั้น (ห้ามคาดเดา)",
  "- สามารถคำนวณ 'ส่วนต่าง' ได้โดยลบจากตัวเลขใน JSON",
  '- หากไม่มีข้อมูล ให้เขียนว่า "ไม่มีข้อมูลเพียงพอ"',
  "- ต้องจบครบทุกหัวข้อ",
].join("\n");

function makeDiseaseLabel(p: ComparePayload) {
  const name = String(p.diseaseName ?? "").trim();
  const code = String(p.diseaseCode ?? "").trim();
  if (name) return name;
  if (code) return code;
  const old = String(p.disease ?? "").trim();
  return old || "ไม่ระบุ";
}

function makeUserPrompt(args: {
  payload: ComparePayload;
  summaries: any;
}) {
  const { payload, summaries } = args;

  const diseaseLabel = makeDiseaseLabel(payload);
  const header = `โรค: ${diseaseLabel} | จังหวัดหลัก: ${payload.mainProvince} | จังหวัดเปรียบเทียบ: ${payload.compareProvince} | ช่วงเวลา: ${payload.timeRange.start} ถึง ${payload.timeRange.end}`;

  const guidance = `
ข้อกำหนดเพิ่มเติม:
- เขียนให้สั้น อ่านง่าย เหมือนหมออธิบายให้คนทั่วไปฟัง
- หัวข้อ "การเปรียบเทียบระหว่างจังหวัด" ต้องมีรูปแบบ: A X ราย vs B Y ราย (ต่างกัน Z ราย) + ใครมากกว่า
- ห้ามเทียบกับ "ภูมิภาค/region" ในรายงานนี้
- ทุกตัวเลขใส่หน่วย "ราย" และคั่นหลักพัน
`.trim();

  const json = JSON.stringify(
    {
      ...payload,
      // เพิ่ม computed เพื่อให้ LLM “ไม่พลาดคำนวณ” และทำให้เขียนได้ตรงแบบในรูป
      computed: summaries,
    },
    null,
    2
  );

  const notes = String(payload.compareNotes ?? "").trim();

  return `${header}

${guidance}

หมายเหตุเพิ่มเติมจากผู้ใช้ (ถ้ามี):
${notes || "ไม่มี"}

ข้อมูลเปรียบเทียบ (JSON):
${json}

คำสั่ง:
- ยึดหัวข้อและกฎใน System Prompt อย่างเคร่งครัด
- ห้ามหยุดก่อนจบหัวข้อ "**สรุปย่อ**"
`;
}

function looksIncomplete(markdown: string) {
  const mustHave = [
    "**รายงานเปรียบเทียบ**",
    "**คำอธิบายเชิงการแพทย์**",
    "**แนวโน้มรายเดือน**",
    "**การเปรียบเทียบระหว่างจังหวัด**",
    "**การกระจายตามกลุ่มอายุ**",
    "**เปรียบเทียบเพศ**",
    "**ข้อเสนอแนะเชิงปฏิบัติ**",
    "**สรุปย่อ**",
  ];
  return !mustHave.every((h) => markdown.includes(h));
}

// -------------------- Main route --------------------
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ComparePayload | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // disease code resolve (รองรับทั้ง payload ใหม่/เก่า)
    const diseaseCode =
      String(body.diseaseCode ?? "").trim() ||
      extractDiseaseCode(body.disease) ||
      extractDiseaseCode(body.mainData?.diseaseCode) ||
      extractDiseaseCode(body.mainData?.disease) ||
      "";

    if (!diseaseCode) {
      return NextResponse.json(
        { ok: false, error: "Missing diseaseCode" },
        { status: 400 }
      );
    }

    // disease name resolve
    const diseaseNameFromPayload =
      String(body.diseaseName ?? "").trim() ||
      String(body.mainData?.diseaseName ?? "").trim();

    const diseaseNameFromDB = diseaseNameFromPayload
      ? ""
      : await resolveDiseaseNameFromDB(diseaseCode);

    const diseaseNameFinal = diseaseNameFromPayload || diseaseNameFromDB || "";

    // ✅ ทำ payload ให้ชัด + กันช่องว่าง
    const payload: ComparePayload = {
      ...body,
      diseaseCode,
      diseaseName: diseaseNameFinal || body.diseaseName,
      disease: diseaseNameFinal || body.disease || body.mainData?.disease || diseaseCode,

      mainProvince: String(body.mainProvince ?? body.mainData?.province ?? "").trim(),
      compareProvince: String(body.compareProvince ?? body.compareData?.province ?? "").trim(),

      mainData: {
        ...body.mainData,
        province: String(body.mainProvince ?? body.mainData?.province ?? "").trim(),
        diseaseCode,
        diseaseName: diseaseNameFinal || body.mainData?.diseaseName,
        disease: diseaseNameFinal || body.mainData?.disease || diseaseCode,
      },
      compareData: {
        ...body.compareData,
        province: String(body.compareProvince ?? body.compareData?.province ?? "").trim(),
        diseaseCode,
        diseaseName: diseaseNameFinal || body.compareData?.diseaseName,
        disease: diseaseNameFinal || body.compareData?.disease || diseaseCode,
      },
    };

    if (!payload.mainProvince || !payload.compareProvince) {
      return NextResponse.json(
        { ok: false, error: "Missing provinces for comparison" },
        { status: 400 }
      );
    }

    // ✅ สรุปแบบ deterministic (ใส่ diff + ใครมากกว่า)
    const summaries = buildCompareSummaries(payload);

    // ✅ กันไม่ให้ LLM เอา "D04" ไปโชว์ ถ้ามีชื่อโรค
    const promptPayload: ComparePayload = {
      ...payload,
      diseaseCode: undefined,
      disease: diseaseNameFinal || payload.disease,
      mainData: {
        ...payload.mainData,
        diseaseCode: undefined,
        disease: diseaseNameFinal || payload.mainData.disease,
      },
      compareData: {
        ...payload.compareData,
        diseaseCode: undefined,
        disease: diseaseNameFinal || payload.compareData.disease,
      },
    };

    // Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    const basePrompt = `System:\n${SYS_PROMPT}\n\nUser:\n${makeUserPrompt({
      payload: promptPayload,
      summaries,
    })}`;

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
