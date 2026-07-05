"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";

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

const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const BloggerCardView = ({
  blogger,
  index = 0,
}: {
  blogger: BloggerCardType;
  index?: number;
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (blogger.name || "•").trim().charAt(0).toUpperCase();

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.3), ease: [0.2, 0.6, 0.2, 1] }}
    >
      <Link href={`/bloggers/${blogger.user_id}`} className={styles.card} style={{ display: "flex" }}>
        <div className={styles.media}>
          {blogger.photo_url && !imgFailed ? (
            <img
              src={blogger.photo_url}
              alt={blogger.name}
              className={styles.mediaImg}
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className={styles.mediaFallback}>{initial}</span>
          )}
          <span className={styles.categoryTag}>{categoryLabel(blogger.category)}</span>
        </div>
        <div className={styles.body}>
          <h3 className={styles.name}>{blogger.name}</h3>
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>
              <UsersIcon />
              {formatAudience(blogger.subscriber_count)} подписчиков
            </span>
          </div>
          <div className={styles.footer}>
            <span>
              <span className={styles.priceLabel}>Интеграция от</span>
              <span className={styles.priceValue}>{formatMoney(blogger.average_price_kopeks)}</span>
            </span>
            <span className={styles.orderBtn}>Заказать</span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
};

export const BloggerCardSkeleton = () => (
  <div className={styles.card} aria-hidden="true">
    <div className={`${styles.skelMedia} ${ui.skeleton}`} />
    <div className={styles.body}>
      <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: "70%", height: 20 }} />
      <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: "50%" }} />
      <div className={styles.footer}>
        <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: 90, height: 22 }} />
        <div className={`${styles.skelLine} ${ui.skeleton}`} style={{ width: 92, height: 38, borderRadius: 999 }} />
      </div>
    </div>
  </div>
);
