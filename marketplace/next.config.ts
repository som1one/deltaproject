import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 dev-server blocks cross-origin requests to its internal dev
  // resources (HMR socket, /_next/static) by default. We open `127.0.0.1`,
  // `localhost`, and `marketplace.localhost` so that the marketplace app
  // works correctly both directly and via subdomain proxy in development.
  allowedDevOrigins: ["127.0.0.1", "localhost", "marketplace.localhost"],
  // Плавающая кнопка Next.js Dev Tools в углу мешает — скрываем
  devIndicators: false,
  // Позволяет поднять второй dev-server из этой же папки (Next 16 держит
  // лок в distDir): NEXT_DIST_DIR=.next-preview next dev
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
