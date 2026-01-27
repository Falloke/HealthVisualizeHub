// app/features/main/searchTemplate/component/CreateSearch.tsx
"use client";

import { HexColorPicker } from "react-colorful";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

type Errors = Partial<
  Record<
    | "searchName"
    | "province"
    | "startDate"
    | "endDate"
    | "diseaseCode"
    | "diseaseOther"
    | "diseaseProvince"
    | "color",
    string
  >
>;

type ProvinceItem = {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
};

type Disease = {
  code: string; // D01
  name_th: string; // ไข้หวัดใหญ่
  name_en: string; // Influenza
};

// สีอัตโนมัติของโรค (อิงชื่อภาษาไทยที่ฐานข้อมูลมี)
const DISEASE_COLOR: Record<string, string> = {
  ไข้หวัดใหญ่: "#E89623",
  ไข้เลือดออก: "#EF4444",
  โรคฝีดาษลิง: "#8B5CF6",
};

// ---------- helper แบ่งจังหวัดตามภูมิภาค + label เส้นยาว ----------
function groupProvinces(list: ProvinceItem[]): Record<string, ProvinceItem[]> {
  return list.reduce<Record<string, ProvinceItem[]>>((acc, p) => {
    const region = p.Region_VaccineRollout_MOPH || "อื่น ๆ";
    if (!acc[region]) acc[region] = [];
    acc[region].push(p);
    return acc;
  }, {});
}

const BASE_REGION = "กรุงเทพมหานครและปริมณฑล";
const BASE_LABEL = `──────── ${BASE_REGION} ────────`;
const TARGET_LEN = [...BASE_LABEL].length;

function makeRegionLabel(region: string): string {
  const clean = region.trim();
  const inner = ` ${clean} `;
  const innerLen = [...inner].length;

  const dashTotal = Math.max(4, TARGET_LEN - innerLen);
  const left = Math.floor(dashTotal / 2);
  const right = dashTotal - left;

  return `${"─".repeat(left)}${inner}${"─".repeat(right)}`;
}
// -------------------------------------------------------------

/** วันที่แบบสตริง YYYY-MM-DD */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD");

function zodToErrors(err: z.ZodError<unknown>) {
  const out: Errors = {};
  err.issues.forEach((issue) => {
    const path0 = issue.path?.[0];
    if (typeof path0 === "string") out[path0 as keyof Errors] = issue.message;
  });
  return out;
}

export default function SearchCreate() {
  const router = useRouter();

  // ---------- Provinces ----------
  const [provinces, setProvinces] = useState<ProvinceItem[]>([]);
  const [provLoading, setProvLoading] = useState(true);
  const [provErr, setProvErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setProvLoading(true);
        setProvErr(null);
        const res = await fetch("/data/Thailand-ProvinceName.json", {
          cache: "force-cache",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ProvinceItem[] = await res.json();
        if (!data.length) throw new Error("empty province list");
        setProvinces(data);
      } catch (e) {
        console.error("โหลดจังหวัดล้มเหลว:", e);
        setProvErr("โหลดรายชื่อจังหวัดไม่สำเร็จ");
      } finally {
        setProvLoading(false);
      }
    })();
  }, []);

  // ---------- Diseases ----------
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [dzLoading, setDzLoading] = useState(true);
  const [dzErr, setDzErr] = useState<string | null>(null);

  // ✅ เปลี่ยนเป็นเก็บ diseaseCode (ไม่เก็บชื่อ) เพื่อกัน D01 โผล่/validate พัง
  const [formData, setFormData] = useState({
    searchName: "",
    province: "",
    startDate: "",
    endDate: "",
    diseaseCode: "", // ✅ D01 / D04 / ...
    diseaseOther: "", // ✅ กรณี OTHER
    diseaseProvince: "",
    color: "#E89623",
  });

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const provinceNames = useMemo(
    () => provinces.map((p) => p.ProvinceNameThai).filter(Boolean),
    [provinces]
  );

  const provinceSet = useMemo(() => new Set(provinceNames), [provinceNames]);

  const isOtherDisease = formData.diseaseCode === "OTHER";

  const selectedDisease = useMemo(() => {
    if (!formData.diseaseCode) return null;
    return diseases.find((d) => d.code === formData.diseaseCode) ?? null;
  }, [diseases, formData.diseaseCode]);

  // โหลดโรค
  useEffect(() => {
    (async () => {
      try {
        setDzLoading(true);
        setDzErr(null);
        const res = await fetch("/api/diseases", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { diseases: Disease[] } | Disease[];
        const rows = Array.isArray(json) ? json : json?.diseases || [];
        setDiseases(rows);

        // ✅ ตั้งค่า default: เลือกตัวแรก (ไม่จำเป็นต้อง D01) และไม่โชว์ code
        if (rows.length > 0) {
          const first = rows.find((d) => d.code === "D01") ?? rows[0];
          setFormData((p) => ({
            ...p,
            diseaseCode: first.code,
            color: DISEASE_COLOR[first.name_th] ?? p.color,
          }));
        }
      } catch (e) {
        console.error("โหลดโรคจากฐานข้อมูลล้มเหลว:", e);
        setDzErr("โหลดรายชื่อโรคไม่สำเร็จ");
      } finally {
        setDzLoading(false);
      }
    })();
  }, []);

  // label โรค (ไม่โชว์ code)
  const diseaseLabel = (d: Disease) => {
    const th = (d.name_th || "").trim();
    const en = (d.name_en || "").trim();
    return en ? `${th} (${en})` : th;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;

    if (id === "diseaseCode") {
      if (value === "OTHER") {
        setFormData((prev) => ({
          ...prev,
          diseaseCode: "OTHER",
          diseaseOther: "",
          color: "#E89623",
        }));
        return;
      }

      const hit = diseases.find((d) => d.code === value);
      setFormData((prev) => ({
        ...prev,
        diseaseCode: value,
        diseaseOther: "",
        color: DISEASE_COLOR[hit?.name_th || ""] ?? prev.color,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  // ✅ validation ใหม่: รองรับโรคจาก DB + OTHER (ไม่ hardcode enum ชื่อไทย)
  const validate = (): boolean => {
    setErrors({});

    const schema = z
      .object({
        searchName: z.string().trim().min(1, "กรุณากรอกชื่อการค้นหา"),
        province: z
          .string()
          .trim()
          .min(1, "กรุณาเลือกจังหวัด")
          .refine((v) => provinceSet.size === 0 || provinceSet.has(v), {
            message: "จังหวัดไม่ถูกต้อง",
          }),
        startDate: z.string().trim().optional(),
        endDate: z.string().trim().optional(),
        diseaseCode: z
          .string()
          .trim()
          .min(1, "กรุณาเลือกโรค")
          .refine((v) => v === "OTHER" || /^D\d{2}$/.test(v), {
            message: "รูปแบบรหัสโรคไม่ถูกต้อง",
          }),
        diseaseOther: z.string().trim().optional(),
        diseaseProvince: z.string().trim().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "สีต้องเป็น #RRGGBB"),
      })
      .superRefine((v, ctx) => {
        // date format checks
        if (v.startDate) {
          const r = dateStr.safeParse(v.startDate);
          if (!r.success) ctx.addIssue({ code: "custom", path: ["startDate"], message: r.error.issues[0]?.message ?? "วันที่เริ่มต้นไม่ถูกต้อง" });
        }
        if (v.endDate) {
          const r = dateStr.safeParse(v.endDate);
          if (!r.success) ctx.addIssue({ code: "custom", path: ["endDate"], message: r.error.issues[0]?.message ?? "วันที่สิ้นสุดไม่ถูกต้อง" });
        }
        if (v.startDate && v.endDate) {
          if (new Date(v.startDate) > new Date(v.endDate)) {
            ctx.addIssue({
              code: "custom",
              path: ["endDate"],
              message: "วันเริ่มต้นต้องไม่เกินวันสิ้นสุด",
            });
          }
        }

        // OTHER ต้องกรอกชื่อโรค
        if (v.diseaseCode === "OTHER") {
          if (!v.diseaseOther || v.diseaseOther.trim().length === 0) {
            ctx.addIssue({
              code: "custom",
              path: ["diseaseOther"],
              message: "กรุณาระบุชื่อโรค",
            });
          }
        } else {
          // ต้องมี code อยู่ใน list (ถ้าโหลดมาแล้ว)
          if (diseases.length > 0 && !diseases.some((d) => d.code === v.diseaseCode)) {
            ctx.addIssue({
              code: "custom",
              path: ["diseaseCode"],
              message: "ไม่พบรหัสโรคในระบบ",
            });
          }
        }
      });

    const parsed = schema.safeParse(formData);
    if (!parsed.success) {
      setErrors(zodToErrors(parsed.error));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const diseaseCode = formData.diseaseCode;
      const diseaseNameTh = isOtherDisease
        ? formData.diseaseOther.trim()
        : (selectedDisease?.name_th || "").trim();

      // ✅ ส่งทั้ง diseaseCode + diseaseName (เผื่อ API ยังรองรับแบบเก่า)
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchName: formData.searchName.trim(),

          // ใหม่ (แนะนำ)
          diseaseCode,
          diseaseName: diseaseNameTh,

          // เก่า (กันพัง ถ้า backend ยังใช้ diseaseName)
          disease: diseaseNameTh,

          province: formData.province.trim(),
          diseaseProvince: formData.diseaseProvince.trim(),
          startDate: formData.startDate || "",
          endDate: formData.endDate || "",
          color: formData.color,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "บันทึกไม่สำเร็จ");
      }

      // ✅ หน้า dashboard ใช้ disease เป็น “code” (ไม่ใช่ชื่อ)
      const q = new URLSearchParams({
        province: formData.province.trim(),
        start_date: formData.startDate || "",
        end_date: formData.endDate || "",
        disease: diseaseCode === "OTHER" ? "" : diseaseCode, // OTHER ไม่มี table/code ใช้กับ dashboard
        color: formData.color || "",
      }).toString();

      router.push(`/dashBoard?${q}`);
    } catch (err) {
      console.error(err);
      alert("บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const provinceGroups = useMemo(() => groupProvinces(provinces), [provinces]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-12">
      <h1 className="mb-10 text-3xl font-bold text-sky-700 md:text-4xl">
        สร้างการค้นหา
      </h1>

      <form
        onSubmit={handleSubmit}
        className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2"
        noValidate
      >
        {/* Left side */}
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium text-gray-700">
            ชื่อการค้นหา*
            <input
              id="searchName"
              type="text"
              value={formData.searchName}
              onChange={handleChange}
              placeholder="กรุณากรอกชื่อ"
              className={`mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 ${
                errors.searchName ? "border-red-500" : ""
              }`}
              required
            />
            {errors.searchName && (
              <p className="mt-1 text-xs text-red-600">{errors.searchName}</p>
            )}
          </label>

          <label className="text-sm font-medium text-gray-700">
            เลือกจังหวัด*
            <select
              id="province"
              value={formData.province}
              onChange={handleChange}
              disabled={provLoading || !!provErr}
              className="mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:bg-gray-100"
            >
              <option value="">
                {provLoading
                  ? "กำลังโหลดจังหวัด..."
                  : provErr ?? "กรุณาเลือกจังหวัด"}
              </option>
              {!provLoading &&
                !provErr &&
                Object.entries(provinceGroups)
                  .sort(([a], [b]) => a.localeCompare(b, "th-TH"))
                  .map(([region, items]) => (
                    <optgroup key={region} label={makeRegionLabel(region)}>
                      {items.map((p) => (
                        <option key={p.ProvinceNo} value={p.ProvinceNameThai}>
                          {p.ProvinceNameThai}
                        </option>
                      ))}
                    </optgroup>
                  ))}
            </select>
            {errors.province && (
              <p className="mt-1 text-xs text-red-600">{errors.province}</p>
            )}
          </label>

          <div className="text-sm font-medium text-gray-700">
            ช่วงระยะเวลา*
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600">
                วันเริ่มต้น
                <input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={handleChange}
                  className={`mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 ${
                    errors.startDate ? "border-red-500" : ""
                  }`}
                />
                {errors.startDate && (
                  <p className="mt-1 text-xs text-red-600">{errors.startDate}</p>
                )}
              </label>

              <label className="text-xs text-gray-600">
                วันสิ้นสุด
                <input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={handleChange}
                  className={`mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 ${
                    errors.endDate ? "border-red-500" : ""
                  }`}
                  min={formData.startDate || undefined}
                />
                {errors.endDate && (
                  <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>
                )}
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 self-start rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:opacity-60"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึกการสร้าง"}
          </button>
        </div>

        {/* Right side */}
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium text-gray-700">
            เลือกโรค*
            <select
              id="diseaseCode"
              value={formData.diseaseCode}
              onChange={handleChange}
              className={`mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 ${
                errors.diseaseCode ? "border-red-500" : ""
              }`}
            >
              <option value="">
                {dzLoading ? "กำลังโหลดโรค..." : dzErr ?? "กรุณาเลือกโรค"}
              </option>

              {!dzLoading &&
                !dzErr &&
                diseases.map((d) => (
                  <option key={d.code} value={d.code}>
                    {/* ✅ ไม่โชว์ D01 บนหน้าเว็บ */}
                    {diseaseLabel(d)}
                  </option>
                ))}

              <option value="OTHER">อื่น ๆ (กำหนดเอง)</option>
            </select>
            {errors.diseaseCode && (
              <p className="mt-1 text-xs text-red-600">{errors.diseaseCode}</p>
            )}
          </label>

          {isOtherDisease && (
            <label className="text-sm font-medium text-gray-700">
              ชื่อโรค (กรณีเลือก “อื่น ๆ”)*
              <input
                id="diseaseOther"
                type="text"
                value={formData.diseaseOther}
                onChange={handleChange}
                placeholder="กรุณาระบุชื่อโรค"
                className={`mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 ${
                  errors.diseaseOther ? "border-red-500" : ""
                }`}
              />
              {errors.diseaseOther && (
                <p className="mt-1 text-xs text-red-600">{errors.diseaseOther}</p>
              )}
            </label>
          )}

          <label className="text-sm font-medium text-gray-700">
            จังหวัดที่ต้องการเปรียบเทียบเลือกจังหวัดของโรค
            <select
              id="diseaseProvince"
              value={formData.diseaseProvince}
              onChange={handleChange}
              disabled={provLoading || !!provErr}
              className="mt-1 w-full rounded-md border p-2 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:bg-gray-100"
            >
              <option value="">
                {provLoading
                  ? "กำลังโหลดจังหวัด..."
                  : provErr ?? "กรุณาเลือกจังหวัด"}
              </option>
              {!provLoading &&
                !provErr &&
                Object.entries(provinceGroups)
                  .sort(([a], [b]) => a.localeCompare(b, "th-TH"))
                  .map(([region, items]) => (
                    <optgroup key={region} label={makeRegionLabel(region)}>
                      {items.map((p) => (
                        <option key={p.ProvinceNo} value={p.ProvinceNameThai}>
                          {p.ProvinceNameThai}
                        </option>
                      ))}
                    </optgroup>
                  ))}
            </select>
            {errors.diseaseProvince && (
              <p className="mt-1 text-xs text-red-600">{errors.diseaseProvince}</p>
            )}
          </label>

          <div className="text-sm font-medium text-gray-700">
            สีที่ใช้แสดงผล
            <div
              className="mt-1 h-10 w-full rounded border"
              style={{ backgroundColor: formData.color }}
              aria-label="preview-color"
              title={formData.color}
            />
            {isOtherDisease ? (
              <>
                <p className="mt-2 text-xs text-gray-500">
                  เลือกสีได้อิสระ (กรณีเลือก “อื่น ๆ”)
                </p>
                <HexColorPicker
                  color={formData.color}
                  onChange={(color) => setFormData((p) => ({ ...p, color }))}
                  className="mt-3"
                />
              </>
            ) : (
              <p className="mt-2 text-xs text-gray-500"></p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}