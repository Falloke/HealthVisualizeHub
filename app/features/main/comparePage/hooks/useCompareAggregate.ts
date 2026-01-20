"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

type AggregateResp = {
  ok: boolean;
  error?: string;

  // 👇 ปรับชื่อ field ให้ “ตรงกับที่ทำใน aggregate”
  regionTop5?: any;
  agePatients?: any;
  ageDeaths?: any;
  genderPatients?: any;
  genderDeaths?: any;
  genderTrend?: any;
  provincePatients?: any;
  provinceDeaths?: any;
};

type CacheEntry = { at: number; data: AggregateResp };

const TTL = 2 * 60 * 1000;

// module-level cache (แชร์ทุกคอมโพเนนต์บนหน้าเดียวกัน)
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, AbortController>();

export function useCompareAggregate() {
  const start_date = useDashboardStore((s) => s.start_date);
  const end_date = useDashboardStore((s) => s.end_date);
  const mainProvince = useCompareStore((s) => s.mainProvince);
  const compareProvince = useCompareStore((s) => s.compareProvince);

  const hasBoth = !!mainProvince && !!compareProvince;

  const url = useMemo(() => {
    if (!hasBoth) return "";
    const sp = new URLSearchParams({
      start_date: start_date || "",
      end_date: end_date || "",
      mainProvince: mainProvince!,
      compareProvince: compareProvince!,
    });
    return `/api/compareInfo/aggregate?${sp.toString()}`;
  }, [hasBoth, start_date, end_date, mainProvince, compareProvince]);

  const [data, setData] = useState<AggregateResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // กัน setState หลัง unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasBoth || !url) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    // 1) cache hit
    const now = Date.now();
    const c = cache.get(url);
    if (c && now - c.at < TTL) {
      setData(c.data);
      setError(null);
      return;
    }

    // 2) dedupe in-flight
    if (inflight.has(url)) return;

    const ac = new AbortController();
    inflight.set(url, ac);

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(url, {
          signal: ac.signal,
          headers: { Accept: "application/json" },
          // ไม่ต้อง no-store ที่ client (ให้ cacheRef คุมเอง)
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || "โหลด aggregate ไม่สำเร็จ");

        const json = (text ? JSON.parse(text) : null) as AggregateResp | null;
        if (!json?.ok) throw new Error(json?.error || "aggregate ok=false");

        cache.set(url, { at: Date.now(), data: json });

        if (mountedRef.current) setData(json);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (mountedRef.current) {
          setData(null);
          setError(e?.message || "โหลด aggregate ไม่สำเร็จ");
        }
      } finally {
        inflight.delete(url);
        if (mountedRef.current) setLoading(false);
      }
    })();

    return () => {
      ac.abort();
      inflight.delete(url);
    };
  }, [hasBoth, url]);

  return { hasBoth, url, data, loading, error };
}
