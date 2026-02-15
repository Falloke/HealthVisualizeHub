// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */

  // ถ้าจะใช้ SVG เป็น React component ให้เอา comment ออก แล้วลง @svgr/webpack ก่อน:
  // webpack: (config) => {
  //   config.module.rules.push({
  //     test: /\.svg$/i,
  //     issuer: /\.[jt]sx?$/,
  //     use: ['@svgr/webpack'],
  //   });
  //   return config;
  // },
};

export default nextConfig;
