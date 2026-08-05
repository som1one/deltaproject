import type { MetadataRoute } from "next";

import { SITE_URL, serverApiBaseUrl } from "@/lib/config";

type CatalogItem = { user_id: string };
type CatalogPayload = { items?: CatalogItem[] };

export const revalidate = 3600;

/** Витрина + публичные документы; карточки авторов — из каталога, если API отвечает. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/offer`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const base = serverApiBaseUrl();
  if (!base) return staticPages;

  try {
    // page_size ограничен бэкендом (le=50) — берём максимум.
    const response = await fetch(`${base}/marketplace/bloggers?page_size=50`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return staticPages;
    const data = (await response.json()) as CatalogPayload;
    const authorPages: MetadataRoute.Sitemap = (data.items ?? []).map((item) => ({
      url: `${SITE_URL}/bloggers/${item.user_id}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
    return [...staticPages, ...authorPages];
  } catch {
    return staticPages;
  }
}
