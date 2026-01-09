"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarIcon, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useSession } from "next-auth/react";

type Disease = { code: string; name_th: string; name_en: string };
type SavedSearch = {
  id: number;
  searchName: string;
  diseaseName: string;
  province: string;
  provinceAlt: string;
  startDate: string;
  endDate: string;
  color: string;
  createdAt: string;
};

const DEFAULT_DISEASE_CODE = "D01";
const DEFAULT_DISEASE_NAME_TH = "ไข้หวัดใหญ่";
const DEFAULT_START = "2024-01-01";
const DEFAULT_END = "2024-06-30";

// event ที่ใช้คุยกับหน้า PageDescription
const HOME_NARRATIVE_EVENT = "ai:home:narrative:generate";

export default function HomeSidebar() {
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const { start_date, end_date, setDateRange, diseaseCode, setDisease, setProvince } =
    useDashboardStore();

  const router = useRouter();
  const searchParams = useSearchParams();

  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [diseaseErr, setDiseaseErr] = useState<string | null>(null);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedErr, setSavedErr] = useState<string | null>(null);

  const labelOf = useCallback((s: SavedSearch) => {
    const parts: string[] = [s.searchName];
    if (s.diseaseName) parts.push(s.diseaseName);
    if (s.startDate && s.endDate) parts.push(`${s.startDate}→${s.endDate}`);
    return parts.join(" • ");
  }, []);

  const diseaseLabel = useCallback((d: Disease) => {
    const th = (d.name_th || "").trim();
    const en = (d.name_en || "").trim();
    return en ? `${th} (${en})` : th;
  }, []);

  const applySavedSearch = useCallback(
    (s: SavedSearch) => {
      const d = diseases.find((x) => x.name_th === s.diseaseName || x.code === s.diseaseName);
      if (d) setDisease(d.code, d.name_th);
      else if (s.diseaseName) setDisease(DEFAULT_DISEASE_CODE, s.diseaseName);

      const pv = (s.provinceAlt || s.province || "").trim();
      if (pv) setProvince(pv);

      setDateRange(s.startDate || DEFAULT_START, s.endDate || DEFAULT_END);
      router.push("/dashBoard");
    },
    [diseases, router, setDateRange, setDisease, setProvince]
  );

  // ✅ ปุ่ม Generate ที่หัวกล่อง (ยิง event ไปให้หน้า PageDescription)
  const lastFireAtRef = useRef(0);
  const fireHomeNarrative = useCallback(() => {
    const now = Date.now();
    if (now - lastFireAtRef.current < 400) return;
    lastFireAtRef.current = now;

    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(HOME_NARRATIVE_EVENT));
  }, []);

  // init date + disease from query
  useEffect(() => {
    const qsDisease = searchParams.get("disease");

    if (!start_date && !end_date) {
      setDateRange(DEFAULT_START, DEFAULT_END);
    } else if (start_date && !end_date) {
      setDateRange(start_date, DEFAULT_END);
    } else if (!start_date && end_date) {
      setDateRange(DEFAULT_START, end_date);
    }

    if (!diseaseCode) {
      if (qsDisease) setDisease(qsDisease, "");
      else setDisease(DEFAULT_DISEASE_CODE, DEFAULT_DISEASE_NAME_TH);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load diseases
  useEffect(() => {
    (async () => {
      try {
        setDiseaseErr(null);
        const res = await fetch("/api/diseases", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as { diseases: Disease[] } | Disease[];
        const rows = Array.isArray(data) ? data : data?.diseases || [];
        setDiseases(rows);

        const qs = searchParams.get("disease");
        const targetCode = qs || diseaseCode || DEFAULT_DISEASE_CODE;

        const hit =
          rows.find((d) => d.code === targetCode) ??
          rows.find((d) => d.code === DEFAULT_DISEASE_CODE) ??
          rows[0];

        if (hit) setDisease(hit.code, hit.name_th);
        else setDisease(DEFAULT_DISEASE_CODE, DEFAULT_DISEASE_NAME_TH);
      } catch (e) {
        console.error("โหลด /api/diseases ไม่สำเร็จ:", e);
        setDiseaseErr("โหลดรายการโรคไม่สำเร็จ");
        if (!diseaseCode) setDisease(DEFAULT_DISEASE_CODE, DEFAULT_DISEASE_NAME_TH);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load saved searches when authed
  useEffect(() => {
    (async () => {
      if (!isAuthed) return;
      try {
        setSavedLoading(true);
        setSavedErr(null);
        const res = await fetch("/api/saved-searches", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SavedSearch[];
        setSavedSearches(json);
      } catch (e) {
        console.error(e);
        setSavedErr("โหลดรายการค้นหาที่บันทึกไว้ไม่สำเร็จ");
      } finally {
        setSavedLoading(false);
      }
    })();
  }, [isAuthed]);

  const goCreate = () => router.push("/search-template");

  return (
    <section className="w-full">
      <div className="rounded-[28px] bg-white px-6 py-5 shadow-[0_18px_45px_rgba(33,150,243,0.25)] ring-1 ring-sky-100">
        {/* ✅ หัวกล่อง + (คำอธิบาย AI Narrative + ปุ่ม Generate) */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">ตัวกรองข้อมูล</h3>
            <p className="mt-1 text-xs text-slate-600">
              เลือกโรคและช่วงเวลาเพื่อใช้กับแผนที่และกราฟในหน้าแรก
            </p>
          </div>

          {/* ✅ มุมขวา: ข้อความอยู่เหนือปุ่ม */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="text-xs font-semibold text-[#042743]">
              AI Narrative — คำอธิบายแดชบอร์ดอัตโนมัติ
            </div>

            <button
              type="button"
              onClick={fireHomeNarrative}
              className="rounded-full bg-[#042743] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#053251] focus:outline-none focus:ring-2 focus:ring-[#042743]/30"
            >
              Generate Narrative
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* เลือกโรค */}
          <div className="md:col-span-5">
            <label className="mb-1 block text-sm font-medium text-slate-800">
              เลือกโรค
            </label>

            <select
              value={diseaseCode}
              onChange={(e) => {
                const code = e.target.value;
                const d = diseases.find((x) => x.code === code);
                setDisease(code, d?.name_th ?? "");
              }}
              className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
            >
              {diseases.length === 0 && <option value={diseaseCode || ""}>กำลังโหลด...</option>}
              {diseases.map((d) => (
                <option key={d.code} value={d.code}>
                  {/* ✅ ไม่โชว์ D01/D02/... */}
                  {diseaseLabel(d)}
                </option>
              ))}
            </select>

            {diseaseErr && (
              <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-600">
                {diseaseErr}
              </p>
            )}
          </div>

          {/* เลือกระยะเวลา */}
          <div className="md:col-span-4">
            <label className="mb-1 block text-sm font-medium text-slate-800">
              เลือกระยะเวลา
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
              <div className="relative">
                <input
                  type="date"
                  value={start_date}
                  onChange={(e) => setDateRange(e.target.value, end_date)}
                  className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 pl-10 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
                />
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-sky-700" />
              </div>

              <div className="relative">
                <input
                  type="date"
                  value={end_date}
                  onChange={(e) => setDateRange(start_date, e.target.value)}
                  className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 pl-10 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
                />
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-sky-700" />
              </div>
            </div>
          </div>

          {/* การค้นหาที่บันทึกไว้ (เฉพาะ login) */}
          <div className="md:col-span-3">
            {isAuthed ? (
              <div className="h-full">
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  การค้นหาที่บันทึกไว้
                </label>

                {savedLoading ? (
                  <div className="w-full rounded-full bg-sky-50 px-4 py-2 text-sm text-gray-500">
                    กำลังโหลด...
                  </div>
                ) : savedErr ? (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{savedErr}</div>
                ) : savedSearches.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (!id) return;
                        const s = savedSearches.find((x) => x.id === id);
                        if (!s) return;
                        applySavedSearch(s);
                      }}
                      className="w-full flex-1 rounded-full border border-sky-100 bg-white px-4 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
                      aria-label="เลือกการค้นหาที่บันทึกไว้"
                    >
                      <option value="" disabled>
                        — เลือกการค้นหาที่บันทึก —
                      </option>
                      {savedSearches.map((s) => (
                        <option key={s.id} value={s.id}>
                          {labelOf(s)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={goCreate}
                      title="สร้างการค้นหาใหม่"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-400 text-white shadow-md transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-300"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={goCreate}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-sky-700 ring-1 ring-sky-300 transition hover:bg-sky-50"
                  >
                    <Plus className="h-4 w-4" />
                    สร้างการค้นหา
                  </button>
                )}
              </div>
            ) : (
              <div className="h-full">
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  การค้นหาที่บันทึกไว้
                </label>
                <div className="rounded-xl bg-sky-50 p-3 text-xs text-slate-600">
                  เข้าสู่ระบบเพื่อใช้ “การค้นหาที่บันทึกไว้”
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
