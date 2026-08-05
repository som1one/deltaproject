import type { Metadata } from "next";
import type { ReactNode } from "react";

import { serverApiBaseUrl } from "@/lib/config";
import { formatAudience, formatMoney } from "@/lib/format";
import { DEFAULT_MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

/**
 * Серверный layout вокруг клиентской страницы автора — только ради metadata:
 * заголовок и OG-карточка с именем, нишей, ценой «от» и портретом.
 */

type BloggerMetaProfile = {
  name: string;
  category: string | null;
  subscriber_count: number;
  average_price_kopeks: number;
  photo_url: string | null;
};

// Локальная копия categoryLabel: клиентский blogger-card.tsx сюда не импортируем.
const categoryLabel = (value: string | null): string => {
  if (!value) return "Другое";
  return DEFAULT_MARKETPLACE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
};

const FALLBACK: Metadata = { title: "Автор" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const base = serverApiBaseUrl();
  if (!base) return FALLBACK;

  try {
    const response = await fetch(`${base}/marketplace/bloggers/${id}`, {
      next: { revalidate: 600 },
    });
    if (!response.ok) return FALLBACK;
    const blogger = (await response.json()) as BloggerMetaProfile;

    const title = `${blogger.name} — ${categoryLabel(blogger.category)}, реклама у автора`;
    const description = `Интеграция у автора ${blogger.name}: от ${formatMoney(
      blogger.average_price_kopeks,
    )}, аудитория ${formatAudience(blogger.subscriber_count)} подписчиков. Эскроу-сделка через Looney Moon Market.`;

    // Портрет из /uploads/ отдаёт бэкенд — дополняем до абсолютного URL.
    const photo = blogger.photo_url
      ? blogger.photo_url.startsWith("/uploads/")
        ? `${base}${blogger.photo_url}`
        : blogger.photo_url
      : null;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        ...(photo ? { images: [{ url: photo }] } : {}),
      },
    };
  } catch {
    return FALLBACK;
  }
}

export default function BloggerProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
