"use client";

import { useEffect, useState } from "react";
import { useProvincialInfoStore } from "@/store/useProvincialInfoStore";
import DiseaseDescription from "@/app/components/disease-detail/DiseaseDescription";
import DiseaseSymptoms from "@/app/components/disease-detail/DiseaseSymptoms";
import DiseasePreventions from "@/app/components/disease-detail/DiseasePreventions";

type DiseaseFull = {
  code: string;
  name_th: string;
  name_en: string;
  description_th?: string | null;
  symptoms: string[];
  preventions: string[];
};

export default function DiseaseInfo() {
  const { diseaseCode, setDisease } = useProvincialInfoStore();
  const [data, setData] = useState<DiseaseFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!diseaseCode) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/diseases/${encodeURIComponent(diseaseCode)}/full`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DiseaseFull;
        if (json?.name_th) setDisease(json.code, json.name_th); // sync ชื่อไทย
        setData(json);
      } catch (e: any) {
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [diseaseCode, setDisease]);

  if (!diseaseCode)
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-gray-600">
        ยังไม่ได้เลือกโรค
      </div>
    );
  if (loading)
    return <div className="rounded-xl bg-white p-4">กำลังโหลด...</div>;
  if (error)
    return (
      <div className="rounded-xl bg-yellow-50 p-4 text-yellow-800">
        ไม่พบข้อมูลโรค ({diseaseCode})
      </div>
    );
  if (!data) return null;

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
      <DiseaseDescription description={data.description_th} />
      <DiseasePreventions items={data.preventions} />
      <DiseaseSymptoms items={data.symptoms} />
    </div>
  );
}
