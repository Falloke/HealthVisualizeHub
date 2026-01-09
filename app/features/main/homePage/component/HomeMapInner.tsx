"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonObject, Feature } from "geojson";
import { useDashboardStore } from "@/store/useDashboardStore";

type ProvinceItem = {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
};

interface ProvinceInfo {
  name: string;
  disease: string;
  patients: number | null;
  riskLevel: "สูงมาก" | "สูง" | "ปานกลาง" | "ต่ำ";
}

const RISK_META: Record<ProvinceInfo["riskLevel"], { bg: string; text: string }> = {
  สูงมาก:   { bg: "bg-red-600",     text: "text-white" },
  สูง:      { bg: "bg-orange-500",  text: "text-white" },
  ปานกลาง: { bg: "bg-amber-500",   text: "text-white" },
  ต่ำ:      { bg: "bg-emerald-500", text: "text-white" },
};

const BASE_STYLE: L.PathOptions  = { color: "#999", weight: 1, fillColor: "#4F46E5", fillOpacity: 0.4 };
const HOVER_STYLE: L.PathOptions = { color: "#333", weight: 1, fillOpacity: 0.7 };

const sanitize = (s: string) =>
  s.replace(/[\u0000-\u001F\u007F\u00A0\u200B-\u200D\uFEFF]/g, "").normalize("NFC").trim();
const normalizeThai = (s: string) =>
  sanitize(s).replace(/^จังหวัด/, "").replace(/\(.*?\)/g, "").replace(/\s+/g, "")
    .replace(/[^\u0E00-\u0E7F]/g, "").trim();
const hasThai = (s: string) => /[\u0E00-\u0E7F]/.test(s);
const normalizeEng = (s: string) => s.toLowerCase().trim();

function riskFromCount(n: number): ProvinceInfo["riskLevel"] {
  if (n >= 8000) return "สูงมาก";
  if (n >= 4000) return "สูง";
  if (n >= 2000) return "ปานกลาง";
  return "ต่ำ";
}

export default function HomeMapInner({ className = "" }: { className?: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [provinceList, setProvinceList] = useState<string[]>([]);
  const [provErr, setProvErr] = useState<string | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<ProvinceInfo | null>(null);

  const diseaseCode   = useDashboardStore((s) => s.diseaseCode);
  const diseaseNameTh = useDashboardStore((s) => s.diseaseNameTh);
  const start_date    = useDashboardStore((s) => s.start_date);
  const end_date      = useDashboardStore((s) => s.end_date);

  const countsCache = useRef<Map<string, number>>(new Map());
  useEffect(() => { countsCache.current.clear(); }, [start_date, end_date, diseaseCode]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/data/thailand-province-simple.json?v=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setGeoData(await res.json());
      } catch (e) {
        console.error("load geojson failed:", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setProvErr(null);
        const res = await fetch(`/data/Thailand-ProvinceName.json?v=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ProvinceItem[] = await res.json();
        const names = data.map((p) => p.ProvinceNameThai).filter(Boolean) as string[];
        if (!names.length) throw new Error("empty province list");
        setProvinceList(names);
      } catch (e) {
        console.error("load provinces failed:", e);
        setProvErr("ไม่สามารถโหลดรายชื่อจังหวัด");
      }
    })();
  }, []);

  const { thaiMap, engMap } = useMemo(() => {
    const t = new Map<string, string>();
    provinceList.forEach((th) => {
      const key = normalizeThai(th);
      if (key) t.set(key, sanitize(th));
    });
    const e = new Map<string, string>([["bangkok", "กรุงเทพมหานคร"]]);
    return { thaiMap: t, engMap: e };
  }, [provinceList]);

  const ready = !!geoData && provinceList.length > 0;

  const getThaiOfficialName = useCallback((feature: Feature): string => {
    const props = (feature.properties || {}) as Record<string, unknown>;
    const nlRaw = props.NL_NAME_1 as string | undefined;
    const enRaw = props.NAME_1 as string | undefined;
    const nl = nlRaw ? sanitize(nlRaw) : undefined;
    const en = enRaw ? sanitize(enRaw) : undefined;

    if (nl && hasThai(nl)) {
      const key = normalizeThai(nl);
      const hit = key && thaiMap.get(key);
      if (hit) return sanitize(hit);
      const hit2 = thaiMap.get(normalizeThai(nl.replace(/\(.*?\)/g, "")));
      if (hit2) return sanitize(hit2);
      return sanitize(nl.replace(/^จังหวัด/, ""));
    }
    if (en && !hasThai(en)) {
      const hit = engMap.get(normalizeEng(en));
      if (hit) return sanitize(hit);
    }
    return "ไม่ทราบจังหวัด";
  }, [thaiMap, engMap]);

  const fetchPatientsForProvince = useCallback(async (provinceName: string): Promise<number> => {
    if (diseaseCode !== "D01") return 0;
    const key = `${provinceName}|${start_date}|${end_date}|${diseaseCode}`;
    if (countsCache.current.has(key)) return countsCache.current.get(key)!;

    const url = `/api/dashBoard/patients-summary?start_date=${encodeURIComponent(
      start_date
    )}&end_date=${encodeURIComponent(end_date)}&province=${encodeURIComponent(provinceName)}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { totalPatients: number };
    const n = Number(json?.totalPatients || 0);
    countsCache.current.set(key, n);
    return n;
  }, [diseaseCode, start_date, end_date]);

  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const activeLayerRef = useRef<L.Path | null>(null);

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    // reset map เดิม
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    activeLayerRef.current = null;
    geoJsonRef.current = null;

    const map = L.map(mapRef.current).setView([13.5, 100.5], 6);

    // จัด z-index ให้ชั้นของ Leaflet ต่ำกว่า overlay ของเรา
    const panes = map.getPanes();
    panes.mapPane.style.zIndex = "0";
    panes.tilePane.style.zIndex = "100";
    panes.overlayPane.style.zIndex = "150";
    panes.shadowPane.style.zIndex = "160";
    panes.markerPane.style.zIndex = "170";
    panes.tooltipPane.style.zIndex = "180";
    panes.popupPane.style.zIndex = "190";

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const geoJsonLayer = L.geoJSON(geoData as GeoJsonObject, {
      style: () => BASE_STYLE,
      onEachFeature: (feature: Feature, layer: L.Layer) => {
        const nameTH = getThaiOfficialName(feature);
        const info: ProvinceInfo = {
          name: nameTH,
          disease: diseaseNameTh || "—",
          patients: null,
          riskLevel: "ปานกลาง",
        };

        layer.on({
          mouseover: async (e: L.LeafletMouseEvent) => {
            const path = e.target as L.Path;
            if (activeLayerRef.current && geoJsonRef.current) {
              geoJsonRef.current.resetStyle(activeLayerRef.current);
            }
            path.setStyle(HOVER_STYLE);
            path.bringToFront();
            activeLayerRef.current = path;

            setHoveredProvince(info);
            try {
              const p = await fetchPatientsForProvince(nameTH);
              const level = riskFromCount(p);
              setHoveredProvince((prev) =>
                prev && prev.name === nameTH ? { ...prev, patients: p, riskLevel: level } : prev
              );
            } catch {
              setHoveredProvince((prev) =>
                prev && prev.name === nameTH ? { ...prev, patients: 0, riskLevel: "ต่ำ" } : prev
              );
            }
          },
          mouseout: (e: L.LeafletMouseEvent) => {
            const path = e.target as L.Path;
            if (geoJsonRef.current) geoJsonRef.current.resetStyle(path);
            if (activeLayerRef.current === path) activeLayerRef.current = null;
            setHoveredProvince(null);
          },
        });

        layer.bindTooltip(nameTH, { direction: "top", sticky: true, interactive: false });
      },
    });

    geoJsonLayer.addTo(map);
    geoJsonRef.current = geoJsonLayer;
    mapInstanceRef.current = map;

    // ✅ ทำให้ map รีขนาดตามกรอบ (กัน error ตอน unmount/เปลี่ยนหน้า)
    let alive = true;
    let rafId: number | null = null;
    let tId: number | null = null;

    const safeInvalidate = () => {
      const m = mapInstanceRef.current;
      if (!alive || !m) return;

      const el = m.getContainer?.();
      if (!el || !(el as any).isConnected) return;

      try {
        m.invalidateSize({ animate: false });
      } catch (e) {
        // กัน crash จาก Leaflet internals ตอน DOM หาย
        // console.warn("invalidateSize skipped:", e);
      }
    };

    const ro = new ResizeObserver(() => {
      // debounce ด้วย rAF + setTimeout 0 (ให้ layout settle ก่อน)
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (tId != null) window.clearTimeout(tId);
        tId = window.setTimeout(safeInvalidate, 0);
      });
    });

    if (wrapperRef.current) ro.observe(wrapperRef.current);

    // invalidate 1 ครั้งหลัง mount (ช่วยตอนเข้า page แล้วแผนที่เบี้ยว)
    tId = window.setTimeout(safeInvalidate, 0);

    return () => {
      alive = false;
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
      if (tId != null) window.clearTimeout(tId);

      map.remove();
      mapInstanceRef.current = null;
      activeLayerRef.current = null;
      geoJsonRef.current = null;
    };
  }, [ready, geoData, diseaseNameTh, getThaiOfficialName, fetchPatientsForProvince]);

  return (
    <div ref={wrapperRef} className={`relative z-0 w-full ${className}`}>
      {/* แผนที่กินความสูงทั้งหมดจากภายนอก */}
      <div ref={mapRef} className="h-full w-full rounded-md border bg-neutral-50" />

      {/* Hover info */}
      {hoveredProvince && (
        <div className="pointer-events-none absolute top-3 right-3 z-[1000] w-72 rounded-md border bg-white/95 p-3 text-sm shadow">
          <h3 className="text-base font-semibold">{hoveredProvince.name}</h3>
          <p className="mt-1 text-neutral-700">
            โรคระบาด: <span className="font-medium">{hoveredProvince.disease}</span>
          </p>
          <p className="mt-1 text-neutral-700">
            จำนวนผู้ป่วย:{" "}
            <span className="font-medium">
              {hoveredProvince.patients === null ? "กำลังโหลด…" : hoveredProvince.patients}
            </span>
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span>ระดับความเสี่ยง:</span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                ${RISK_META[hoveredProvince.riskLevel].bg} ${RISK_META[hoveredProvince.riskLevel].text}`}
            >
              {hoveredProvince.riskLevel}
            </span>
          </div>
          {provErr && <p className="mt-2 text-xs text-red-600">{provErr}</p>}
        </div>
      )}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] space-y-1 rounded-md border bg-white/90 p-2 text-xs shadow">
        <div className="font-medium">ระดับความเสี่ยง</div>
        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded ${RISK_META["สูงมาก"].bg}`} /><span>สูงมาก</span></div>
        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded ${RISK_META["สูง"].bg}`} /><span>สูง</span></div>
        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded ${RISK_META["ปานกลาง"].bg}`} /><span>ปานกลาง</span></div>
        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded ${RISK_META["ต่ำ"].bg}`} /><span>ต่ำ</span></div>
      </div>
    </div>
  );
}
