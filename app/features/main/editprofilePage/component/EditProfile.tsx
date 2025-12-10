// app/features/main/editprofilePage/component/EditProfile.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";

import { InputWithLabel } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import ConfirmDialog from "@/app/components/ui/dialog";

import {
  editProfileSchema,
  type EditProfileForm,
} from "@/schemas/editProfileSchema";

type ProvinceItem = {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
};

// --------- helper แบ่งจังหวัดตามภูมิภาค + ทำ label เส้นยาวให้เท่ากรุงเทพฯ ---------
function groupProvinces(list: ProvinceItem[]): Record<string, ProvinceItem[]> {
  return list.reduce<Record<string, ProvinceItem[]>>((acc, p) => {
    const region = p.Region_VaccineRollout_MOPH || "อื่น ๆ";
    if (!acc[region]) acc[region] = [];
    acc[region].push(p);
    return acc;
  }, {});
}

const BASE_REGION = "กรุงเทพมหานครและปริมณฑล";
// รูปแบบเส้นของกรุงเทพฯ ที่ใช้เป็นมาตรฐานความยาว
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
// -------------------------------------------------------------------

const Editprofile = () => {
  const { update } = useSession();

  // -------- provinces ----------
  const [provinces, setProvinces] = useState<ProvinceItem[]>([]);
  const [provLoading, setProvLoading] = useState(true);
  const [provErr, setProvErr] = useState<string | null>(null);

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
        if (!data.length) throw new Error("empty province list");
        setProvinces(data);
      } catch (e) {
        console.error("โหลดจังหวัดล้มเหลว:", e);
        setProvErr("โหลดรายชื่อจังหวัดไม่สำเร็จ");
      } finally {
        setProvLoading(false);
      }
    })();
  }, []);
  // ------------------------------

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditProfileForm>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      province: "",
      dob: "",
      position: "",
      email: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState<EditProfileForm | null>(null);

  // โหลดโปรไฟล์
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          const text = await res.text();
          console.error("โหลดโปรไฟล์ล้มเหลว:", text || res.statusText);
          return;
        }
        const data: EditProfileForm = await res.json();

        // set default values
        setValue("firstName", data.firstName);
        setValue("lastName", data.lastName);
        setValue("province", data.province);
        setValue("dob", data.dob);
        setValue("position", data.position);
        setValue("email", data.email);
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [setValue]);

  // เปิด dialog ก่อนอัปเดต
  const onSubmitPreview: SubmitHandler<EditProfileForm> = (data) => {
    setPendingData(data);
    setConfirmOpen(true);
  };

  // ยิง PUT อัปเดตโปรไฟล์
  const doUpdate = async () => {
    if (!pendingData) return;
    try {
      setLoading(true);
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingData),
      });

      if (res.ok) {
        const updated = await res.json();
        await update?.({
          user: {
            first_name: updated.profile.first_name,
            last_name: updated.profile.last_name,
            email: updated.profile.email,
          },
        });
        alert("แก้ไขโปรไฟล์สำเร็จ");
      } else {
        const err = await res.json().catch(() => ({}));
        console.error(err);
        alert("แก้ไขไม่สำเร็จ");
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        กำลังโหลด...
      </div>
    );
  }

  // เตรียม group จังหวัดตามภูมิภาค
  const provinceGroups = groupProvinces(provinces);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pink-100">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-xl bg-white">
        {/* Left Side */}
        <div className="flex w-1/2 items-center justify-center bg-pink-100">
          <Image
            src="/images/editprofile.png"
            alt="Edit Profile"
            width={400}
            height={400}
          />
        </div>

        {/* Right Side */}
        <div className="w-1/2 p-10">
          <h2 className="mb-8 text-center text-3xl font-bold text-pink-600">
            แก้ไขโปรไฟล์
          </h2>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmitPreview)}>
            {/* ชื่อ + นามสกุล */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <InputWithLabel
                  id="firstName"
                  label="ชื่อ*"
                  placeholder="กรุณากรอกชื่อ"
                  {...register("firstName")}
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.firstName.message}
                  </p>
                )}
              </div>

              <div>
                <InputWithLabel
                  id="lastName"
                  label="นามสกุล*"
                  placeholder="กรุณากรอกนามสกุล"
                  {...register("lastName")}
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.lastName.message}
                  </p>
                )}
              </div>

              {/* จังหวัด + วันเกิด */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  จังหวัด*
                </label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-100"
                  disabled={provLoading || !!provErr}
                  {...register("province")}
                >
                  <option value="">
                    {provLoading
                      ? "กำลังโหลดจังหวัด..."
                      : provErr ?? "กรุณาเลือกจังหวัด"}
                  </option>
                  {!provLoading &&
                    !provErr &&
                    Object.entries(provinceGroups)
                      .sort(([a], [b]) => a.localeCompare(b, "th-TH"))
                      .map(([region, items]) => (
                        <optgroup
                          key={region}
                          label={makeRegionLabel(region)}
                        >
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
                {errors.province && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.province.message}
                  </p>
                )}
              </div>

              <div>
                <InputWithLabel
                  id="dob"
                  label="วันเดือนปีเกิด*"
                  type="date"
                  {...register("dob")}
                />
                {errors.dob && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.dob.message}
                  </p>
                )}
              </div>
            </div>

            {/* ตำแหน่ง */}
            <div>
              <InputWithLabel
                id="position"
                label="ตำแหน่ง*"
                placeholder="กรุณากรอกตำแหน่ง"
                containerClassName="col-span-2"
                {...register("position")}
              />
              {errors.position && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.position.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <InputWithLabel
                id="email"
                label="Email*"
                type="email"
                placeholder="Email"
                {...register("email")}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* รหัสผ่านใหม่ + ยืนยัน */}
            <div className="space-y-4">
              <div>
                <InputWithLabel
                  id="newPassword"
                  label="รหัสผ่านใหม่ (ถ้าต้องการเปลี่ยน)*"
                  type="password"
                  placeholder="กรอกรหัสผ่านใหม่"
                  {...register("newPassword")}
                />
                {errors.newPassword && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.newPassword.message as string}
                  </p>
                )}
              </div>
              <div>
                <InputWithLabel
                  id="confirmNewPassword"
                  label="ยืนยันรหัสผ่านใหม่*"
                  type="password"
                  placeholder="กรอกยืนยันรหัสผ่านใหม่"
                  {...register("confirmNewPassword")}
                />
                {errors.confirmNewPassword && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.confirmNewPassword.message as string}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-60"
            >
              {isSubmitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </form>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="ยืนยันการแก้ไขโปรไฟล์?"
        description="โปรดตรวจสอบข้อมูลของคุณก่อนบันทึก"
        onConfirm={doUpdate}
        disabled={isSubmitting}
      >
        {pendingData && (
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <p>
                <span className="font-medium">ชื่อ:</span>{" "}
                {pendingData.firstName}
              </p>
              <p>
                <span className="font-medium">นามสกุล:</span>{" "}
                {pendingData.lastName}
              </p>
              <p>
                <span className="font-medium">จังหวัด:</span>{" "}
                {pendingData.province}
              </p>
              <p>
                <span className="font-medium">วันเกิด:</span>{" "}
                {pendingData.dob}
              </p>
              <p className="col-span-2">
                <span className="font-medium">ตำแหน่ง:</span>{" "}
                {pendingData.position}
              </p>
              <p className="col-span-2">
                <span className="font-medium">Email:</span>{" "}
                {pendingData.email}
              </p>
            </div>
            {pendingData.newPassword && (
              <p className="text-red-500">⚠️ จะมีการเปลี่ยนรหัสผ่าน</p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default Editprofile;
