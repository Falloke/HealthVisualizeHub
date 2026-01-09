// app/components/common/ScrollToTopButton.tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // แสดงปุ่มเมื่อเลื่อนลงมาเกิน 300px
      setShow(window.scrollY > 300);
    };

    onScroll(); // set ค่าเริ่มต้น
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={goTop}
      aria-label="กลับขึ้นด้านบน"
      className={`
        fixed bottom-5 right-5 z-[60]
        h-12 w-12 rounded-full
        bg-sky-500 text-white shadow-lg
        transition-all duration-200
        hover:bg-sky-600 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-sky-300
        ${show ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"}
      `}
    >
      <ArrowUp className="mx-auto h-5 w-5" />
    </button>
  );
}
