// app/(access)/login/page.tsx
"use client";

import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl: "/",
    });

    setLoading(false);

    if (!res || res.error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    router.replace(res.url ?? "/");
  };

  return (
    <div className="flex w-full items-center justify-center bg-white px-4 py-12">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-2xl bg-white
                    shadow-[0_18px_60px_rgba(7,162,255,0.22)]
                    ring-1 ring-[#07A2FF]/10">
        {/* ฝั่งซ้ายรูปภาพ (พื้นหลังฟ้า) */}
        <div className="hidden w-1/2 items-center justify-center bg-[#07A2FF] p-10 md:flex">
          <Image
            src="/images/login.png"
            alt="Login illustration"
            width={420}
            height={420}
            className="h-auto w-full max-w-[420px]"
            priority
          />
        </div>

        {/* ฝั่งขวา form */}
        <div className="w-full p-8 md:w-1/2 md:p-10">
          <h2 className="mb-2 text-center text-3xl font-bold text-[#0077CC]">
            เข้าสู่ระบบ
          </h2>
          <p className="mb-8 text-center text-sm text-gray-600">
            กรุณากรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งานระบบ HealthRiskHub
          </p>

          <form className="space-y-5" onSubmit={onLogin}>
            <input
              className="flex h-11 w-full rounded-full border border-[#CFE8FF] bg-[#F2F7FF] px-4 text-sm placeholder:text-neutral-400 focus:border-[#07A2FF] focus:outline-none focus:ring-2 focus:ring-[#07A2FF]/40"
              type="email"
              placeholder="กรอกอีเมล"
              name="email"
              required
              autoComplete="email"
            />
            <input
              className="flex h-11 w-full rounded-full border border-[#CFE8FF] bg-[#F2F7FF] px-4 text-sm placeholder:text-neutral-400 focus:border-[#07A2FF] focus:outline-none focus:ring-2 focus:ring-[#07A2FF]/40"
              type="password"
              name="password"
              placeholder="กรอกรหัสผ่าน"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}

            <div className="pt-2">
              <Button
                className="h-11 w-full rounded-full bg-[#07A2FF] text-sm font-semibold text-white hover:bg-[#0088E6]"
                disabled={loading}
              >
                {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-gray-500">
            HealthRiskHub — ระบบวิเคราะห์สถานการณ์โรคระดับจังหวัด
          </p>
        </div>
      </div>
    </div>
  );
}