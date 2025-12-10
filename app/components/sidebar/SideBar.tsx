// app/components/sidebar/SideBar.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarIcon, Plus } from "lucide-react";
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

  return <SidebarInner isComparePage={isComparePage} />;
}

function SidebarInner({ isComparePage }: { isComparePage: boolean }) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [diseases, setDiseases] = useState<Disease[]>([]);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedErr, setSavedErr] = useState<string | null>(null);
  const [canSeeSaved, setCanSeeSaved] = useState(true);

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
    },
    [diseases, router, setDateRange, setDisease, setProvince]
  );

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/diseases", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load diseases");
        const data = (await res.json()) as { diseases: Disease[] };
        setDiseases(data.diseases || []);

        const qsDisease = searchParams.get("disease");
        if (!diseaseCode && !qsDisease) {
          const d01 = data.diseases.find((d) => d.code === "D01");
          if (d01) setDisease(d01.code, d01.name_th);
        }
      } catch (e) {
        console.error("Error loading diseases:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const qsDisease = searchParams.get("disease");
    if (qsDisease && diseases.length > 0) {
      const found = diseases.find((d) => d.code === qsDisease);
      if (found) setDisease(found.code, found.name_th);
    }
  }, [searchParams, diseases, setDisease]);

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

  return (
    <aside className="flex w-full max-w-xs flex-col gap-8 bg-pink-100 px-4 py-6">
      {/* โรค */}
      <div>
        <label className="mb-1 block text-sm">เลือกโรค</label>
        <select
          value={diseaseCode}
          onChange={(e) => {
            const code = e.target.value;
            const d = diseases.find((x) => x.code === code);
            setDisease(code, d?.name_th ?? "");
          }}
          className="w-full rounded-full bg-white px-4 py-2 text-sm outline-none"
        >
          {diseases.length === 0 && <option value="">กำลังโหลด...</option>}
          {diseases.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} — {d.name_th} ({d.name_en})
            </option>
          ))}
        </select>
      </div>

      {/* จังหวัด */}
      {!isComparePage ? (
        <div>
          <label className="mb-1 block text-sm">เลือกจังหวัด</label>
          <select
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="w-full rounded-full bg-white px-4 py-2 text-sm outline-none"
          >
            <option value="">-- เลือกจังหวัด --</option>
            {renderProvinceOptions(provinceGroups)}
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">เลือกจังหวัดหลัก</label>
            <select
              value={mainProvince}
              onChange={(e) => {
                const value = e.target.value;
                setMainProvince(value);
                setProvince(value);
              }}
              className="w-full rounded-full bg-white px-4 py-2 text-sm outline-none"
            >
              <option value="">-- เลือกจังหวัดหลัก --</option>
              {renderProvinceOptions(provinceGroups)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm">
              เลือกจังหวัดที่ต้องการเปรียบเทียบ
            </label>
            <select
              value={compareProvince}
              onChange={(e) => setCompareProvince(e.target.value)}
              className="w-full rounded-full bg-white px-4 py-2 text-sm outline-none"
            >
              <option value="">-- เลือกจังหวัดเพื่อเปรียบเทียบ --</option>
              {renderProvinceOptions(provinceGroups)}
            </select>
          </div>
        </div>
      )}

      {/* วันที่ */}
      <div>
        <label className="mb-1 block text-sm">เลือกระยะเวลา</label>
        <div className="relative mb-2">
          <input
            type="date"
            value={start_date}
            onChange={(e) => setDateRange(e.target.value, end_date)}
            className="w-full rounded-full bg-white px-4 py-2 pl-10 text-sm outline-none"
          />
          <CalendarIcon className="absolute top-2.5 left-3 h-4 w-4 text-gray-500" />
        </div>
        <div className="relative">
          <input
            type="date"
            value={end_date}
            onChange={(e) => setDateRange(start_date, e.target.value)}
            className="w-full rounded-full bg-white px-4 py-2 pl-10 text-sm outline-none"
          />
          <CalendarIcon className="absolute top-2.5 left-3 h-4 w-4 text-gray-500" />
        </div>
      </div>

      {/* การค้นหาที่บันทึกไว้ */}
      {!isComparePage && canSeeSaved && (
        <div className="border-t border-pink-200 pt-3">
          <label className="mb-1 block text-sm">การค้นหาที่บันทึกไว้</label>

          {savedLoading ? (
            <div className="w-full rounded-full bg-white px-4 py-2 text-sm text-gray-500">
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
                className="w-full flex-1 rounded-full bg-white px-4 py-2 text-sm outline-none"
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-pink-500 text-white shadow-sm transition hover:bg-pink-600 focus:ring-2 focus:ring-pink-400 focus:outline-none"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={goCreate}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-pink-600 ring-1 ring-pink-300 transition hover:bg-pink-50"
            >
              <Plus className="h-4 w-4" />
              สร้างการค้นหา
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
