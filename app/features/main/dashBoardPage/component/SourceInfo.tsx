// app/features/main/dashBoardPage/component/SourceInfo.tsx
"use client";

import { useEffect, useState } from "react";

type DataSource = {
  id: number;
  slug: string | null;
  name: string | null;
  agency: string | null;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
};

function SourceItem({ s }: { s: DataSource }) {
  return (
    <div className="flex items-start gap-3">
      {s.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={s.logo_url}
          alt={s.name ?? s.agency ?? "logo"}
          className="mt-0.5 h-6 w-6 shrink-0 rounded object-contain"
          loading="lazy"
        />
      ) : (
        <span className="mt-0.5 inline-block h-6 w-6 shrink-0 rounded bg-gray-200" />
      )}

      <div>
        <div className="font-medium text-gray-800">
          {s.name ?? s.slug ?? "ไม่ระบุชื่อ"}
        </div>
        {s.agency && <div className="text-xs text-gray-500">{s.agency}</div>}

        {s.website_url && (
          <a
            className="break-all text-blue-600 underline"
            href={s.website_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {s.website_url}
          </a>
        )}

        {s.description && (
          <div className="mt-0.5 text-xs text-gray-500">{s.description}</div>
        )}
      </div>
    </div>
  );
}

// ---------- type guards (หลีกเลี่ยง any) ----------
type ItemsEnvelope = { items: unknown };

function hasItemsEnvelope(v: unknown): v is ItemsEnvelope {
  return typeof v === "object" && v !== null && "items" in (v as Record<string, unknown>);
}

export default function SourceInfo() {
  const [items, setItems] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/data-sources", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json: unknown = await res.json();

        // รองรับทั้งรูป { items: [...] } และ [...] ตรง ๆ โดยไม่ใช้ any
        const rowsUnknown: unknown = hasItemsEnvelope(json)
          ? json.items
          : json;

        const next: DataSource[] = Array.isArray(rowsUnknown)
          ? (rowsUnknown as DataSource[])
          : [];

        if (!cancelled) setItems(next);
      } catch (e) {
        if (!cancelled) setErr("ไม่สามารถโหลดแหล่งที่มาของข้อมูลได้");
        console.error("[SourceInfo] fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-600">กำลังโหลดแหล่งที่มาของข้อมูล…</div>;
  }
  if (err) {
    return <div className="text-sm text-red-600">{err}</div>;
  }
  if (!items.length) return null;

  // จัดเป็นคู่ ๆ ต่อแถวให้ตรง (ซ้าย/ขวา)
  const rows: Array<[DataSource, DataSource | null]> = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i], items[i + 1] ?? null]);
  }

  return (
    <div className="text-sm text-gray-600">
      <p className="mb-2 font-semibold">แหล่งที่มาของข้อมูล :</p>

      {/* ตาราง 2 คอลัมน์ ให้แต่ละแถวยึด baseline เดียวกัน */}
      <div className="grid grid-cols-2 gap-x-10 gap-y-4">
        {rows.map(([left, right], idx) => (
          <div key={idx} className="contents">
            <div><SourceItem s={left} /></div>
            <div>{right ? <SourceItem s={right} /> : null}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
