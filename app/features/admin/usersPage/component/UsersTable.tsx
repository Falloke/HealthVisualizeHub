// app/features/admin/usersPage/component/UsersTable.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Eye, Pencil, Trash2, X } from "lucide-react";
import { z } from "zod";
import {
  adminCreateUserSchema,
  adminEditUserSchema,
  type AdminCreateUser,
  type AdminEditUser,
} from "@/schemas/adminUserSchemas";

type AdminUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role?: string | null;
  position: string | null;
  province: string | null;
  brith_date?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;

  // เวลาที่ใช้งานเว็บรวม (วินาที) ต้องชื่อให้ตรงกับ backend
  totalUsageSeconds?: number | null;
};

type EditForm = AdminEditUser;
type CreateForm = AdminCreateUser;

type ProvinceItem = {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
};

type EditErrors = Partial<Record<keyof EditForm, string>>;
type CreateErrors = Partial<Record<keyof CreateForm, string>>;

/* ---------- helpers ---------- */

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatDurationTH(sec?: number | null) {
  if (!sec || sec <= 0) return "0 วินาที";

  let remaining = sec;
  const h = Math.floor(remaining / 3600);
  remaining -= h * 3600;
  const m = Math.floor(remaining / 60);
  const s = remaining - m * 60;

  const parts: string[] = [];
  if (h) parts.push(`${h} ชม.`);
  if (m) parts.push(`${m} นาที`);
  if (s || parts.length === 0) parts.push(`${s} วินาที`);
  return parts.join(" ");
}

/** เรียงผู้ใช้: ใหม่สุดบนสุด (ตาม createdAt desc, fallback id desc) */
const sortUsers = (arr: AdminUser[]) =>
  [...arr].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : -Infinity;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : -Infinity;
    if (tb !== ta) return tb - ta;
    return (b.id ?? 0) - (a.id ?? 0);
  });

/* badge บทบาท Member / Admin */
function RoleBadge({ role }: { role?: string | null }) {
  const isAdmin = role === "Admin";
  const text = isAdmin ? "Admin" : "Member";

  const className = isAdmin
    ? "inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600"
    : "inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600";

  return <span className={className}>{text}</span>;
}

/* --- helper แบ่งจังหวัดตามภูมิภาค + label เส้นยาวให้เท่ากรุงเทพฯ --- */

function groupProvinces(list: ProvinceItem[]): Record<string, ProvinceItem[]> {
  return list.reduce<Record<string, ProvinceItem[]>>((acc, p) => {
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

/* ---------- component ---------- */

export default function UsersTable() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewing, setViewing] = useState<AdminUser | null>(null);

  const [editing, setEditing] = useState<EditForm | null>(null);
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState<CreateForm | null>(null);
  const [createErrors, setCreateErrors] = useState<CreateErrors>({});
  const [creatingBusy, setCreatingBusy] = useState(false);

  const [provinces, setProvinces] = useState<ProvinceItem[]>([]);
  const [provLoading, setProvLoading] = useState(true);
  const [provErr, setProvErr] = useState<string | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(10);

  // โหลดจังหวัด
  useEffect(() => {
    (async () => {
      try {
        setProvLoading(true);
        setProvErr(null);
        const res = await fetch("/data/Thailand-ProvinceName.json", {
          cache: "force-cache",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ProvinceItem[] = await res.json();
        setProvinces(data);
      } catch (e) {
        console.error("โหลดจังหวัดล้มเหลว:", e);
        setProvErr("โหลดรายชื่อจังหวัดไม่สำเร็จ");
      } finally {
        setProvLoading(false);
      }
    })();
  }, []);

  // โหลด users (รวมเวลาใช้งานด้วย)
  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data: AdminUser[] = await res.json();
      setUsers(sortUsers(data));
    } catch (e) {
      console.error("load users error:", e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  // เปลี่ยนจำนวนคนต่อหน้า → กลับไปหน้า 1
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const softDelete = async (id: number) => {
    if (!confirm("ยืนยันปิดการใช้งานผู้ใช้?")) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setViewing((v) => (v?.id === id ? null : v));
      setEditing((e) => (e?.id === id ? null : e));
    } else {
      alert("ลบไม่สำเร็จ");
    }
  };

  const zodToErrors = <T extends Record<string, unknown>>(
    err: z.ZodError
  ): Partial<Record<keyof T, string>> => {
    const out: Partial<Record<string, string>> = {};
    err.issues.forEach((i) => {
      const k = typeof i.path?.[0] === "string" ? (i.path[0] as string) : "";
      if (k) out[k] = i.message;
    });
    return out as Partial<Record<keyof T, string>>;
  };

  /* ---------- View ---------- */
  const openView = (u: AdminUser) => setViewing(u);
  const closeView = () => setViewing(null);

  /* ---------- Edit ---------- */
  const openEdit = (u: AdminUser) => {
    setEditing({
      id: u.id,
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      email: u.email ?? "",
      role: (u.role as EditForm["role"]) ?? "User",
      position: u.position ?? "",
      province: u.province ?? "",
      brith_date: fmtDate(u.brith_date),
    });
    setEditErrors({});

    // ถ้าเปิด modal หน้าอื่นอยู่ให้ปิด
    setViewing(null);
  };
  const closeEdit = () => {
    setEditing(null);
    setEditErrors({});
  };

  const onEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;
    setEditing((prev) => (prev ? ({ ...prev, [id]: value } as EditForm) : prev));
    const key = id as keyof EditErrors;
    setEditErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateEdit = (): boolean => {
    if (!editing) return false;
    const parsed = adminEditUserSchema.safeParse(editing);
    if (!parsed.success) {
      setEditErrors(zodToErrors<EditForm>(parsed.error));
      return false;
    }
    setEditErrors({});
    return true;
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!validateEdit()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          first_name: editing.first_name.trim(),
          last_name: editing.last_name.trim(),
          email: editing.email.trim(),
          role: editing.role,
          position: editing.position.trim(),
          province: editing.province.trim(),
          brith_date: editing.brith_date || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "บันทึกไม่สำเร็จ");
      }
      const updated: AdminUser = await res.json();
      setUsers((prev) =>
        sortUsers(prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)))
      );
      closeEdit();
    } catch (e) {
      alert((e as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Create ---------- */
  const openCreate = () =>
    setCreating({
      first_name: "",
      last_name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "User",
      position: "",
      province: "",
      brith_date: "",
    });

  const closeCreate = () => {
    setCreating(null);
    setCreateErrors({});
  };

  const onCreateChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { id, value } = e.target;
    setCreating((prev) => (prev ? ({ ...prev, [id]: value } as CreateForm) : prev));
    const key = id as keyof CreateErrors;
    setCreateErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateCreate = (): boolean => {
    if (!creating) return false;
    const parsed = adminCreateUserSchema.safeParse(creating);
    if (!parsed.success) {
      setCreateErrors(zodToErrors<CreateForm>(parsed.error));
      return false;
    }
    setCreateErrors({});
    return true;
  };

  const saveCreate = async () => {
    if (!creating) return;
    if (!validateCreate()) return;

    setCreatingBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: creating.first_name.trim(),
          last_name: creating.last_name.trim(),
          email: creating.email.trim(),
          password: creating.password,
          role: creating.role,
          position: creating.position.trim(),
          province: creating.province.trim(),
          brith_date: creating.brith_date,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "สร้างผู้ใช้ไม่สำเร็จ");
      }
      const created: AdminUser = await res.json();
      setUsers((prev) => sortUsers([created, ...prev]));
      closeCreate();
    } catch (e) {
      alert((e as Error).message || "เกิดข้อผิดพลาด");
    } finally {
      setCreatingBusy(false);
    }
  };

  /* ---------- pagination logic ---------- */

  const totalUsers = users.length;
  const effectivePageSize = pageSize === "all" ? totalUsers || 1 : pageSize;

  const totalPages = Math.max(1, Math.ceil(totalUsers / effectivePageSize));
  const currentPage = Math.min(page, totalPages);

  const startIndex =
    pageSize === "all" ? 0 : (currentPage - 1) * effectivePageSize;

  const pageUsers =
    pageSize === "all"
      ? users
      : users.slice(startIndex, startIndex + effectivePageSize);

  const provinceGroups = groupProvinces(provinces);

  /* ---------- UI ---------- */

  // ✅ theme ฟ้าแบบที่ทำไว้
  const primaryBtn =
    "rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 shadow-sm focus:outline-none focus:ring-4 focus:ring-sky-200";
  const primaryBtnSoft =
    "rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:opacity-50";
  const inputBase =
    "w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 bg-white";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-sky-800">ผู้ใช้งาน</h2>

        <div className="flex items-center gap-4">
          {/* เลือกจำนวนคนต่อหน้า */}
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
            <span>แสดง</span>
            <select
              className="rounded-md border px-2 py-1 text-sm bg-white outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              value={pageSize === "all" ? "all" : String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === "all" ? "all" : Number(v));
              }}
            >
              {[10, 15, 20, 25, 30, 40].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="all">ทั้งหมด</option>
            </select>
            <span>คน / หน้า</span>
          </div>

          <button
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
            onClick={loadUsers}
          >
            รีเฟรช
          </button>
          {/* ✅ เปลี่ยนจากชมพู -> ฟ้า */}
          <button className={primaryBtn} onClick={openCreate}>
            เพิ่มผู้ใช้
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {loading ? (
          <div className="px-6 py-10 text-center text-gray-500">
            กำลังโหลด...
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">
            ยังไม่มีผู้ใช้งาน
          </div>
        ) : (
          <>
            {/* ✅ header row: ชมพู -> ฟ้า */}
            <div className="bg-sky-50 px-6 py-3 text-sm font-medium text-gray-700 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_auto]">
              <div>ชื่อสมาชิก</div>
              <div>อีเมล</div>
              <div>บทบาท / ตำแหน่ง</div>
              <div>เวลาที่ใช้งานเว็บรวม</div>
              <div className="text-right">เครื่องมือ</div>
            </div>

            <div className="divide-y divide-gray-100">
              {pageUsers.map((u) => (
                <div
                  key={u.id}
                  className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_auto] items-center px-6 py-3 text-sm hover:bg-gray-50"
                >
                  {/* ชื่อ + ตำแหน่งย่อย */}
                  <div className="min-w-0">
                    <div className="font-medium truncate text-gray-900">
                      {u.first_name} {u.last_name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {u.position ?? "-"}
                      {u.province ? ` • ${u.province}` : ""}
                    </div>
                  </div>

                  {/* email */}
                  <div className="min-w-0 truncate text-gray-800">{u.email}</div>

                  {/* role badge */}
                  <div className="flex items-center gap-2">
                    <RoleBadge role={u.role} />
                  </div>

                  {/* total duration */}
                  <div className="text-gray-700">
                    {formatDurationTH(u.totalUsageSeconds ?? 0)}
                  </div>

                  {/* tools */}
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className="p-2 hover:bg-gray-100 rounded-md"
                      title="ดู"
                      onClick={() => openView(u)}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      className="p-2 hover:bg-gray-100 rounded-md"
                      title="แก้ไข"
                      onClick={() => openEdit(u)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="p-2 hover:bg-gray-100 rounded-md"
                      title="ลบ (soft)"
                      onClick={() => softDelete(u.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* footer pagination */}
            <div className="flex flex-col gap-2 border-t px-6 py-3 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
              <div>
                รวม {totalUsers} คน • หน้า {currentPage} / {totalPages}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-100"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  ก่อนหน้า
                </button>
                <button
                  className="rounded-md border px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-sky-100"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------- View Modal ---------- */}
      {viewing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-sky-800">
                รายละเอียดผู้ใช้งาน
              </h3>
              <button
                className="rounded-full p-1 hover:bg-gray-100"
                onClick={closeView}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">ชื่อ:</span>{" "}
                {viewing.first_name} {viewing.last_name}
              </div>
              <div>
                <span className="font-medium">อีเมล:</span> {viewing.email}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">บทบาท:</span>
                <RoleBadge role={viewing.role} />
              </div>
              <div>
                <span className="font-medium">ตำแหน่ง:</span>{" "}
                {viewing.position ?? "-"}
              </div>
              <div>
                <span className="font-medium">จังหวัด:</span>{" "}
                {viewing.province ?? "-"}
              </div>
              <div>
                <span className="font-medium">วันเกิด:</span>{" "}
                {fmtDate(viewing.brith_date)}
              </div>
              <div>
                <span className="font-medium">เวลาที่ใช้งานรวม:</span>{" "}
                {formatDurationTH(viewing.totalUsageSeconds ?? 0)}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                onClick={closeView}
              >
                ปิด
              </button>
              {/* ✅ ชมพู -> ฟ้า */}
              <button
                className={primaryBtnSoft}
                onClick={() => openEdit(viewing)}
              >
                แก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Edit Modal ---------- */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-sky-800">
                แก้ไขผู้ใช้งาน
              </h3>
              <button
                className="rounded-full p-1 hover:bg-gray-100"
                onClick={closeEdit}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    ชื่อ
                  </label>
                  <input
                    id="first_name"
                    className={inputBase}
                    value={editing.first_name}
                    onChange={onEditChange}
                  />
                  {editErrors.first_name && (
                    <p className="mt-1 text-xs text-red-500">
                      {editErrors.first_name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    นามสกุล
                  </label>
                  <input
                    id="last_name"
                    className={inputBase}
                    value={editing.last_name}
                    onChange={onEditChange}
                  />
                  {editErrors.last_name && (
                    <p className="mt-1 text-xs text-red-500">
                      {editErrors.last_name}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  อีเมล
                </label>
                <input
                  id="email"
                  type="email"
                  className={inputBase}
                  value={editing.email}
                  onChange={onEditChange}
                />
                {editErrors.email && (
                  <p className="mt-1 text-xs text-red-500">{editErrors.email}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    บทบาท
                  </label>
                  <select
                    id="role"
                    className={inputBase}
                    value={editing.role}
                    onChange={onEditChange}
                  >
                    <option value="User">Member</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    วันเกิด
                  </label>
                  <input
                    id="brith_date"
                    type="date"
                    className={inputBase}
                    value={editing.brith_date || ""}
                    onChange={onEditChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    ตำแหน่ง
                  </label>
                  <input
                    id="position"
                    className={inputBase}
                    value={editing.position}
                    onChange={onEditChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    จังหวัด
                  </label>
                  <select
                    id="province"
                    className={inputBase}
                    value={editing.province}
                    onChange={onEditChange}
                  >
                    <option value="">- เลือกจังหวัด -</option>
                    {!provLoading &&
                      !provErr &&
                      Object.entries(provinceGroups)
                        .sort(([a], [b]) => a.localeCompare(b, "th-TH"))
                        .map(([region, items]) => (
                          <optgroup key={region} label={makeRegionLabel(region)}>
                            {items.map((p) => (
                              <option
                                key={p.ProvinceNo}
                                value={p.ProvinceNameThai}
                              >
                                {p.ProvinceNameThai}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                  </select>
                  {provErr && <p className="mt-1 text-xs text-red-500">{provErr}</p>}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                onClick={closeEdit}
                disabled={saving}
              >
                ยกเลิก
              </button>
              {/* ✅ ชมพู -> ฟ้า */}
              <button
                className={primaryBtnSoft}
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Create Modal ---------- */}
      {creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-sky-800">
                เพิ่มผู้ใช้ใหม่
              </h3>
              <button
                className="rounded-full p-1 hover:bg-gray-100"
                onClick={closeCreate}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    ชื่อ
                  </label>
                  <input
                    id="first_name"
                    className={inputBase}
                    value={creating.first_name}
                    onChange={onCreateChange}
                  />
                  {createErrors.first_name && (
                    <p className="mt-1 text-xs text-red-500">
                      {createErrors.first_name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    นามสกุล
                  </label>
                  <input
                    id="last_name"
                    className={inputBase}
                    value={creating.last_name}
                    onChange={onCreateChange}
                  />
                  {createErrors.last_name && (
                    <p className="mt-1 text-xs text-red-500">
                      {createErrors.last_name}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  อีเมล
                </label>
                <input
                  id="email"
                  type="email"
                  className={inputBase}
                  value={creating.email}
                  onChange={onCreateChange}
                />
                {createErrors.email && (
                  <p className="mt-1 text-xs text-red-500">{createErrors.email}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    รหัสผ่าน
                  </label>
                  <input
                    id="password"
                    type="password"
                    className={inputBase}
                    value={creating.password}
                    onChange={onCreateChange}
                  />
                  {createErrors.password && (
                    <p className="mt-1 text-xs text-red-500">
                      {createErrors.password}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    ยืนยันรหัสผ่าน
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className={inputBase}
                    value={creating.confirmPassword}
                    onChange={onCreateChange}
                  />
                  {createErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-500">
                      {createErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    บทบาท
                  </label>
                  <select
                    id="role"
                    className={inputBase}
                    value={creating.role}
                    onChange={onCreateChange}
                  >
                    <option value="User">Member</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    วันเกิด
                  </label>
                  <input
                    id="brith_date"
                    type="date"
                    className={inputBase}
                    value={creating.brith_date || ""}
                    onChange={onCreateChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    ตำแหน่ง
                  </label>
                  <input
                    id="position"
                    className={inputBase}
                    value={creating.position}
                    onChange={onCreateChange}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    จังหวัด
                  </label>
                  <select
                    id="province"
                    className={inputBase}
                    value={creating.province}
                    onChange={onCreateChange}
                  >
                    <option value="">- เลือกจังหวัด -</option>
                    {!provLoading &&
                      !provErr &&
                      Object.entries(provinceGroups)
                        .sort(([a], [b]) => a.localeCompare(b, "th-TH"))
                        .map(([region, items]) => (
                          <optgroup key={region} label={makeRegionLabel(region)}>
                            {items.map((p) => (
                              <option
                                key={p.ProvinceNo}
                                value={p.ProvinceNameThai}
                              >
                                {p.ProvinceNameThai}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                  </select>
                  {provErr && <p className="mt-1 text-xs text-red-500">{provErr}</p>}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
                onClick={closeCreate}
                disabled={creatingBusy}
              >
                ยกเลิก
              </button>
              {/* ✅ ชมพู -> ฟ้า */}
              <button
                className={primaryBtnSoft}
                onClick={saveCreate}
                disabled={creatingBusy}
              >
                {creatingBusy ? "กำลังบันทึก..." : "สร้างผู้ใช้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
