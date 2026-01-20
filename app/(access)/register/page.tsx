"use client";

import { useEffect, useMemo, useState } from "react";
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

  const provinceGroups = useMemo(() => groupProvinces(provinces), [provinces]);

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

  return (
    <>
      {/* Background */}
      <div className="relative flex min-h-[calc(100vh-4rem-4rem)] items-center justify-center px-4 py-10">
        {/* gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-blue-50 to-white" />

        {/* Card */}
        <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-[0_12px_40px_rgba(2,132,199,0.15)]">
          <div className="p-6 md:p-10">
            <div className="mb-6 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-sky-700">
                สมัครสมาชิก
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                กรอกข้อมูลให้ครบถ้วนเพื่อสร้างบัญชีผู้ใช้
              </p>
            </div>

            <form
              className="space-y-5"
              onSubmit={handleSubmit(onSubmitPreview)}
            >
              {/* ชื่อ + นามสกุล + จังหวัด + วันเกิด */}
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

                {/* จังหวัด */}
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    จังหวัด*
                  </label>
                  <select
                    className={[
                      "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm",
                      "outline-none transition",
                      "focus:border-sky-400 focus:ring-2 focus:ring-sky-100",
                      "disabled:bg-gray-100",
                      errors.province ? "border-red-300" : "border-gray-200",
                    ].join(" ")}
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
                placeholder="เช่น นักศึกษา / เจ้าหน้าที่ / นักวิจัย"
                error={errors.position?.message}
                {...register("position")}
              />

              {/* Email */}
              <InputWithLabel
                id="email"
                label="Email*"
                placeholder="example@email.com"
                type="email"
                error={errors.email?.message}
                {...register("email")}
              />

              {/* Password */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InputWithLabel
                  id="password"
                  label="Password*"
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  type="password"
                  error={errors.password?.message}
                  {...register("password")}
                />
                <InputWithLabel
                  id="confirmPassword"
                  label="ยืนยัน Password*"
                  placeholder="กรอกซ้ำอีกครั้ง"
                  type="password"
                  error={errors.confirmPassword?.message}
                  {...register("confirmPassword")}
                />
              </div>

              {/* Submit */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className={[
                    "w-full rounded-xl bg-sky-500 text-white",
                    "hover:bg-sky-600 active:scale-[0.99]",
                    "transition disabled:opacity-60",
                  ].join(" ")}
                >
                  {loading ? "กำลังดำเนินการ..." : "ลงทะเบียน"}
                </Button>

                <p className="mt-3 text-center text-xs text-gray-400">
                  เมื่อกดลงทะเบียน หมายถึงคุณยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว
                </p>
              </div>
            </form>
          </div>
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
          <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <p>
                <span className="font-medium text-gray-700">ชื่อ:</span>{" "}
                {pendingData.firstName}
              </p>
              <p>
                <span className="font-medium text-gray-700">นามสกุล:</span>{" "}
                {pendingData.lastName}
              </p>
              <p>
                <span className="font-medium text-gray-700">จังหวัด:</span>{" "}
                {watchedProvince || pendingData.province}
              </p>
              <p>
                <span className="font-medium text-gray-700">วันเกิด:</span>{" "}
                {watchedDob || pendingData.dob}
              </p>
              <p className="md:col-span-2">
                <span className="font-medium text-gray-700">ตำแหน่ง:</span>{" "}
                {pendingData.position}
              </p>
              <p className="md:col-span-2">
                <span className="font-medium text-gray-700">อีเมล:</span>{" "}
                {pendingData.email}
              </p>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
