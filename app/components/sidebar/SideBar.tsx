// D:\HealtRiskHub\app\components\sidebar\SideBar.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarIcon, Plus, Filter } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

interface Province {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
}

type Disease = {
  code: string;
  name_th: string;
  name_en: string;
};

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

function groupProvinces(provinces: Province[]): Record<string, Province[]> {
  return provinces.reduce<Record<string, Province[]>>((acc, p) => {
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

export default function Sidebar() {
  const pathname = usePathname() || "";

  const HIDE_PREFIXES = [
    "/login",
    "/register",
    "/profile",
    "/editprofile",
    "/history",
    "/search-template",
    "/search",
    "/home",
  ];
  const HIDE_EXACT = ["/"];

  const shouldHide =
    HIDE_EXACT.includes(pathname) ||
    HIDE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (shouldHide) return null;

  const isComparePage = pathname.startsWith("/compareInfo");
  return <SidebarInner isComparePage={isComparePage} pathname={pathname} />;
}

function SidebarInner({
  isComparePage,
  pathname,
}: {
  isComparePage: boolean;
  pathname: string;
}) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [diseases, setDiseases] = useState<Disease[]>([]);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedErr, setSavedErr] = useState<string | null>(null);
  const [canSeeSaved, setCanSeeSaved] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    province,
    start_date,
    end_date,
    setProvince,
    setDateRange,
    diseaseCode,
    setDisease,
  } = useDashboardStore();

  const {
    mainProvince,
    compareProvince,
    setMainProvince,
    setCompareProvince,
  } = useCompareStore();

  const hasBothCompare = !!mainProvince && !!compareProvince;

  const labelOf = useCallback((s: SavedSearch) => {
    const parts: string[] = [s.searchName];
    if (s.diseaseName) parts.push(s.diseaseName);
    const pv = (s.provinceAlt || s.province || "").trim();
    if (pv) parts.push(pv);
    if (s.startDate && s.endDate) parts.push(`${s.startDate}→${s.endDate}`);
    return parts.join(" • ");
  }, []);

  const applySavedSearch = useCallback(
    (s: SavedSearch) => {
      const found = diseases.find(
        (d) => d.name_th === s.diseaseName || d.code === s.diseaseName
      );

      if (found) setDisease(found.code, found.name_th);
      else if (s.diseaseName) setDisease("", s.diseaseName);

      const pv = (s.provinceAlt || s.province || "").trim();
      if (pv) setProvince(pv);

      setDateRange(s.startDate || "", s.endDate || "");
      router.push("/dashBoard");
      setMobileSidebarOpen(false);
    },
    [diseases, router, setDateRange, setDisease, setProvince]
  );

  /* -----------------------------------------------------------
   * ✅ Generate Narrative (หน้า Dashboard/Provincial)
   * ----------------------------------------------------------- */
  const lastFireAtRef = useRef(0);

  const goGenerateNarrative = useCallback(() => {
    const fire = () => {
      const now = Date.now();
      if (now - lastFireAtRef.current < 400) return;
      lastFireAtRef.current = now;

      if (typeof window === "undefined") return;
      window.dispatchEvent(new Event("ai:narrative:generate"));
    };

    const isOnNarrativePage =
      pathname.startsWith("/dashBoard") || pathname.startsWith("/provincialInfo");

    if (isOnNarrativePage) {
      fire();
      setMobileSidebarOpen(false);
      return;
    }

    router.push("/dashBoard");
    setMobileSidebarOpen(false);

    if (typeof window !== "undefined") {
      window.setTimeout(() => fire(), 250);
    }
  }, [router, pathname]);

  /* -----------------------------------------------------------
   * ✅ Generate Narrative (หน้า Compare)
   * ----------------------------------------------------------- */
  const goGenerateCompareNarrative = useCallback(() => {
    const fire = () => {
      const now = Date.now();
      if (now - lastFireAtRef.current < 400) return;
      lastFireAtRef.current = now;

      if (typeof window === "undefined") return;

      (window as any).__HHUB_COMPARE_NARRATIVE_PENDING__ = now;

      window.dispatchEvent(new Event("ai:compare:narrative:generate"));
      window.dispatchEvent(new Event("ai:narrative:generate"));
    };

    const isOnCompare = pathname.startsWith("/compareInfo");

    if (isOnCompare) {
      fire();
      setMobileSidebarOpen(false);
      return;
    }

    router.push("/compareInfo");
    setMobileSidebarOpen(false);

    if (typeof window !== "undefined") {
      window.setTimeout(() => fire(), 300);
    }
  }, [router, pathname]);

  /* -----------------------------------------------------------
   * ✅ โหลดจังหวัด
   * ----------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/Thailand-ProvinceName.json", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load provinces");
        const data: Province[] = await res.json();
        setProvinces(data);
      } catch (e) {
        console.error("Error loading provinces:", e);
      }
    })();
  }, []);

  /* -----------------------------------------------------------
   * ✅ โหลดโรค (รวม event refresh)
   * ----------------------------------------------------------- */
  const loadDiseases = useCallback(async () => {
    try {
      const res = await fetch("/api/diseases", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load diseases");
      const data = (await res.json()) as { diseases: Disease[] };
      const list = data.diseases || [];
      setDiseases(list);

      // ✅ default ถ้ายังไม่เลือกโรค และไม่มี querystring disease
      const qsDisease = searchParams.get("disease");
      if (!diseaseCode && !qsDisease && list.length > 0) {
        const d01 = list.find((d) => d.code === "D01");
        if (d01) setDisease(d01.code, d01.name_th);
        else setDisease(list[0].code, list[0].name_th);
      }
    } catch (e) {
      console.error("Error loading diseases:", e);
    }
  }, [searchParams, diseaseCode, setDisease]);

  useEffect(() => {
    void loadDiseases();
  }, [loadDiseases]);

  // ✅ ฟัง event จาก DiseaseEditor เพื่อรีโหลด dropdown ทันที
  useEffect(() => {
    const handler = () => {
      void loadDiseases();
    };

    window.addEventListener("hhub:diseases:refresh", handler);
    return () => window.removeEventListener("hhub:diseases:refresh", handler);
  }, [loadDiseases]);

  /* -----------------------------------------------------------
   * ✅ อ่าน querystring disease แล้ว setDisease
   * ----------------------------------------------------------- */
  useEffect(() => {
    const qsDisease = searchParams.get("disease");
    if (qsDisease && diseases.length > 0) {
      const found = diseases.find((d) => d.code === qsDisease);
      if (found) setDisease(found.code, found.name_th);
    }
  }, [searchParams, diseases, setDisease]);

  /* -----------------------------------------------------------
   * ✅ โหลด saved searches
   * ----------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      try {
        setSavedLoading(true);
        setSavedErr(null);

        const res = await fetch("/api/saved-searches", { cache: "no-store" });

        if (res.status === 401) {
          setCanSeeSaved(false);
          setSavedLoading(false);
          return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setSavedSearches(json as SavedSearch[]);
      } catch (e) {
        console.error("load saved searches error:", e);
        setSavedErr("โหลดรายการค้นหาที่บันทึกไว้ไม่สำเร็จ");
      } finally {
        setSavedLoading(false);
      }
    })();
  }, []);

  const goCreate = useCallback(() => {
    router.push("/search-template");
    setMobileSidebarOpen(false);
  }, [router]);

  const provinceGroups = groupProvinces(provinces);

  const renderProvinceOptions = (groups: Record<string, Province[]>) =>
    Object.entries(groups)
      .sort(([a, b]) => a.localeCompare(b, "th-TH"))
      .map(([region, items]) => (
        <optgroup key={region} label={makeRegionLabel(region)}>
          {items.map((p) => (
            <option key={p.ProvinceNo} value={p.ProvinceNameThai}>
              {p.ProvinceNameThai}
            </option>
          ))}
        </optgroup>
      ));

  // ✅ ชื่อโรคแบบ "ไทย (อังกฤษ)" โดยไม่โชว์ code
  const diseaseLabel = useCallback((d: Disease) => {
    const th = (d.name_th || "").trim();
    const en = (d.name_en || "").trim();
    return en ? `${th} (${en})` : th;
  }, []);

  return (
    <>
      <aside
        className={`
          z-40
          w-full max-w-xs
          px-3 py-4
          transition-transform duration-300 ease-in-out

          fixed inset-y-0 left-0 top-16
          ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}

          md:translate-x-0
          md:sticky md:top-16 md:inset-y-auto md:left-auto md:self-start
          md:h-[calc(100vh-4rem)]
        `}
      >
        <div
          className="
            flex h-full flex-col gap-6
            rounded-[36px]
            bg-white px-6 py-6
            overflow-y-auto overscroll-contain
            shadow-[0_18px_30px_rgba(33,150,243,0.35)]
          "
        >
          {/* โรค */}
          <div>
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
              {diseases.length === 0 && <option value="">กำลังโหลด...</option>}
              {diseases.map((d) => (
                <option key={d.code} value={d.code}>
                  {diseaseLabel(d)}
                </option>
              ))}
            </select>
          </div>

          {/* จังหวัด */}
          {!isComparePage ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                เลือกจังหวัด
              </label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
              >
                <option value="">-- เลือกจังหวัด --</option>
                {renderProvinceOptions(provinceGroups)}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  เลือกจังหวัดหลัก
                </label>
                <select
                  value={mainProvince}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMainProvince(value);
                    setProvince(value);
                  }}
                  className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
                >
                  <option value="">-- เลือกจังหวัดหลัก --</option>
                  {renderProvinceOptions(provinceGroups)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-800">
                  เลือกจังหวัดที่ต้องการเปรียบเทียบ
                </label>
                <select
                  value={compareProvince}
                  onChange={(e) => setCompareProvince(e.target.value)}
                  className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
                >
                  <option value="">-- เลือกจังหวัดเพื่อเปรียบเทียบ --</option>
                  {renderProvinceOptions(provinceGroups)}
                </select>
              </div>
            </div>
          )}

          {/* วันที่ */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              เลือกระยะเวลา
            </label>

            <div className="relative mb-2">
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

          {/* การค้นหาที่บันทึกไว้ */}
          {!isComparePage && canSeeSaved && (
            <div className="border-t border-sky-100 pt-3">
              <label className="mb-1 block text-sm font-medium text-slate-800">
                การค้นหาที่บันทึกไว้
              </label>

              {savedLoading ? (
                <div className="w-full rounded-full bg-sky-50 px-4 py-2 text-sm text-gray-500">
                  กำลังโหลด...
                </div>
              ) : savedErr ? (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {savedErr}
                </div>
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
          )}

          {/* ล่างสุดของ sidebar */}
          <div className="mt-auto pt-3 border-t border-sky-100">
            <div className="mb-2 text-center text-xs font-medium text-[#042743]">
              AI Narrative — คำอธิบายแดชบอร์ดอัตโนมัติ
            </div>

            {isComparePage ? (
              <button
                type="button"
                onClick={goGenerateCompareNarrative}
                disabled={!hasBothCompare}
                title={!hasBothCompare ? "เลือกจังหวัดให้ครบ 2 จังหวัดก่อน" : ""}
                className={[
                  "flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-md transition focus:outline-none focus:ring-2 focus:ring-[#042743]/30",
                  !hasBothCompare
                    ? "cursor-not-allowed bg-slate-300 text-white"
                    : "bg-[#042743] text-white hover:bg-[#053251]",
                ].join(" ")}
              >
                Generate Narrative
              </button>
            ) : (
              <button
                type="button"
                onClick={goGenerateNarrative}
                className="flex w-full items-center justify-center rounded-full bg-[#042743] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#053251] focus:outline-none focus:ring-2 focus:ring-[#042743]/30"
              >
                Generate Narrative
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ปุ่มเปิด sidebar บนมือถือ */}
      <button
        onClick={() => setMobileSidebarOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-sky-500 p-4 text-white shadow-lg md:hidden"
      >
        <Filter className="h-5 w-5" />
      </button>

      {/* overlay บนมือถือ */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
    </>
  );
}
