// app/features/admin/diseasesPage/component/DiseaseEditor.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Disease = {
  code: string;
  name_th: string | null;
  name_en: string | null;
};

type SymptomOption = { id: number; name_th: string };
type PreventionOption = { id: number; name_th: string };

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

type Props = {
  /** ค่าเริ่มต้นจาก route param เช่น D01 (ไม่จำเป็นต้องมี) */
  code?: string;
};

export default function DiseaseEditor({ code }: Props) {
  /* ------------------------------------------------------------------
   * 1) รายการโรคทั้งหมด + โรคที่เลือกอยู่
   * ------------------------------------------------------------------ */

  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [currentCode, setCurrentCode] = useState<string | null>(code ?? null);
  const [listLoading, setListLoading] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);

  const currentDisease = useMemo(
    () => diseases.find((d) => d.code === currentCode) ?? null,
    [diseases, currentCode]
  );

  /* ------------------------------------------------------------------
   * 2) ข้อมูลชื่อโรค (meta: name_th / name_en)
   * ------------------------------------------------------------------ */

  const [metaNameTH, setMetaNameTH] = useState("");
  const [metaNameEN, setMetaNameEN] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [metaOk, setMetaOk] = useState<string | null>(null);

  useEffect(() => {
    if (currentDisease) {
      setMetaNameTH(currentDisease.name_th ?? "");
      setMetaNameEN(currentDisease.name_en ?? "");
    } else {
      setMetaNameTH("");
      setMetaNameEN("");
    }
    setMetaErr(null);
    setMetaOk(null);
  }, [currentDisease]);

  /* ------------------------------------------------------------------
   * 3) รายละเอียดโรค
   * ------------------------------------------------------------------ */

  const [detailTH, setDetailTH] = useState("");
  const [detailEN, setDetailEN] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  /* ------------------------------------------------------------------
   * 4) อาการโรค (ตาราง symptoms + disease_symptoms)
   * ------------------------------------------------------------------ */

  const [symOptions, setSymOptions] = useState<SymptomOption[]>([]);
  const [symSelected, setSymSelected] = useState<number[]>([]);
  const [symLoading, setSymLoading] = useState(false);
  const [symSaving, setSymSaving] = useState(false);
  const [symErr, setSymErr] = useState<string | null>(null);

  // master อาการ: สร้างอาการใหม่
  const [symMasterName, setSymMasterName] = useState("");
  const [symMasterSaving, setSymMasterSaving] = useState(false);
  const [symMasterErr, setSymMasterErr] = useState<string | null>(null);
  const [symMasterOk, setSymMasterOk] = useState<string | null>(null);

  /* ------------------------------------------------------------------
   * 5) วิธีป้องกัน (ตาราง preventions + disease_preventions)
   * ------------------------------------------------------------------ */

  const [prevOptions, setPrevOptions] = useState<PreventionOption[]>([]);
  const [prevSelected, setPrevSelected] = useState<number[]>([]);
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevSaving, setPrevSaving] = useState(false);
  const [prevErr, setPrevErr] = useState<string | null>(null);

  // master วิธีป้องกัน: สร้างวิธีป้องกันใหม่
  const [prevMasterName, setPrevMasterName] = useState("");
  const [prevMasterSaving, setPrevMasterSaving] = useState(false);
  const [prevMasterErr, setPrevMasterErr] = useState<string | null>(null);
  const [prevMasterOk, setPrevMasterOk] = useState<string | null>(null);

  /* ------------------------------------------------------------------
   * 6) สร้างโรคใหม่
   * ------------------------------------------------------------------ */

  const [newCode, setNewCode] = useState("");
  const [newNameTH, setNewNameTH] = useState("");
  const [newNameEN, setNewNameEN] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  /* ============================================================
   * โหลด list โรค
   * ============================================================ */

  async function loadDiseases() {
    setListLoading(true);
    setListErr(null);
    try {
      const res = await fetch("/api/admin/diseases", { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { items: Disease[] };
      const items = json.items ?? [];
      setDiseases(items);

      if (!items.length) {
        setCurrentCode(null);
        return;
      }
      const found = code ? items.find((d) => d.code === code) : items[0];
      setCurrentCode((prev) => prev ?? found?.code ?? items[0].code);
    } catch (e) {
      setListErr("โหลดรายการโรคไม่สำเร็จ");
      console.error("[DiseaseEditor] loadDiseases:", getErrorMessage(e));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadDiseases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
   * โหลดรายละเอียด / อาการ / วิธีป้องกัน ของโรคที่เลือก
   * ============================================================ */

  useEffect(() => {
    if (!currentCode) return;

    // รายละเอียดโรค
    (async () => {
      setDetailLoading(true);
      setDetailErr(null);
      try {
        const res = await fetch(
          `/api/admin/diseases/details?code=${encodeURIComponent(currentCode)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        setDetailTH(j.description_th ?? "");
        setDetailEN(j.description_en ?? "");
        // ✅ ถ้าโหลดสำเร็จ เคลียร์ error อีกรอบให้ชัวร์
        setDetailErr(null);
      } catch (e) {
        setDetailErr("โหลดรายละเอียดโรคไม่สำเร็จ");
        console.error("[DiseaseEditor] load details:", getErrorMessage(e));
      } finally {
        setDetailLoading(false);
      }
    })();

    // อาการโรค + master symptoms
    (async () => {
      setSymLoading(true);
      setSymErr(null);
      try {
        const res = await fetch(
          `/api/admin/diseases/symptoms?code=${encodeURIComponent(currentCode)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as {
          selected: number[];
          options: SymptomOption[];
        };
        setSymSelected(j.selected ?? []);
        setSymOptions(j.options ?? []);
        // ✅ เคลียร์ error เมื่อโหลดสำเร็จ
        setSymErr(null);
      } catch (e) {
        setSymErr("โหลดอาการโรคไม่สำเร็จ");
        console.error("[DiseaseEditor] load symptoms:", getErrorMessage(e));
      } finally {
        setSymLoading(false);
      }
    })();

    // วิธีป้องกัน + master preventions
    (async () => {
      setPrevLoading(true);
      setPrevErr(null);
      try {
        const res = await fetch(
          `/api/admin/diseases/preventions?code=${encodeURIComponent(
            currentCode
          )}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as {
          selected: { id: number; priority?: number | null }[];
          options: PreventionOption[];
        };
        setPrevSelected((j.selected ?? []).map((x) => x.id));
        setPrevOptions(j.options ?? []);
        // ✅ เคลียร์ error เมื่อโหลด สำเร็จ
        setPrevErr(null);
      } catch (e) {
        setPrevErr("โหลดวิธีป้องกันไม่สำเร็จ");
        console.error("[DiseaseEditor] load preventions:", getErrorMessage(e));
      } finally {
        setPrevLoading(false);
      }
    })();
  }, [currentCode]);

  /* ============================================================
   * บันทึกชื่อโรค
   * ============================================================ */

  async function saveMeta() {
    if (!currentCode) return;
    setMetaSaving(true);
    setMetaErr(null);
    setMetaOk(null);
    try {
      const res = await fetch("/api/admin/diseases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: currentCode,
          name_th: metaNameTH,
          name_en: metaNameEN,
        }),
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      setMetaOk("บันทึกชื่อโรคเรียบร้อย");
      setDiseases((prev) =>
        prev.map((d) =>
          d.code === currentCode
            ? {
                ...d,
                name_th: metaNameTH || null,
                name_en: metaNameEN || null,
              }
            : d
        )
      );
    } catch (e) {
      setMetaErr("บันทึกชื่อโรคไม่สำเร็จ");
      console.error("[DiseaseEditor] saveMeta:", getErrorMessage(e));
    } finally {
      setMetaSaving(false);
    }
  }

  /* ============================================================
   * สร้างโรคใหม่
   * ============================================================ */

  async function createDisease() {
    setCreateErr(null);
    setCreateOk(null);
    if (!newCode.trim()) {
      setCreateErr("กรุณาระบุรหัสโรค");
      return;
    }
    setCreateSaving(true);
    try {
      const res = await fetch("/api/admin/diseases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim(),
          name_th: newNameTH,
          name_en: newNameEN,
        }),
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      const created = JSON.parse(txt) as Disease;
      setCreateOk(`สร้างโรค ${created.code} สำเร็จ`);
      setNewCode("");
      setNewNameTH("");
      setNewNameEN("");
      await loadDiseases();
      setCurrentCode(created.code);
    } catch (e) {
      setCreateErr(getErrorMessage(e) || "สร้างโรคไม่สำเร็จ");
      console.error("[DiseaseEditor] createDisease:", getErrorMessage(e));
    } finally {
      setCreateSaving(false);
    }
  }

  /* ============================================================
   * ลบโรคปัจจุบัน
   * ============================================================ */

  async function deleteCurrent() {
    if (!currentCode) return;
    if (
      !confirm(
        `ยืนยันลบโรค ${currentCode} พร้อมรายละเอียด/อาการ/วิธีป้องกันทั้งหมด?`
      )
    )
      return;

    try {
      const res = await fetch(
        `/api/admin/diseases?code=${encodeURIComponent(currentCode)}`,
        { method: "DELETE" }
      );
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      await loadDiseases();
      setDetailTH("");
      setDetailEN("");
      setSymSelected([]);
      setPrevSelected([]);
    } catch (e) {
      alert("ลบโรคไม่สำเร็จ");
      console.error("[DiseaseEditor] deleteCurrent:", getErrorMessage(e));
    }
  }

  /* ============================================================
   * บันทึกรายละเอียดโรค
   * ============================================================ */

  async function saveDetails() {
    if (!currentCode) return;
    setDetailSaving(true);
    setDetailErr(null);
    try {
      const res = await fetch(
        `/api/admin/diseases/details?code=${encodeURIComponent(currentCode)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description_th: detailTH,
            description_en: detailEN,
          }),
        }
      );
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      alert("บันทึกรายละเอียดแล้ว");
    } catch (e) {
      setDetailErr("บันทึกรายละเอียดไม่สำเร็จ");
      console.error("[DiseaseEditor] saveDetails:", getErrorMessage(e));
    } finally {
      setDetailSaving(false);
    }
  }

  /* ============================================================
   * อาการโรค: checkbox + ลำดับสวย ๆ + ลบ master
   * ============================================================ */

  function toggleSymptom(id: number) {
    setSymSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function saveSymptoms() {
    if (!currentCode) return;
    setSymSaving(true);
    setSymErr(null);
    try {
      const res = await fetch(
        `/api/admin/diseases/symptoms?code=${encodeURIComponent(currentCode)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: symSelected }),
        }
      );
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      alert("บันทึกอาการแล้ว");
    } catch (e) {
      setSymErr("บันทึกอาการไม่สำเร็จ");
      console.error("[DiseaseEditor] saveSymptoms:", getErrorMessage(e));
    } finally {
      setSymSaving(false);
    }
  }

  async function createSymptomMaster() {
    setSymMasterErr(null);
    setSymMasterOk(null);
    if (!symMasterName.trim()) {
      setSymMasterErr("กรุณากรอกชื่ออาการ (ภาษาไทย)");
      return;
    }
    setSymMasterSaving(true);
    try {
      const res = await fetch("/api/admin/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_th: symMasterName.trim() }),
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      const created = JSON.parse(txt) as SymptomOption;
      setSymMasterOk(`สร้างอาการใหม่สำเร็จ`);
      setSymMasterName("");

      setSymOptions((prev) => [...prev, created]);
      setSymSelected((prev) => [...prev, created.id]);
    } catch (e) {
      setSymMasterErr(getErrorMessage(e) || "สร้างอาการไม่สำเร็จ");
      console.error("[DiseaseEditor] createSymptomMaster:", getErrorMessage(e));
    } finally {
      setSymMasterSaving(false);
    }
  }

  async function deleteSymptomMaster(id: number) {
    if (!confirm("ยืนยันลบอาการนี้ออกจากระบบทั้งหมด?")) return;

    try {
      const res = await fetch(`/api/admin/symptoms?id=${id}`, {
        method: "DELETE",
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      setSymOptions((prev) => prev.filter((s) => s.id !== id));
      setSymSelected((prev) => prev.filter((x) => x !== id));
    } catch (e) {
      alert("ลบอาการไม่สำเร็จ");
      console.error("[DiseaseEditor] deleteSymptomMaster:", getErrorMessage(e));
    }
  }

  /* ============================================================
   * วิธีป้องกัน: checkbox + ลำดับสวย ๆ + ลบ master
   * ============================================================ */

  function togglePrevention(id: number) {
    setPrevSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function savePreventions() {
    if (!currentCode) return;
    setPrevSaving(true);
    setPrevErr(null);
    try {
      const res = await fetch(
        `/api/admin/diseases/preventions?code=${encodeURIComponent(
          currentCode
        )}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: prevSelected }),
        }
      );
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      alert("บันทึกวิธีป้องกันแล้ว");
    } catch (e) {
      setPrevErr("บันทึกวิธีป้องกันไม่สำเร็จ");
      console.error("[DiseaseEditor] savePreventions:", getErrorMessage(e));
    } finally {
      setPrevSaving(false);
    }
  }

  async function createPreventionMaster() {
    setPrevMasterErr(null);
    setPrevMasterOk(null);
    if (!prevMasterName.trim()) {
      setPrevMasterErr("กรุณากรอกชื่อวิธีป้องกัน (ภาษาไทย)");
      return;
    }
    setPrevMasterSaving(true);
    try {
      const res = await fetch("/api/admin/preventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_th: prevMasterName.trim() }),
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);
      const created = JSON.parse(txt) as PreventionOption;
      setPrevMasterOk(`สร้างวิธีป้องกันใหม่สำเร็จ`);
      setPrevMasterName("");

      setPrevOptions((prev) => [...prev, created]);
      setPrevSelected((prev) => [...prev, created.id]);
    } catch (e) {
      setPrevMasterErr(getErrorMessage(e) || "สร้างวิธีป้องกันไม่สำเร็จ");
      console.error(
        "[DiseaseEditor] createPreventionMaster:",
        getErrorMessage(e)
      );
    } finally {
      setPrevMasterSaving(false);
    }
  }

  async function deletePreventionMaster(id: number) {
    if (!confirm("ยืนยันลบวิธีป้องกันนี้ออกจากระบบทั้งหมด?")) return;

    try {
      const res = await fetch(`/api/admin/preventions?id=${id}`, {
        method: "DELETE",
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      setPrevOptions((prev) => prev.filter((p) => p.id !== id));
      setPrevSelected((prev) => prev.filter((x) => x !== id));
    } catch (e) {
      alert("ลบวิธีป้องกันไม่สำเร็จ");
      console.error(
        "[DiseaseEditor] deletePreventionMaster:",
        getErrorMessage(e)
      );
    }
  }

  /* ============================================================
   * Render
   * ============================================================ */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">จัดการข้อมูลโรค</h2>
          <p className="text-xs text-gray-500">
            เลือกรหัสโรคด้านล่างเพื่อแก้ไขรายละเอียด อาการ และวิธีป้องกัน
          </p>
        </div>

        <button
          type="button"
          onClick={deleteCurrent}
          disabled={!currentCode}
          className="self-start rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
        >
          ลบโรคนี้
        </button>
      </div>

      {/* เลือกโรค */}
      <section className="rounded border bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">เลือกโรค:</span>
            <select
              className="min-w-[220px] rounded border px-2 py-1 text-sm"
              value={currentCode ?? ""}
              onChange={(e) => setCurrentCode(e.target.value || null)}
            >
              {!currentCode && <option value="">— เลือกโรค —</option>}
              {diseases.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.name_th || d.name_en || "(ยังไม่ได้ตั้งชื่อ)"}
                </option>
              ))}
            </select>
          </div>
          {listLoading && (
            <span className="text-xs text-gray-500">กำลังโหลดรายการโรค…</span>
          )}
        </div>
        {listErr && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
            {listErr}
          </div>
        )}
        {!diseases.length && !listLoading && (
          <div className="text-sm text-gray-500">
            ยังไม่มีรหัสโรค ให้สร้างรหัสใหม่ด้านล่าง
          </div>
        )}
      </section>

      {/* เมตา: ชื่อโรค */}
      <section className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold">ข้อมูลโรค (ชื่อภาษาไทย/อังกฤษ)</h3>

        {!currentCode ? (
          <div className="text-sm text-gray-500">
            กรุณาเลือกโรคจากด้านบนก่อน
          </div>
        ) : (
          <div className="space-y-3">
            {metaErr && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {metaErr}
              </div>
            )}
            {metaOk && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                {metaOk}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  ชื่อโรค (ภาษาไทย)
                </label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={metaNameTH}
                  onChange={(e) => setMetaNameTH(e.target.value)}
                  placeholder="เช่น ไข้หวัดใหญ่"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  ชื่อโรค (ภาษาอังกฤษ)
                </label>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={metaNameEN}
                  onChange={(e) => setMetaNameEN(e.target.value)}
                  placeholder="เช่น Influenza"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveMeta}
              disabled={metaSaving || !currentCode}
              className="rounded bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700 disabled:opacity-60"
            >
              {metaSaving ? "กำลังบันทึก…" : "บันทึกชื่อโรค"}
            </button>
          </div>
        )}
      </section>

      {/* รายละเอียดโรค */}
      <section className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold">รายละเอียดโรค</h3>

        {!currentCode ? (
          <div className="text-sm text-gray-500">
            กรุณาเลือกโรคจากด้านบนก่อน
          </div>
        ) : (
          <div className="space-y-3">
            {detailErr && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {detailErr}
              </div>
            )}

            {detailLoading && (
              <div className="text-xs text-gray-500">กำลังโหลดรายละเอียด…</div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                รายละเอียด (ภาษาไทย)
              </label>
              <textarea
                className="w-full rounded border p-2 text-sm"
                rows={4}
                value={detailTH}
                onChange={(e) => setDetailTH(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                รายละเอียด (ภาษาอังกฤษ)
              </label>
              <textarea
                className="w-full rounded border p-2 text-sm"
                rows={4}
                value={detailEN}
                onChange={(e) => setDetailEN(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={saveDetails}
              disabled={detailSaving || !currentCode}
              className="rounded bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700 disabled:opacity-60"
            >
              {detailSaving ? "กำลังบันทึก…" : "บันทึกรายละเอียด"}
            </button>
          </div>
        )}
      </section>

      {/* --------- อาการโรค --------- */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">อาการโรค</h3>
          {symLoading && (
            <span className="text-xs text-gray-500">กำลังโหลด…</span>
          )}
        </div>

        {symErr && (
          <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {symErr}
          </div>
        )}

        {!currentCode ? (
          <div className="text-sm text-gray-500">
            กรุณาเลือกโรคจากด้านบนก่อน
          </div>
        ) : symOptions.length === 0 ? (
          <div className="text-sm text-gray-500">
            ยังไม่มีอาการในระบบ ให้สร้างอาการใหม่ด้านล่าง
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-500">
              ติ๊กเลือกอาการที่เกี่ยวข้องกับโรคนี้
            </p>
            <div className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded border p-2">
              {symOptions.map((s, index) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={symSelected.includes(s.id)}
                      onChange={() => toggleSymptom(s.id)}
                    />
                    <span>
                      {index + 1}. {s.name_th}
                      {/* ถ้าอยากโชว์ id จริงเพิ่ม ก็ uncomment บรรทัดด้านล่างได้ */}
                      {/* <span className="ml-1 text-[10px] text-gray-400">(id {s.id})</span> */}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteSymptomMaster(s.id)}
                    className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={saveSymptoms}
              disabled={symSaving}
              className="rounded bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700 disabled:opacity-60"
            >
              {symSaving ? "กำลังบันทึก…" : "บันทึกอาการ"}
            </button>
          </>
        )}

        {/* สร้างอาการใหม่ */}
        <div className="mt-6 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold">
            สร้างอาการใหม่ (เพิ่มในตาราง symptoms)
          </h4>
          {symMasterErr && (
            <div className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-600">
              {symMasterErr}
            </div>
          )}
          {symMasterOk && (
            <div className="mb-2 rounded-md bg-green-50 p-2 text-xs text-green-700">
              {symMasterOk}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="ชื่ออาการ (ภาษาไทย)"
              value={symMasterName}
              onChange={(e) => setSymMasterName(e.target.value)}
            />
            <button
              type="button"
              onClick={createSymptomMaster}
              disabled={symMasterSaving}
              className="rounded bg-pink-600 px-4 py-2 text-sm whitespace-nowrap text-white hover:bg-pink-700 disabled:opacity-60"
            >
              {symMasterSaving ? "กำลังสร้าง…" : "สร้างอาการใหม่"}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            ระบบจะกำหนดหมายเลข ID ให้อัตโนมัติ
            และเลือกอาการที่สร้างให้โรคนี้ทันที
          </p>
        </div>
      </section>

      {/* --------- วิธีป้องกัน --------- */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">วิธีป้องกัน</h3>
          {prevLoading && (
            <span className="text-xs text-gray-500">กำลังโหลด…</span>
          )}
        </div>

        {prevErr && (
          <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {prevErr}
          </div>
        )}

        {!currentCode ? (
          <div className="text-sm text-gray-500">
            กรุณาเลือกโรคจากด้านบนก่อน
          </div>
        ) : prevOptions.length === 0 ? (
          <div className="text-sm text-gray-500">
            ยังไม่มีวิธีป้องกันในระบบ ให้สร้างวิธีป้องกันใหม่ด้านล่าง
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-500">
              ติ๊กเลือกวิธีป้องกันที่เกี่ยวข้องกับโรคนี้
            </p>
            <div className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded border p-2">
              {prevOptions.map((p, index) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={prevSelected.includes(p.id)}
                      onChange={() => togglePrevention(p.id)}
                    />
                    <span>
                      {index + 1}. {p.name_th}
                      {/* <span className="ml-1 text-[10px] text-gray-400">(id {p.id})</span> */}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => deletePreventionMaster(p.id)}
                    className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={savePreventions}
              disabled={prevSaving || !currentCode}
              className="rounded bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700 disabled:opacity-60"
            >
              {prevSaving ? "กำลังบันทึก…" : "บันทึกวิธีป้องกัน"}
            </button>
          </>
        )}

        {/* สร้างวิธีป้องกันใหม่ */}
        <div className="mt-6 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold">
            สร้างวิธีป้องกันใหม่ (เพิ่มในตาราง preventions)
          </h4>
          {prevMasterErr && (
            <div className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-600">
              {prevMasterErr}
            </div>
          )}
          {prevMasterOk && (
            <div className="mb-2 rounded-md bg-green-50 p-2 text-xs text-green-700">
              {prevMasterOk}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="ชื่อวิธีป้องกัน (ภาษาไทย)"
              value={prevMasterName}
              onChange={(e) => setPrevMasterName(e.target.value)}
            />
            <button
              type="button"
              onClick={createPreventionMaster}
              disabled={prevMasterSaving}
              className="rounded bg-pink-600 px-4 py-2 text-sm whitespace-nowrap text-white hover:bg-pink-700 disabled:opacity-60"
            >
              {prevMasterSaving ? "กำลังสร้าง…" : "สร้างวิธีป้องกันใหม่"}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            ระบบจะกำหนดหมายเลข ID ให้อัตโนมัติ
            และเลือกวิธีป้องกันที่สร้างให้โรคนี้ทันที
          </p>
        </div>
      </section>

      {/* สร้างรหัสโรคใหม่ */}
      <section className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold">สร้างรหัสโรคใหม่</h3>

        {createErr && (
          <div className="mb-2 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {createErr}
          </div>
        )}
        {createOk && (
          <div className="mb-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
            {createOk}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[130px,1fr,1fr,auto]">
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="รหัส เช่น D10"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="ชื่อไทย (ถ้ามี)"
            value={newNameTH}
            onChange={(e) => setNewNameTH(e.target.value)}
          />
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="ชื่ออังกฤษ (ถ้ามี)"
            value={newNameEN}
            onChange={(e) => setNewNameEN(e.target.value)}
          />
          <button
            type="button"
            onClick={createDisease}
            disabled={createSaving || !newCode.trim()}
            className="mt-1 rounded bg-pink-600 px-4 py-2 text-sm text-white hover:bg-pink-700 disabled:opacity-60 sm:mt-0"
          >
            {createSaving ? "กำลังสร้าง…" : "สร้างโรคใหม่"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          สามารถสร้างโรคใหม่ล่วงหน้าได้ แล้วกลับมาใส่รายละเอียด / อาการ /
          วิธีป้องกันภายหลังได้
        </p>
      </section>
    </div>
  );
}
