import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 dev-server blocks cross-origin requests to its internal dev
  // resources (HMR socket, /_next/static) by default. We open both
  // `127.0.0.1` and `localhost` because the project routinely uses both:
  // backend `.env` keeps Telegram OIDC redirect on 127.0.0.1, while
  // browsers often resolve dev URLs as `localhost`.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
