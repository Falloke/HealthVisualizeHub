// app/components/SessionTracker.tsx  (หรือ path เดิมของคุณ)
"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

const HEARTBEAT_MS = 30_000; // 30 วิ

export default function SessionTracker() {
  const { data: session } = useSession();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) เริ่ม session เมื่อมี next-auth session
  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;

    const start = async () => {
      try {
        const res = await fetch("/api/telemetry/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          console.error("start session failed");
          return;
        }

        const data = await res.json();
        if (!cancelled && typeof data.sessionId === "number") {
          setSessionId(data.sessionId);
        }
      } catch (e) {
        console.error("start session error", e);
      }
    };

    start();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // 2) heartbeat ทุก 30 วิ → อัปเดต lastActivityAt
  useEffect(() => {
    if (!sessionId) return;

    const sendHeartbeat = async () => {
      try {
        const body = JSON.stringify({ sessionId });

        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/telemetry/session/heartbeat",
            new Blob([body], { type: "application/json" })
          );
        } else {
          await fetch("/api/telemetry/session/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch (e) {
        console.error("heartbeat error", e);
      } finally {
        heartbeatTimer.current = setTimeout(sendHeartbeat, HEARTBEAT_MS);
      }
    };

    // เริ่มนับ
    heartbeatTimer.current = setTimeout(sendHeartbeat, HEARTBEAT_MS);

    return () => {
      if (heartbeatTimer.current) clearTimeout(heartbeatTimer.current);
    };
  }, [sessionId]);

  // 3) ปิด session ตอนปิดแท็บ / รีเฟรช / logout
  useEffect(() => {
    if (!sessionId) return;

    const sendEnd = () => {
      try {
        const body = JSON.stringify({ sessionId });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/telemetry/session/end",
            new Blob([body], { type: "application/json" })
          );
        } else {
          fetch("/api/telemetry/session/end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch (e) {
        console.error("end session error", e);
      }
    };

    window.addEventListener("beforeunload", sendEnd);

    return () => {
      window.removeEventListener("beforeunload", sendEnd);
      // component unmount เช่น logout → ปิดให้ด้วย
      sendEnd();
    };
  }, [sessionId]);

  return null;
}
