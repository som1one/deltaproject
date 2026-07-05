"use client";

import Link from "next/link";

import { Portrait } from "@/components/ui/bits";
import { formatAudience, formatMoney } from "@/lib/format";
import type { BloggerCard as BloggerCardType } from "@/lib/types";
import { DEFAULT_MARKETPLACE_CATEGORIES } from "@/lib/marketplace-categories";

import ui from "@/components/ui/ui.module.css";
import styles from "./blogger-card.module.css";

export const categoryLabel = (value: string | null | undefined): string => {
  if (!value) return "Другое";
  const found = DEFAULT_MARKETPLACE_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? value;
};

const VerifiedIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1l2.4 2.1 3.2-.2.9 3 2.6 1.8-1.1 3 1.1 3-2.6 1.8-.9 3-3.2-.2L12 23l-2.4-2.1-3.2.2-.9-3L2.9 15 4 12 2.9 9l2.6-1.8.9-3 3.2.2z" />
    <path d="M10.5 14.6l-2-2L7 14l3.5 3.5L17 11l-1.5-1.5z" fill="#fff" />
  </svg>
);

export const BloggerCardView = ({ blogger }: { blogger: BloggerCardType; index?: number }) => (
  <Link href={`/bloggers/${blogger.user_id}`} className={styles.card}>
    <div className={styles.top}>
      <Portrait name={blogger.name} photoUrl={blogger.photo_url} className={styles.avatar} monoSize={22} />
      <div className={styles.head}>
        <div className={styles.name}>
          <span className={styles.nameText}>{blogger.name}</span>
          <span className={styles.verified}>
            <VerifiedIcon />
          </span>
        </div>
        <span className={styles.nichePill}>{categoryLabel(blogger.category)}</span>
      </div>
    </div>

    <div className={styles.stats}>
      <div className={styles.statBox}>
        <div className={styles.statVal}>{formatAudience(blogger.subscriber_count)}</div>
        <div className={styles.statKey}>охват</div>
      </div>
      <div className={styles.statBox}>
        <div className={styles.statVal}>{formatMoney(blogger.average_price_kopeks)}</div>
        <div className={styles.statKey}>цена</div>
      </div>
    </div>

    <div className={styles.foot}>
      <span className={styles.price}>
        {formatMoney(blogger.average_price_kopeks)}
        <span>интеграция от</span>
      </span>
      <span className={styles.cta}>Открыть</span>
    </div>
  </Link>
);

export const BloggerCardSkeleton = () => (
  <div className={styles.card} aria-hidden="true">
    <div className={styles.skelTop}>
      <div className={`${styles.skelAvatar} ${ui.skeleton}`} />
      <div style={{ flex: 1 }}>
        <div className={ui.skeleton} style={{ height: 18, width: "70%" }} />
        <div className={ui.skeleton} style={{ height: 14, width: 80, marginTop: 8 }} />
      </div>
    </div>
    <div className={styles.stats}>
      <div className={`${styles.statBox} ${ui.skeleton}`} style={{ height: 58, border: "none" }} />
      <div className={`${styles.statBox} ${ui.skeleton}`} style={{ height: 58, border: "none" }} />
    </div>
    <div className={styles.foot}>
      <div className={ui.skeleton} style={{ height: 20, width: 100 }} />
      <div className={ui.skeleton} style={{ height: 36, width: 90, borderRadius: 999 }} />
    </div>
  </div>
);
