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
      const res = await fetch("/api/profile", { method: "DELETE" }); // ✅ ใช้ DELETE

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
      <div className="flex h-screen items-center justify-center">
        กำลังโหลดโปรไฟล์...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pink-100">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-xl bg-white">
        {/* Left Side */}
        <div className="flex w-1/2 items-center justify-center bg-pink-100">
          <Image
            src="/images/editprofile.png"
            alt="Profile"
            width={400}
            height={400}
          />
        </div>

        {/* Right Side */}
        <div className="w-1/2 p-10">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-pink-600">โปรไฟล์ของฉัน</h2>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 rounded-md bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
            >
              <Icons name="Delete" size={16} colorClass="bg-white" />{" "}
              {/* ✅ ไอคอน */}
              ลบบัญชี
            </button>
          </div>

          {!viewData ? (
            <p className="mt-6 text-center text-gray-500">ไม่พบข้อมูลโปรไฟล์</p>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-4 text-gray-700">
                <div>
                  <p className="text-sm text-gray-500">ชื่อ</p>
                  <p className="font-medium">{viewData.firstName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">นามสกุล</p>
                  <p className="font-medium">{viewData.lastName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">จังหวัด</p>
                  <p className="font-medium">{viewData.province}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">วันเกิด</p>
                  <p className="font-medium">{viewData.dob}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">ตำแหน่ง</p>
                  <p className="font-medium">{viewData.position}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">อีเมล</p>
                  <p className="font-medium">{viewData.email}</p>
                </div>
              </div>

              {/* ปุ่มไปหน้า Edit */}
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => router.push("/editprofile")}
                  className="rounded-xl bg-pink-500 px-6 py-2 text-white hover:bg-pink-600"
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
