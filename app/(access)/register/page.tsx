"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/app/components/ui/button";
import { InputWithLabel } from "@/app/components/ui/input";
import ConfirmDialog from "@/app/components/ui/dialog";
import { registerSchema, RegisterForm } from "@/schemas/registerSchema";

type ProvinceItem = {
  ProvinceNo: number;
  ProvinceNameThai: string;
  Region_VaccineRollout_MOPH?: string | null;
};

// ---------- helper แบ่งจังหวัดเป็นภูมิภาค + label เส้นยาว ----------

function groupProvinces(list: ProvinceItem[]): Record<string, ProvinceItem[]> {
  return list.reduce<Record<string, ProvinceItem[]>>((acc, p) => {
    const region = p.Region_VaccineRollout_MOPH || "อื่น ๆ";
    if (!acc[region]) acc[region] = [];
    acc[region].push(p);
    return acc;
  }, {});
}

// ใช้ความยาวเส้นอ้างอิงจาก "กรุงเทพมหานครและปริมณฑล"
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

// ----------------------------------------------------------

export default function RegisterPage() {
  const router = useRouter();

  // ---------- โหลดรายชื่อจังหวัดจากไฟล์ใน public ----------
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
        if (!data.length) throw new Error("empty list");
        setProvinces(data);
      } catch (e) {
        console.error(e);
        setProvErr("โหลดรายชื่อจังหวัดไม่สำเร็จ");
      } finally {
        setProvLoading(false);
      }
    })();
  }, []);
  // ----------------------------------------------------------

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      province: "",
      dob: "",
      position: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState<RegisterForm | null>(null);
  const [loading, setLoading] = useState(false);

  const watchedProvince = useWatch({ control, name: "province" });
  const watchedDob = useWatch({ control, name: "dob" });

  const onSubmitPreview = (data: RegisterForm) => {
    setPendingData(data);
    setConfirmOpen(true);
  };

  const doRegister = async () => {
    if (!pendingData) return;
    try {
      setLoading(true);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingData),
      });

      if (res.status === 201) {
        const body = await res.json();
        const login = await signIn("credentials", {
          redirect: false,
          email: body.email,
          password: pendingData.password,
        });
        if (!login?.error) router.push("/");
        else console.error("Login failed:", login.error);
      } else {
        console.error("Register failed:", await res.json().catch(() => ({})));
      }
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const provinceGroups = groupProvinces(provinces);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pink-100">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-xl bg-white">
        <div className="flex w-1/2 items-center justify-center bg-pink-100">
          <Image src="/images/register.png" alt="Register" width={400} height={400} />
        </div>

        <div className="w-1/2 p-10">
          <h2 className="mb-8 text-center text-3xl font-bold text-pink-600">
            สมัครสมาชิก
          </h2>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmitPreview)}>
            {/* ชื่อ + นามสกุล */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InputWithLabel
                id="firstName"
                label="ชื่อ*"
                placeholder="กรุณากรอกชื่อ"
                error={errors.firstName?.message}
                {...register("firstName")}
              />
              <InputWithLabel
                id="lastName"
                label="นามสกุล*"
                placeholder="กรุณากรอกนามสกุล"
                error={errors.lastName?.message}
                {...register("lastName")}
              />

              {/* จังหวัด + วันเกิด (อยู่แถวเดียวกัน) */}
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
                {errors.province && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.province.message}
                  </p>
                )}
              </div>

              <InputWithLabel
                id="dob"
                label="วันเดือนปีเกิด*"
                type="date"
                error={errors.dob?.message}
                {...register("dob")}
              />
            </div>

            {/* ตำแหน่ง */}
            <InputWithLabel
              id="position"
              label="ตำแหน่ง*"
              placeholder="กรุณากรอกตำแหน่ง"
              containerClassName="col-span-2"
              error={errors.position?.message}
              {...register("position")}
            />

            {/* Email / Password */}
            <InputWithLabel
              id="email"
              label="Email*"
              placeholder="Email"
              type="email"
              error={errors.email?.message}
              {...register("email")}
            />
            <InputWithLabel
              id="password"
              label="Password*"
              placeholder="Password"
              type="password"
              error={errors.password?.message}
              {...register("password")}
            />
            <InputWithLabel
              id="confirmPassword"
              label="ยืนยัน Password*"
              placeholder="ยืนยัน Password"
              type="password"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />

            <div className="pt-4 text-center">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-60"
              >
                {loading ? "กำลังดำเนินการ..." : "ลงทะเบียน"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Dialog แสดงข้อมูลก่อนยืนยัน */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="ยืนยันการลงทะเบียน?"
        description="โปรดตรวจสอบข้อมูลของคุณก่อนกดยืนยัน"
        onConfirm={doRegister}
        disabled={loading}
      >
        {pendingData && (
          <div className="rounded-lg border p-4 text-sm">
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
                {watchedProvince || pendingData.province}
              </p>
              <p>
                <span className="font-medium">วันเกิด:</span>{" "}
                {watchedDob || pendingData.dob}
              </p>
              <p className="col-span-2">
                <span className="font-medium">ตำแหน่ง:</span>{" "}
                {pendingData.position}
              </p>
              <p className="col-span-2">
                <span className="font-medium">อีเมล:</span>{" "}
                {pendingData.email}
              </p>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
