// next.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // ✅ ปิดการ trace ไฟล์ (ตัวต้นเหตุที่ไป scandir Application Data)
  outputFileTracing: false,

  experimental: {
    outputFileTracingRoot: __dirname,
  },
};

export default nextConfig;
