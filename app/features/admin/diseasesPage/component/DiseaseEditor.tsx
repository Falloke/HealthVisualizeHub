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

type ImportErrorItem = { line: number; message: string };
type ImportResp =
  | {
      ok: true;
      inserted: number;
      skipped: number;
      totalRows: number;
      warnings?: string[];
    }
  | {
      ok: false;
      error: string;
      errors?: ImportErrorItem[];
      detail?: string;
    };

function slugifyAscii(input: string) {
  const s = (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return s || "data";
}

function suggestTableName(diseaseCode: string | null, d?: Disease | null) {
  // D03 -> d03_<name>
  const num = (diseaseCode || "").trim().toUpperCase().replace(/^D/, "");
  const nn = /^\d+$/.test(num) ? String(num).padStart(2, "0") : "00";
  const base = slugifyAscii(d?.name_en || d?.name_th || "data");
  return `d${nn}_${base}`;
}

/** ✅ บอก Sidebar ให้รีโหลดรายการโรคทันที */
function emitRefreshDiseases() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("hhub:diseases:refresh"));
}

export default function DiseaseEditor({ code }: Props) {
  /* ------------------------------------------------------------------
   * 1) รายการโรคทั้งหมด + โรคที่เลือกอยู่ (สำหรับแก้ไขรายละเอียด)
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
   * ✅ โหมด "สร้าง table public" (แยกจาก currentCode)
   * ------------------------------------------------------------------ */

  const [publicTargetCode, setPublicTargetCode] = useState<string | null>(null);
  const publicTargetDisease = useMemo(
    () => diseases.find((d) => d.code === publicTargetCode) ?? null,
    [diseases, publicTargetCode]
  );

  /* ------------------------------------------------------------------
   * ✅ โหมด Import CSV (เลือกโรค + table ปลายทาง)
   * ------------------------------------------------------------------ */

  const [importTargetCode, setImportTargetCode] = useState<string | null>(null);
  const importTargetDisease = useMemo(
    () => diseases.find((d) => d.code === importTargetCode) ?? null,
    [diseases, importTargetCode]
  );

  const [importTableName, setImportTableName] = useState<string>("");

  // ตั้งค่า default importTargetCode
  useEffect(() => {
    if (!diseases.length) return;

    setImportTargetCode((prev) => {
      if (prev && diseases.some((d) => d.code === prev)) return prev;
      const preferred = code ? diseases.find((d) => d.code === code) : null;
      return preferred?.code ?? diseases[0].code;
    });
  }, [diseases, code]);

  // auto-suggest importTableName เมื่อเลือกโรค import
  useEffect(() => {
    if (!importTargetCode) {
      setImportTableName("");
      return;
    }
    setImportTableName((prev) => {
      const suggested = suggestTableName(importTargetCode, importTargetDisease);
      if (!prev) return suggested;

      const looksAuto =
        prev.startsWith("d") && prev.includes("_") && prev.length <= 40;

      return looksAuto ? suggested : prev;
    });
  }, [importTargetCode, importTargetDisease]);

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
   * 4) อาการโรค
   * ------------------------------------------------------------------ */

  const [symOptions, setSymOptions] = useState<SymptomOption[]>([]);
  const [symSelected, setSymSelected] = useState<number[]>([]);
  const [symLoading, setSymLoading] = useState(false);
  const [symSaving, setSymSaving] = useState(false);
  const [symErr, setSymErr] = useState<string | null>(null);

  const [symMasterName, setSymMasterName] = useState("");
  const [symMasterSaving, setSymMasterSaving] = useState(false);
  const [symMasterErr, setSymMasterErr] = useState<string | null>(null);
  const [symMasterOk, setSymMasterOk] = useState<string | null>(null);

  /* ------------------------------------------------------------------
   * 5) วิธีป้องกัน
   * ------------------------------------------------------------------ */

  const [prevOptions, setPrevOptions] = useState<PreventionOption[]>([]);
  const [prevSelected, setPrevSelected] = useState<number[]>([]);
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevSaving, setPrevSaving] = useState(false);
  const [prevErr, setPrevErr] = useState<string | null>(null);

  const [prevMasterName, setPrevMasterName] = useState("");
  const [prevMasterSaving, setPrevMasterSaving] = useState(false);
  const [prevMasterErr, setPrevMasterErr] = useState<string | null>(null);
  const [prevMasterOk, setPrevMasterOk] = useState<string | null>(null);

  /* ------------------------------------------------------------------
   * 6) ✅ สร้างโรคใหม่ (สร้างเฉพาะ diseases)
   * ------------------------------------------------------------------ */

  const [newCode, setNewCode] = useState("");
  const [newNameTH, setNewNameTH] = useState("");
  const [newNameEN, setNewNameEN] = useState("");

  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  /* ------------------------------------------------------------------
   * 7) IMPORT CSV -> dynamic tableName
   * ------------------------------------------------------------------ */

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importOk, setImportOk] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<ImportErrorItem[]>([]);

  async function doImportCSV() {
    if (!importFile) return;

    if (!importTargetCode) {
      setImportErr("กรุณาเลือกรหัสโรคที่จะ Import");
      return;
    }
    if (!importTableName.trim()) {
      setImportErr("กรุณาระบุชื่อ Table ปลายทาง");
      return;
    }

    setImporting(true);
    setImportOk(null);
    setImportErr(null);
    setImportErrors([]);

    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("skipBadRows", "true");

      // ✅ ส่งข้อมูลสำคัญไป backend
      fd.append("diseaseCode", importTargetCode);
      fd.append("tableName", importTableName.trim());

      const res = await fetch("/api/admin/d02-test/import", {
        method: "POST",
        body: fd,
      });

      const json = (await res.json().catch(() => null)) as ImportResp | null;

      if (!res.ok || !json) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      if (json.ok) {
        const warnText =
          json.warnings && json.warnings.length
            ? `\n${json.warnings.join("\n")}`
            : "";

        setImportOk(
          `Import สำเร็จ: เพิ่ม ${json.inserted.toLocaleString()} แถว (ข้าม ${json.skipped.toLocaleString()} แถว) จากทั้งหมด ${json.totalRows.toLocaleString()} แถว${warnText}`
        );
        setImportErr(null);
        setImportErrors([]);
      } else {
        setImportOk(null);
        setImportErr(json.error || "Import ไม่สำเร็จ");
        setImportErrors(json.errors ?? []);
      }
    } catch (e) {
      setImportOk(null);
      setImportErr(getErrorMessage(e) || "Import ไม่สำเร็จ");
      setImportErrors([]);
    } finally {
      setImporting(false);
    }
  }

  /* ------------------------------------------------------------------
   * 8) ✅ สร้างตารางข้อมูลโรค (public.dXX_…)
   * ------------------------------------------------------------------ */

  const [publicTableName, setPublicTableName] = useState("");
  const [createTableSaving, setCreateTableSaving] = useState(false);
  const [createTableErr, setCreateTableErr] = useState<string | null>(null);
  const [createTableOk, setCreateTableOk] = useState<string | null>(null);

  // ✅ ตั้งค่าเริ่มต้น publicTargetCode / ชื่อ table อัตโนมัติ
  useEffect(() => {
    if (!diseases.length) return;

    setPublicTargetCode((prev) => {
      if (prev && diseases.some((d) => d.code === prev)) return prev;
      const preferred = code ? diseases.find((d) => d.code === code) : null;
      return preferred?.code ?? diseases[0].code;
    });
  }, [diseases, code]);

  // ✅ อัปเดตชื่อ table อัตโนมัติเมื่อเปลี่ยน publicTargetCode
  useEffect(() => {
    setCreateTableErr(null);
    setCreateTableOk(null);

    if (!publicTargetCode) {
      setPublicTableName("");
      return;
    }

    setPublicTableName((prev) => {
      const suggested = suggestTableName(publicTargetCode, publicTargetDisease);
      if (!prev) return suggested;

      const looksAuto =
        prev.startsWith("d") && prev.includes("_") && prev.length <= 40;
      return looksAuto ? suggested : prev;
    });
  }, [publicTargetCode, publicTargetDisease]);

  async function createDiseaseTableByCode(targetCode: string, name: string) {
    const tname = (name || "").trim().toLowerCase();
    if (!tname) throw new Error("กรุณาระบุชื่อ table เช่น d03_influenza");

    const res = await fetch("/api/admin/disease-tables/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableName: tname,
        createDefaultPartition: false,
        diseaseCode: targetCode,
      }),
    });

    const txt = await res.text().catch(() => "");
    if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

    const j = JSON.parse(txt) as {
      ok: boolean;
      table?: string;
      createdDefaultPartition?: boolean;
      diseaseInserted?: string | null;
    };

    return j;
  }

  async function createPublicDiseaseTable() {
    setCreateTableErr(null);
    setCreateTableOk(null);

    if (!publicTargetCode) {
      setCreateTableErr("กรุณาเลือกรหัสโรคที่จะสร้างตารางลง public");
      return;
    }

    const name = (publicTableName || "").trim().toLowerCase();
    if (!name) {
      setCreateTableErr("กรุณาระบุชื่อ table เช่น d03_influenza");
      return;
    }

    setCreateTableSaving(true);
    try {
      const j = await createDiseaseTableByCode(publicTargetCode, name);
      setCreateTableOk(
        `✅ สร้างตารางสำเร็จ: ${j.table ?? `public.${name}`}`
      );

      emitRefreshDiseases();
      await loadDiseases(true);
    } catch (e) {
      setCreateTableErr(getErrorMessage(e) || "สร้างตารางไม่สำเร็จ");
      console.error(
        "[DiseaseEditor] createPublicDiseaseTable:",
        getErrorMessage(e)
      );
    } finally {
      setCreateTableSaving(false);
    }
  }

  /* ===========================
   * Theme (ฟ้า)
   * =========================== */
  const inputBase =
    "w-full rounded border px-3 py-2 text-sm bg-white outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100";
  const selectBase =
    "w-full rounded border px-3 py-2 text-sm bg-white outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100";
  const textareaBase =
    "w-full rounded border p-2 text-sm bg-white outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100";
  const primaryBtn =
    "rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:opacity-60";
  const dangerBtn =
    "rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-200 disabled:opacity-60";

  /* ============================================================
   * โหลด list โรค
   * ============================================================ */

  async function loadDiseases(keepCurrent = false) {
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

      setCurrentCode((prev) => {
        if (keepCurrent && prev && items.some((d) => d.code === prev))
          return prev;
        const preferred = code ? items.find((d) => d.code === code) : null;
        return preferred?.code ?? items[0].code;
      });
    } catch (e) {
      setListErr("โหลดรายการโรคไม่สำเร็จ");
      console.error("[DiseaseEditor] loadDiseases:", getErrorMessage(e));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void loadDiseases(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => void loadDiseases(true);
    window.addEventListener("hhub:diseases:refresh", handler);
    return () => window.removeEventListener("hhub:diseases:refresh", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
   * โหลดรายละเอียด / อาการ / วิธีป้องกัน ของโรคที่เลือก
   * ============================================================ */

  useEffect(() => {
    if (!currentCode) return;

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
      } catch (e) {
        setDetailErr("โหลดรายละเอียดโรคไม่สำเร็จ");
        console.error("[DiseaseEditor] load details:", getErrorMessage(e));
      } finally {
        setDetailLoading(false);
      }
    })();

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
      } catch (e) {
        setSymErr("โหลดอาการโรคไม่สำเร็จ");
        console.error("[DiseaseEditor] load symptoms:", getErrorMessage(e));
      } finally {
        setSymLoading(false);
      }
    })();

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

      emitRefreshDiseases();
    } catch (e) {
      setMetaErr("บันทึกชื่อโรคไม่สำเร็จ");
      console.error("[DiseaseEditor] saveMeta:", getErrorMessage(e));
    } finally {
      setMetaSaving(false);
    }
  }

  /* ============================================================
   * ✅ สร้างโรคใหม่ (สร้างเฉพาะ diseases ก่อน)
   * ============================================================ */

  async function createDisease() {
    setCreateErr(null);
    setCreateOk(null);

    const codeTrim = newCode.trim();
    if (!codeTrim) {
      setCreateErr("กรุณาระบุรหัสโรค");
      return;
    }

    setCreateSaving(true);
    try {
      const res = await fetch("/api/admin/diseases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeTrim,
          name_th: newNameTH,
          name_en: newNameEN,
        }),
      });
      const txt = await res.text().catch(() => "");
      if (!res.ok) throw new Error(txt || `HTTP ${res.status}`);

      const created = JSON.parse(txt) as Disease;

      setNewCode("");
      setNewNameTH("");
      setNewNameEN("");

      await loadDiseases(true);
      setCurrentCode(created.code);

      emitRefreshDiseases();
      setCreateOk(`✅ สร้างโรค ${created.code} สำเร็จ (ยังไม่สร้าง table public)`);
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

      await loadDiseases(false);
      setDetailTH("");
      setDetailEN("");
      setSymSelected([]);
      setPrevSelected([]);

      emitRefreshDiseases();
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
   * อาการโรค
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
   * วิธีป้องกัน
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
        `/api/admin/diseases/preventions?code=${encodeURIComponent(currentCode)}`,
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
          <h2 className="text-xl font-semibold text-sky-800">จัดการข้อมูลโรค</h2>
        </div>

        <button
          type="button"
          onClick={deleteCurrent}
          disabled={!currentCode}
          className={dangerBtn}
        >
          ลบโรคนี้
        </button>
      </div>

      {/* เลือกโรค */}
      <section className="rounded border bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span className="text-sm font-medium text-gray-700">เลือกโรค:</span>
            <div className="w-full sm:w-[320px]">
              <select
                className={selectBase}
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
        <h3 className="mb-3 font-semibold text-sky-800">
          ข้อมูลโรค (ชื่อภาษาไทย/อังกฤษ)
        </h3>

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
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  ชื่อโรค (ภาษาไทย)
                </label>
                <input
                  className={inputBase}
                  value={metaNameTH}
                  onChange={(e) => setMetaNameTH(e.target.value)}
                  placeholder="เช่น ไข้หวัดใหญ่"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  ชื่อโรค (ภาษาอังกฤษ)
                </label>
                <input
                  className={inputBase}
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
              className={primaryBtn}
            >
              {metaSaving ? "กำลังบันทึก…" : "บันทึกชื่อโรค"}
            </button>
          </div>
        )}
      </section>

      {/* รายละเอียดโรค */}
      <section className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold text-sky-800">รายละเอียดโรค</h3>

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
              <label className="mb-1 block text-sm font-medium text-gray-700">
                รายละเอียด (ภาษาไทย)
              </label>
              <textarea
                className={textareaBase}
                rows={4}
                value={detailTH}
                onChange={(e) => setDetailTH(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                รายละเอียด (ภาษาอังกฤษ)
              </label>
              <textarea
                className={textareaBase}
                rows={4}
                value={detailEN}
                onChange={(e) => setDetailEN(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={saveDetails}
              disabled={detailSaving || !currentCode}
              className={primaryBtn}
            >
              {detailSaving ? "กำลังบันทึก…" : "บันทึกรายละเอียด"}
            </button>
          </div>
        )}
      </section>

      {/* --------- อาการโรค --------- */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-sky-800">อาการโรค</h3>
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
            <div className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded border p-2">
              {symOptions.map((s, index) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-sky-600"
                      checked={symSelected.includes(s.id)}
                      onChange={() => toggleSymptom(s.id)}
                    />
                    <span>
                      {index + 1}. {s.name_th}
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
              disabled={symSaving || !currentCode}
              className={primaryBtn}
            >
              {symSaving ? "กำลังบันทึก…" : "บันทึกอาการ"}
            </button>
          </>
        )}

        <div className="mt-6 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold text-sky-800">
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
              className={inputBase}
              placeholder="ชื่ออาการ (ภาษาไทย)"
              value={symMasterName}
              onChange={(e) => setSymMasterName(e.target.value)}
            />
            <button
              type="button"
              onClick={createSymptomMaster}
              disabled={symMasterSaving}
              className={`${primaryBtn} whitespace-nowrap`}
            >
              {symMasterSaving ? "กำลังสร้าง…" : "สร้างอาการใหม่"}
            </button>
          </div>
        </div>
      </section>

      {/* --------- วิธีป้องกัน --------- */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-sky-800">วิธีป้องกัน</h3>
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
            <div className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded border p-2">
              {prevOptions.map((p, index) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-sky-600"
                      checked={prevSelected.includes(p.id)}
                      onChange={() => togglePrevention(p.id)}
                    />
                    <span>
                      {index + 1}. {p.name_th}
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
              className={primaryBtn}
            >
              {prevSaving ? "กำลังบันทึก…" : "บันทึกวิธีป้องกัน"}
            </button>
          </>
        )}

        <div className="mt-6 border-t pt-4">
          <h4 className="mb-2 text-sm font-semibold text-sky-800">
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
              className={inputBase}
              placeholder="ชื่อวิธีป้องกัน (ภาษาไทย)"
              value={prevMasterName}
              onChange={(e) => setPrevMasterName(e.target.value)}
            />
            <button
              type="button"
              onClick={createPreventionMaster}
              disabled={prevMasterSaving}
              className={`${primaryBtn} whitespace-nowrap`}
            >
              {prevMasterSaving ? "กำลังสร้าง…" : "สร้างวิธีป้องกันใหม่"}
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================
          ✅ สร้างรหัสโรคใหม่ (สร้างเฉพาะ diseases ก่อน)
         ========================================================= */}
      <section className="rounded border bg-white p-4">
        <h3 className="mb-3 font-semibold text-sky-800">สร้างรหัสโรคใหม่</h3>

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
            className={inputBase}
            placeholder="รหัส เช่น D10"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <input
            className={inputBase}
            placeholder="ชื่อไทย (ถ้ามี)"
            value={newNameTH}
            onChange={(e) => setNewNameTH(e.target.value)}
          />
          <input
            className={inputBase}
            placeholder="ชื่ออังกฤษ (ถ้ามี)"
            value={newNameEN}
            onChange={(e) => setNewNameEN(e.target.value)}
          />
          <button
            type="button"
            onClick={createDisease}
            disabled={createSaving || !newCode.trim()}
            className={`${primaryBtn} mt-1 sm:mt-0`}
          >
            {createSaving ? "กำลังสร้าง…" : "สร้างโรคใหม่"}
          </button>
        </div>
      </section>

      {/* =========================================================
          ✅ สร้างตารางข้อมูลโรค (public) แบบ Dropdown เลือกรหัสโรค
         ========================================================= */}
      <section className="rounded border bg-white p-4">
        <h3 className="mb-2 font-semibold text-sky-800">
          สร้างตารางข้อมูลโรค (public)
        </h3>
        {createTableErr && (
          <div className="mb-2 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {createTableErr}
          </div>
        )}
        {createTableOk && (
          <div className="mb-2 rounded-md bg-green-50 p-3 text-sm text-green-700">
            {createTableOk}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[260px,1fr,auto] sm:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              เลือกรหัสโรคที่จะสร้างตาราง
            </label>
            <select
              className={selectBase}
              value={publicTargetCode ?? ""}
              onChange={(e) => setPublicTargetCode(e.target.value || null)}
            >
              {!publicTargetCode && <option value="">— เลือกรหัสโรค —</option>}
              {diseases.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.name_th || d.name_en || "(ยังไม่ได้ตั้งชื่อ)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ชื่อ table (แนะนำอัตโนมัติ)
            </label>
            <input
              className={inputBase}
              value={publicTableName}
              onChange={(e) => setPublicTableName(e.target.value)}
              placeholder="เช่น d02_dengue_fever"
            />
            <div className="mt-1 text-xs text-gray-500">
              แนะนำ:{" "}
              <span className="font-medium text-sky-700">
                {publicTargetCode
                  ? suggestTableName(publicTargetCode, publicTargetDisease)
                  : "-"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={createPublicDiseaseTable}
            disabled={
              createTableSaving || !publicTargetCode || !publicTableName.trim()
            }
            className={`${primaryBtn} w-full sm:w-auto`}
          >
            {createTableSaving ? "กำลังสร้าง…" : "สร้างตาราง"}
          </button>
        </div>
      </section>

      {/* ===================== Import CSV ===================== */}
      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-sky-800">
              นำเข้าข้อมูลรูปแบบ CSV
            </h3>
            <p className="text-gray-500 text-md">
              (เลือกโรค และ ตารางที่ต้องการนำเข้า)
            </p>
          </div>

          {/* ✅ Badge สถานะพร้อม import */}
          <div className="mt-2 sm:mt-0">
            {importTargetCode && importTableName.trim() && importFile ? (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                พร้อมนำเข้า ✅
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                ยังไม่พร้อมนำเข้า
              </span>
            )}
          </div>
        </div>

        {/* ✅ เลือกรหัสโรค + Table */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* เลือกรหัสโรค */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              รหัสโรคที่จะ Import
            </label>
            <select
              className={selectBase}
              value={importTargetCode ?? ""}
              onChange={(e) => {
                setImportOk(null);
                setImportErr(null);
                setImportErrors([]);
                setImportTargetCode(e.target.value || null);
              }}
            >
              {!importTargetCode && (
                <option value="">— เลือกรหัสโรค —</option>
              )}
              {diseases.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.name_th || d.name_en || "(ยังไม่ได้ตั้งชื่อ)"}
                </option>
              ))}
            </select>

            <p className="mt-1 text-xs text-gray-500">
              {importTargetCode
                ? `เลือกแล้ว: ${importTargetCode}`
                : "กรุณาเลือกรหัสโรคก่อน"}
            </p>
          </div>

          {/* table ปลายทาง */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ตารางที่ต้องการนำเข้า
            </label>

            <div className="flex gap-2">
              <input
                className={inputBase}
                value={importTableName}
                onChange={(e) => {
                  setImportOk(null);
                  setImportErr(null);
                  setImportErrors([]);
                  setImportTableName(e.target.value);
                }}
                placeholder="เช่น d01_influenza"
              />

              {/* ✅ ปุ่มเติมชื่อแนะนำ */}
              <button
                type="button"
                className="whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                disabled={!importTargetCode}
                onClick={() => {
                  if (!importTargetCode) return;
                  setImportTableName(
                    suggestTableName(importTargetCode, importTargetDisease)
                  );
                }}
                title="ใช้ชื่อแนะนำอัตโนมัติ"
              >
                ใช้ชื่อแนะนำ
              </button>
            </div>

            <div className="mt-1 text-xs text-gray-500">
              แนะนำ:{" "}
              <span className="font-medium text-sky-700">
                {importTargetCode
                  ? suggestTableName(importTargetCode, importTargetDisease)
                  : "-"}
              </span>
            </div>
          </div>
        </div>

        {/* ✅ เลือกไฟล์ + ปุ่ม Import */}
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr,auto] sm:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              เลือกไฟล์ .csv
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full rounded-lg border p-2 text-sm"
                onChange={(e) => {
                  setImportOk(null);
                  setImportErr(null);
                  setImportErrors([]);
                  const f = e.target.files?.[0] ?? null;
                  setImportFile(f);
                }}
              />

              {/* ✅ ปุ่มล้างไฟล์ */}
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                disabled={!importFile || importing}
                onClick={() => {
                  setImportFile(null);
                  setImportOk(null);
                  setImportErr(null);
                  setImportErrors([]);
                }}
              >
                ล้างไฟล์
              </button>
            </div>

            {importFile && (
              <div className="mt-1 text-xs text-gray-500">
                ไฟล์: <span className="font-medium">{importFile.name}</span> (
                {(importFile.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>

          <button
            type="button"
            className={primaryBtn}
            disabled={
              !importFile ||
              importing ||
              !importTargetCode ||
              !importTableName.trim()
            }
            onClick={doImportCSV}
          >
            {importing ? "กำลัง Import…" : "Import CSV"}
          </button>
        </div>

        {/* ✅ result messages */}
        {importOk && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            ✅ {importOk}
          </div>
        )}

        {importErr && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ❌ {importErr}
          </div>
        )}

        {/* ✅ error list แบบอ่านง่าย */}
        {importErrors.length > 0 && (
          <div className="mt-4 rounded-lg border bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700">
                รายการ error (แสดงสูงสุด 30 รายการ)
              </div>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                {Math.min(importErrors.length, 30)}/{importErrors.length}
              </span>
            </div>

            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {importErrors.slice(0, 30).map((er, idx) => (
                <div
                  key={`${er.line}-${idx}`}
                  className="rounded-md border bg-white p-2 text-xs text-gray-700"
                >
                  <span className="font-semibold text-red-600">
                    บรรทัด {er.line}:
                  </span>{" "}
                  {er.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
