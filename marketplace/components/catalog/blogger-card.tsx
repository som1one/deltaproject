"use client";

import Link from "next/link";

import { Portrait } from "@/components/ui/bits";
import { formatAudience, formatMoney } from "@/lib/format";
import { recordNo } from "@/lib/registry";
import type { BloggerCard as BloggerCardType } from "@/lib/types";
import { DEFAULT_MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

import ui from "@/components/ui/ui.module.css";
import styles from "./blogger-card.module.css";

export const categoryLabel = (value: string | null | undefined): string => {
  if (!value) return "Другое";
  const found = DEFAULT_MARKETPLACE_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? value;
};

export const BloggerCardView = ({
  blogger,
  index = 0,
}: {
  blogger: BloggerCardType;
  index?: number;
}) => (
  <Link href={`/bloggers/${blogger.user_id}`} className={styles.card}>
    <div className={styles.media}>
      <span className={styles.recordTag}>{recordNo(index)}</span>
      <Portrait name={blogger.name} photoUrl={blogger.photo_url} record={recordNo(index)} monoSize={46} />
      <span className={styles.categoryTag}>{categoryLabel(blogger.category)}</span>
    </div>
    <div className={styles.body}>
      <h3 className={styles.name}>{blogger.name}</h3>
      <div className={styles.meta}>{formatAudience(blogger.subscriber_count)} · охват</div>
      <div className={styles.footer}>
        <span>
          <span className={styles.priceLabel}>Интеграция от</span>
          <span className={styles.priceValue}>{formatMoney(blogger.average_price_kopeks)}</span>
        </span>
        <span className={styles.open}>Открыть →</span>
      </div>
    </div>
  </Link>
);

export const BloggerCardSkeleton = () => (
  <div className={styles.card} aria-hidden="true">
    <div className={`${styles.skelMedia} ${ui.skeleton}`} />
    <div className={styles.body}>
      <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: "70%", height: 22 }} />
      <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: "45%" }} />
      <div className={styles.footer}>
        <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: 100, height: 18, marginTop: 0 }} />
        <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: 70, height: 18, marginTop: 0 }} />
      </div>
    </div>
  </div>
);
