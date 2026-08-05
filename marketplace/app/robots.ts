import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/config";

/** Индексируем витрину; кабинеты, сделки и чаты поисковикам не нужны. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/auth/",
          "/cabinet",
          "/settings",
          "/orders",
          "/chats",
          "/worker",
          "/blogger",
          "/support",
          "/dev",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
