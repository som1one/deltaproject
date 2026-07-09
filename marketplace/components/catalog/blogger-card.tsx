"use client";

import Link from "next/link";

import { Portrait } from "@/components/ui/bits";
import { formatAudience, formatMoney } from "@/lib/format";
import type { BloggerCard as BloggerCardType } from "@/lib/types";
import { DEFAULT_MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

import ui from "@/components/ui/ui.module.css";
import styles from "./blogger-card.module.css";

/** Расширение карточки: поля, которые может прислать бэкенд. Все опциональны. */
export type BloggerCardVM = BloggerCardType & {
  er?: number | null;
  rating?: number | null;
  reviews_count?: number | null;
  platforms?: string[] | null;
};

export const categoryLabel = (value: string | null | undefined): string => {
  if (!value) return "Другое";
  const found = DEFAULT_MARKETPLACE_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? value;
};

const ReachIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/* Монохромные глифы площадок */
const PLATFORMS: Record<string, string> = {
  yt: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z",
  tg: "M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z",
  ig: "M12 2c2.72 0 3.06.01 4.12.06 1.07.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.89 1.11 1.15 1.77.25.64.42 1.36.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.07-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77c-.55.55-1.11.89-1.77 1.15-.64.25-1.36.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.07-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.36-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.07.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77.55-.55 1.11-.89 1.77-1.15.64-.25 1.36-.42 2.43-.47C8.94 2.01 9.28 2 12 2zm0 3.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm0 2.02a4.18 4.18 0 1 1 0 8.36 4.18 4.18 0 0 1 0-8.36zM18.4 4.55a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9z",
  tt: "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.4a5.7 5.7 0 0 0-.78-.05 5.69 5.69 0 1 0 5.69 5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.25-1.48z",
};

const PlatformChip = ({ type }: { type: string }) => {
  const path = PLATFORMS[type];
  if (!path) return null;
  return (
    <span className={styles.plat} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d={path} />
      </svg>
    </span>
  );
};

export const BloggerCardView = ({ blogger }: { blogger: BloggerCardVM; index?: number }) => {
  const platforms = (blogger.platforms ?? []).filter((p) => PLATFORMS[p]).slice(0, 4);

  return (
    <Link href={`/bloggers/${blogger.user_id}`} className={styles.card}>
      <div className={styles.media}>
        <Portrait name={blogger.name} photoUrl={blogger.photo_url} className={styles.portrait} monoSize={104} />
        <span className={styles.scrim} aria-hidden="true" />

        <span className={`${styles.chip} ${styles.chipReach}`}>
          <ReachIcon />
          {formatAudience(blogger.subscriber_count)}
        </span>
        {blogger.rating != null && (
          <span className={`${styles.chip} ${styles.chipRating}`}>
            <span className={styles.star}>★</span>
            {blogger.rating.toFixed(1)}
          </span>
        )}

        <div className={styles.caption}>
          <span className={styles.nichePill}>{categoryLabel(blogger.category)}</span>
          <div className={styles.capBottom}>
            <span className={styles.name}>{blogger.name}</span>
            {platforms.length > 0 && (
              <div className={styles.platforms}>
                {platforms.map((p) => (
                  <PlatformChip key={p} type={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.foot}>
        <span className={styles.price}>от {formatMoney(blogger.average_price_kopeks)}</span>
        <span className={styles.cta}>
          <span className={styles.ctaText}>Открыть</span>
          <span className={styles.ctaArrow}>→</span>
        </span>
      </div>
    </Link>
  );
};

export const BloggerCardSkeleton = () => (
  <div className={styles.card} aria-hidden="true">
    <div className={`${styles.media} ${ui.skeleton}`} />
    <div className={styles.skelFoot}>
      <div className={ui.skeleton} style={{ height: 20, width: 110 }} />
      <div className={ui.skeleton} style={{ height: 30, width: 64 }} />
    </div>
  </div>
);
