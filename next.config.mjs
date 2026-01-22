// next.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  experimental: {
    // ✅ บังคับให้ Next trace ไฟล์แค่ในโฟลเดอร์โปรเจกต์นี้
    // กันไม่ให้มันไหลไป scandir โฟลเดอร์ C:\Users\Win11\Application Data
    outputFileTracingRoot: __dirname,
  },

  // (ของเดิมคุณเก็บไว้ได้)
  // webpack: (config) => {
  //   config.module.rules.push({
  //     test: /\.svg$/i,
  //     issuer: /\.[jt]sx?$/,
  //     use: ["@svgr/webpack"],
  //   });
  //   return config;
  // },
};

export default nextConfig;
