"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/app/icons"; // ✅ import icons

type ViewProfileData = {
  firstName: string;
  lastName: string;
  province: string;
  dob: string;
  position: string;
  email: string;
};

const ViewProfile = () => {
  const [viewData, setViewData] = useState<ViewProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (res.status === 401) {
          router.push("/(access)/login");
          return;
        }

        if (res.ok) {
          const data: ViewProfileData = await res.json();
          setViewData(data);
        } else {
          console.error("โหลดโปรไฟล์ล้มเหลว", await res.json());
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [router]);

  const handleDelete = async () => {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการปิดการใช้งานบัญชีนี้?")) return;

    try {
      const res = await fetch("/api/profile", { method: "DELETE" });

      if (res.ok) {
        alert("บัญชีถูกปิดการใช้งานเรียบร้อยแล้ว");
        window.location.href = "/";
      } else {
        alert("เกิดข้อผิดพลาดในการปิดการใช้งาน");
      }
    } catch (error) {
      console.error("Soft delete error:", error);
      alert("ไม่สามารถปิดการใช้งานบัญชีได้");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-sky-100 to-white">
        กำลังโหลดโปรไฟล์...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-sky-100 to-white px-4 py-10">
      {/* Card (คล้ายหน้า Login) */}
      <div className="flex w-full max-w-6xl overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-xl">
        {/* Left Side (โทนฟ้าแบบหน้า login) */}
        <div className="relative hidden w-1/2 items-center justify-center bg-sky-500 md:flex">
          {/* เงา/ไล่สีให้นุ่มขึ้น */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-black/10" />
          <div className="relative flex items-center justify-center p-8">
            <Image
              src="/images/editprofile.png"
              alt="Profile"
              width={420}
              height={420}
              className="h-auto w-auto drop-shadow-sm"
              priority
            />
          </div>
        </div>

        {/* Right Side */}
        <div className="w-full p-6 md:w-1/2 md:p-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold text-sky-700">โปรไฟล์ของฉัน</h2>
            </div>

            <button
              onClick={handleDelete}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              <Icons name="Delete" size={16} colorClass="bg-white" />
              ลบบัญชี
            </button>
          </div>

          {!viewData ? (
            <p className="mt-8 text-center text-gray-500">ไม่พบข้อมูลโปรไฟล์</p>
          ) : (
            <>
              <div className="mt-8 grid grid-cols-1 gap-4 text-slate-700 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">ชื่อ</p>
                  <p className="mt-1 font-medium">{viewData.firstName}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">นามสกุล</p>
                  <p className="mt-1 font-medium">{viewData.lastName}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">จังหวัด</p>
                  <p className="mt-1 font-medium">{viewData.province}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">วันเกิด</p>
                  <p className="mt-1 font-medium">{viewData.dob}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                  <p className="text-sm text-slate-500">ตำแหน่ง</p>
                  <p className="mt-1 font-medium">{viewData.position}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                  <p className="text-sm text-slate-500">อีเมล</p>
                  <p className="mt-1 font-medium break-all">{viewData.email}</p>
                </div>
              </div>

              {/* ปุ่มไปหน้า Edit */}
              <div className="mt-10 flex justify-center">
                <button
                  onClick={() => router.push("/editprofile")}
                  className="rounded-xl bg-sky-600 px-7 py-2.5 font-medium text-white shadow-sm hover:bg-sky-700"
                >
                  แก้ไขโปรไฟล์
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewProfile;
