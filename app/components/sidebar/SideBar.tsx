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
  diseaseName: string; // บางทีเป็น code หรือชื่อ
  diseaseCode?: string; // ✅ เผื่อ API ส่งมา
  province: string;
  provinceAlt: string;
  startDate: string;
  endDate: string;
  color: string;
  createdAt: string;
};

function groupProvinces(provinces: Province[]): Record<string, Province[]> {
  return (provinces ?? []).reduce<Record<string, Province[]>>((acc, p) => {
    const region = p.Region_VaccineRollout_MOPH || "อื่น ๆ";
    if (!acc[region]) acc[region] = [];
    acc[region].push(p);
    return acc;
  }, {});
}

const DEFAULT_DISEASE_CODE = "D01";
const DEFAULT_DISEASE_NAME_TH = "ไข้หวัดใหญ่";

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

// ✅ helper: เอา diseaseName/diseaseCode มาเดา “code” ให้ได้
function extractDiseaseCode(raw?: string) {
  const s = String(raw ?? "").trim();
  if (/^D\d{2}$/i.test(s)) return s.toUpperCase();
  const m = s.match(/\b(D\d{2})\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  return "";
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

  const { mainProvince, compareProvince, setMainProvince, setCompareProvince } =
    useCompareStore();

  const hasBothCompare = !!mainProvince && !!compareProvince;

  // ✅ label ต้องโชว์ 2 จังหวัด ถ้ามี provinceAlt
  const labelOf = useCallback((s: SavedSearch) => {
    const parts: string[] = [];

    const name = String(s.searchName ?? "").trim();
    if (name) parts.push(name);

    const dz = String(s.diseaseName ?? s.diseaseCode ?? "").trim();
    if (dz) parts.push(dz);

    const p1 = String(s.province ?? "").trim();
    const p2 = String(s.provinceAlt ?? "").trim();
    if (p1 && p2) parts.push(`${p1} ↔ ${p2}`);
    else if (p1) parts.push(p1);

    if (s.startDate && s.endDate) parts.push(`${s.startDate}→${s.endDate}`);

    return parts.join(" • ");
  }, []);

  // ✅ applySavedSearch: ถ้ามี 2 จังหวัด -> ไป compareInfo
  const applySavedSearch = useCallback(
    (s: SavedSearch) => {
      // 1) resolve disease code + name_th
      const rawCode =
        extractDiseaseCode(s.diseaseCode) || extractDiseaseCode(s.diseaseName);

      const found =
        (rawCode && diseases.find((d) => d.code === rawCode)) ||
        diseases.find((d) => d.code === s.diseaseName) ||
        diseases.find((d) => d.name_th === s.diseaseName);

      const finalCode =
        found?.code ||
        rawCode ||
        (s.diseaseName && /^D\d{2}$/i.test(s.diseaseName)
          ? s.diseaseName.toUpperCase()
          : DEFAULT_DISEASE_CODE);

      const finalNameTh =
        found?.name_th ||
        (s.diseaseName && !/^D\d{2}$/i.test(s.diseaseName)
          ? s.diseaseName
          : DEFAULT_DISEASE_NAME_TH);

      setDisease(finalCode, finalNameTh);

      // 2) resolve provinces
      const p1 = String(s.province ?? "").trim();
      const p2 = String(s.provinceAlt ?? "").trim();
      const hasCompare = !!p1 && !!p2;

      // 3) set date
      setDateRange(s.startDate || "", s.endDate || "");

      // 4) route
      if (hasCompare) {
        // ✅ sync ทั้ง compare store และ dashboard store
        setMainProvince(p1);
        setCompareProvince(p2);
        setProvince(p1);

        const q = new URLSearchParams({
          province: p1,
          province_alt: p2,
          start_date: s.startDate || "",
          end_date: s.endDate || "",
          disease: finalCode,
          color: s.color || "",
        }).toString();

        router.push(`/compareInfo?${q}`);
      } else {
        if (p1) setProvince(p1);

        const q = new URLSearchParams({
          province: p1,
          start_date: s.startDate || "",
          end_date: s.endDate || "",
          disease: finalCode,
          color: s.color || "",
        }).toString();

        router.push(`/dashBoard?${q}`);
      }

      setMobileSidebarOpen(false);
    },
    [
      diseases,
      router,
      setDateRange,
      setDisease,
      setProvince,
      setMainProvince,
      setCompareProvince,
    ]
  );

  /* -----------------------------------------------------------
   * ✅ Generate Narrative
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

  // ✅ สำคัญ: หน้า compareInfo ต้องยิง event เดียว -> ใช้ generateCompare
  const goGenerateCompareNarrative = useCallback(() => {
    const fire = () => {
      const now = Date.now();
      if (now - lastFireAtRef.current < 400) return;
      lastFireAtRef.current = now;

      if (typeof window === "undefined") return;

      // ✅ flag กันกรณี push หน้าแล้วต้องยิงตาม
      (window as any).__HHUB_COMPARE_NARRATIVE_PENDING__ = now;

      // ✅ ยิงอันเดียวพอ (CompareNarrativeSection จะไปเรียก generateCompare ผ่าน proxy)
      window.dispatchEvent(new Event("ai:compare:narrative:generate"));
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
   * ✅ โหลดโรค
   * ----------------------------------------------------------- */
  const loadDiseases = useCallback(async () => {
    try {
      const res = await fetch("/api/diseases", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load diseases");
      const data = (await res.json()) as { diseases: Disease[] };
      const list = data.diseases || [];
      setDiseases(list);

      // default ถ้ายังไม่มีโรคใน store
      if (!diseaseCode && list.length > 0) {
        const d01 = list.find((d) => d.code === DEFAULT_DISEASE_CODE);
        if (d01) setDisease(d01.code, d01.name_th);
        else setDisease(list[0].code, list[0].name_th);
      }
    } catch (e) {
      console.error("Error loading diseases:", e);
      if (!diseaseCode) setDisease(DEFAULT_DISEASE_CODE, DEFAULT_DISEASE_NAME_TH);
    }
  }, [diseaseCode, setDisease]);

  useEffect(() => {
    void loadDiseases();
  }, [loadDiseases]);

  useEffect(() => {
    const handler = () => void loadDiseases();
    window.addEventListener("hhub:diseases:refresh", handler);
    return () => window.removeEventListener("hhub:diseases:refresh", handler);
  }, [loadDiseases]);

  /* -----------------------------------------------------------
   * ✅ อ่าน querystring disease แล้ว setDisease
   * ----------------------------------------------------------- */
  useEffect(() => {
    const qsDisease = searchParams.get("disease");
    if (!qsDisease) return;
    if (diseases.length === 0) return;

    const found = diseases.find((d) => d.code === qsDisease);
    if (found) setDisease(found.code, found.name_th);
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
      .sort(([regionA], [regionB]) => regionA.localeCompare(regionB, "th-TH"))
      .map(([region, items]) => (
        <optgroup key={region} label={makeRegionLabel(region)}>
          {items.map((p) => (
            <option key={p.ProvinceNo} value={p.ProvinceNameThai}>
              {p.ProvinceNameThai}
            </option>
          ))}
        </optgroup>
      ));

  const diseaseLabel = useCallback((d: Disease) => {
    const th = (d.name_th || "").trim();
    const en = (d.name_en || "").trim();
    return en ? `${th} (${en})` : th;
  }, []);

  return (
    <>
      <aside
        className={`
          z-40 w-full max-w-xs px-3 py-4 transition-transform duration-300 ease-in-out
          fixed inset-y-0 left-0 top-16
          ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          md:sticky md:top-16 md:self-start
          md:h-[calc(100vh-4rem)]
        `}
      >
        <div
          className="
            flex h-full flex-col gap-6 rounded-[36px]
            bg-white px-6 py-6 overflow-y-auto overscroll-contain
            shadow-[0_18px_30px_rgba(33,150,243,0.35)]
          "
        >
          {/* โรค */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">
              เลือกโรค
            </label>

            <select
              value={diseaseCode ?? ""}
              onChange={(e) => {
                const code = e.target.value;
                const d = diseases.find((x) => x.code === code);
                setDisease(code, d?.name_th ?? DEFAULT_DISEASE_NAME_TH);
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

          {/* จังหวัด / compare จังหวัด */}
          {!isComparePage ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                เลือกจังหวัด
              </label>
              <select
                value={province ?? ""}
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
                  value={mainProvince ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMainProvince(value);
                    setProvince(value); // ✅ ให้ dashboard store ตามจังหวัดหลัก
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
                  value={compareProvince ?? ""}
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
                value={start_date ?? ""}
                onChange={(e) => setDateRange(e.target.value, end_date ?? "")}
                className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 pl-10 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
              />
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-sky-700" />
            </div>

            <div className="relative">
              <input
                type="date"
                value={end_date ?? ""}
                onChange={(e) => setDateRange(start_date ?? "", e.target.value)}
                className="w-full rounded-full border border-sky-100 bg-white px-4 py-2 pl-10 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300"
              />
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-sky-700" />
            </div>
          </div>

          {/* saved searches */}
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

          {/* ปุ่ม Generate */}
          <div className="mt-auto border-t border-sky-100 pt-3">
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

      {/* overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
    </>
  );
}
