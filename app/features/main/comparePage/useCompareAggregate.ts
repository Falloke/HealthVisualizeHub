"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardStore } from "@/store/useDashboardStore";
import { useCompareStore } from "@/store/useCompareStore";

type AggResp = {
  ok: boolean;
  data?: any;
  error?: string;
};

type CacheEntry = { at: number; data: any };
const TTL = 2 * 60 * 1000;

export function useCompareAggregate() {
  const { start_date, end_date } = useDashboardStore();
  const { mainProvince, compareProvince } = useCompareStore();

  const hasBoth = !!mainProvince && !!compareProvince;

  const key = useMemo(() => {
    if (!hasBoth) return "";
    const qs = new URLSearchParams({
      start_date: start_date || "",
      end_date: end_date || "",
      mainProvince: mainProvince!,
      compareProvince: compareProvince!,
    }).toString();
    return `/api/compareInfo/aggregate?${qs}`;
  }, [hasBoth, start_date, end_date, mainProvince, compareProvince]);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inFlightRef = useRef<AbortController | null>(null);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasBoth || !key) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const now = Date.now();
    const cached = cacheRef.current.get(key);
    if (cached && now - cached.at < TTL) {
      setData(cached.data);
      setError(null);
      return;
    }

    const ac = new AbortController();
    inFlightRef.current?.abort();
    inFlightRef.current = ac;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(key, { signal: ac.signal, headers: { Accept: "application/json" } });
        const json = (await res.json().catch(() => ({}))) as AggResp;

        if (!res.ok || !json.ok) throw new Error(json.error || "โหลดข้อมูลเปรียบเทียบไม่สำเร็จ");

        cacheRef.current.set(key, { at: Date.now(), data: json.data });
        setData(json.data);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setData(null);
        setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [hasBoth, key]);

  return { hasBoth, data, loading, error };
}
