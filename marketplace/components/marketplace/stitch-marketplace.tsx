"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { MarketingNav } from "@/components/marketing-nav/marketing-nav";
import { NAV_ITEMS } from "@/components/marketing-nav/nav-config";
import { SiteFooter } from "@/components/site-footer/site-footer";

import type { BloggerProfile } from "@/lib/types";

import styles from "./stitch-marketplace.module.css";

export const categoryLabel = (val?: string) => {
  if (!val) return "Все ниши";
  const map: Record<string, string> = {
    lifestyle: "Lifestyle",
    tech: "Tech & IT",
    beauty: "Красота",
    food: "Еда",
    travel: "Путешествия",
    fitness: "Фитнес",
    gaming: "Игры",
    education: "Образование",
    business: "Бизнес",
    entertainment: "Развлечения",
  };
  return map[val] || val;
};

export const genderLabel = (val?: string) => {
  if (val === "female") return "Женский";
  if (val === "male") return "Мужской";
  return "Любой";
};

// Basic re-exports
export { styles as stitchStyles };
export type BloggerCard = BloggerProfile & {
  rating?: number;
  orders_count?: number;
};

// ============================================================
// Shell / Navigation
// ============================================================

export function AdMarketplaceShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBlogger } = useAuth();
  const accountHref = isAuthenticated ? (isBlogger ? "/blogger/cabinet" : "/cabinet") : "/marketplace/auth/login";
  const accountLabel = isAuthenticated ? "Личный кабинет" : "Войти";
  
  return (
    <div className={styles.root}>
      <MarketingNav
        brandSub="агентство · каталог"
        items={NAV_ITEMS}
        cta={{ href: accountHref, label: accountLabel }}
      />
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>looney moon</span>
          <span className={styles.brandSub}>АГЕНТСТВО</span>
        </Link>
        <div className={styles.navLinks}>
          <Link className={styles.navActive} href="/marketplace">
            Каталог
          </Link>
          <Link className={styles.navLink} href="/cases">
            Кейсы
          </Link>
          <Link className={styles.navLink} href="/about">
            О нас
          </Link>
        </div>
        <div className={styles.navLinks}>
          {isAuthenticated ? (
            <Link className={styles.navLink} href={isBlogger ? "/blogger/cabinet" : "/cabinet"}>
              Личный кабинет
            </Link>
          ) : (
            <>
              <Link className={styles.navLink} href="/login">
                Вход
              </Link>
              <Link className={styles.navAction} href="/register">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </nav>
      {children}
      <SiteFooter />
    </div>
  );
}

// ============================================================
// Header
// ============================================================

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  lead?: string;
  display?: boolean;
  stats?: Array<{ label: string; value: string | number }>;
}

export function PageHeader({ eyebrow, title, lead, display, stats }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h1 className={display ? styles.displayTitle : styles.title}>{title}</h1>
      {lead && <p className={styles.lead}>{lead}</p>}
      
      {stats && stats.length > 0 && (
        <div className={styles.heroStats}>
          {stats.map((stat, i) => (
            <div key={i} className={styles.heroStat}>
              <span className={styles.heroStatValue}>{stat.value}</span>
              <span className={styles.heroStatLabel}>{stat.label}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

// ============================================================
// Blogger Cards
// ============================================================

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      delay: index * 0.05,
      ease: [0.2, 0.6, 0.2, 1] as const,
    },
  }),
} as const;

export function BloggerCardView({
  blogger,
  onOrder,
  index = 0,
}: {
  blogger: BloggerCard;
  onOrder?: (blogger: BloggerCard) => void;
  index?: number;
}) {
  const formatMoney = (val?: number) => {
    if (val == null) return "По запросу";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatAudience = (val?: number) => {
    if (val == null) return "—";
    return new Intl.NumberFormat("ru-RU").format(val);
  };

  const imageSrc = blogger.profile_image_url || "/images/placeholder-portrait.jpg";
  const trustScore = blogger.rating ? blogger.rating.toFixed(1) : "9.5"; // Mock score for design

  return (
    <motion.article
      className={styles.bloggerCard}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <div className={styles.portrait}>
        <img src={imageSrc} alt={`Portrait of ${blogger.name}`} loading="lazy" />
        <div className={styles.tags}>
          <span className={styles.tag}>{categoryLabel(blogger.category)}</span>
        </div>
        <button className={styles.saveButton} aria-label="Сохранить">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </button>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{blogger.name}</h2>
            {blogger.telegram_username && (
              <div className={styles.handle}>@{blogger.telegram_username}</div>
            )}
          </div>
          <div className={styles.trustScore}>
            <div className={styles.trustScoreValue}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>{trustScore}</span>
            </div>
            <span className={styles.trustScoreLabel}>Trust Score</span>
          </div>
        </div>

        <p className={styles.description}>
          {blogger.description || "Блогер не добавил описание, но вы можете запросить у него статистику и условия."}
        </p>

        <div className={styles.cardMetrics}>
          <div>
            <div className={styles.propertyLabel}>Аудитория</div>
            <div className={styles.metricValue}>{blogger.audience_size ? formatAudience(blogger.audience_size) : "Не указана"}</div>
          </div>
          <div>
            <div className={styles.propertyLabel}>CPV (~)</div>
            <div className={styles.metricValue}>{formatMoney(blogger.price_per_post)}</div>
          </div>
        </div>

        <button
          className={styles.orderButton}
          onClick={() => onOrder?.(blogger)}
          type="button"
        >
          Предложить проект
        </button>
      </div>
    </motion.article>
  );
}

export function BloggerCardSkeleton() {
  return (
    <div className={styles.bloggerCard}>
      <div className={styles.skeletonPortrait} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div style={{ width: "60%" }}>
            <div style={{ height: 28, background: "var(--surface-raised)", borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 16, background: "var(--surface-raised)", borderRadius: 4, width: "50%" }} />
          </div>
        </div>
        <div style={{ height: 48, background: "var(--surface-raised)", borderRadius: 4, marginBottom: 24 }} />
        <div className={styles.cardMetrics}>
          <div style={{ height: 32, background: "var(--surface-raised)", borderRadius: 4 }} />
          <div style={{ height: 32, background: "var(--surface-raised)", borderRadius: 4 }} />
        </div>
        <div style={{ height: 44, background: "var(--surface-raised)", borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ============================================================
// Order types and components
// ============================================================

export type OrderItem = {
  id: string;
  blogger_id: string;
  client_id: string;
  blogger_name?: string;
  client_name?: string;
  message?: string;
  amount_kopeks?: number;
  status: string;
  created_at: string;
  updated_at?: string;
};

export function statusClass(status: string): string {
  switch (status) {
    case "ESCROW_HELD":
    case "open":
      return styles.statusActive ?? "";
    case "BLOGGER_CONFIRMED":
    case "COMPLETED":
    case "resolved":
      return styles.statusSuccess ?? "";
    case "CANCELLED":
    case "REFUNDED":
      return styles.statusDanger ?? "";
    default:
      return styles.statusMuted ?? "";
  }
}

export function OrderCard({
  order,
  action,
}: {
  order: OrderItem;
  action?: React.ReactNode;
}) {
  const formatMoney = (val?: number) => {
    if (val == null) return "—";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(val / 100);
  };

  return (
    <div className={styles.rowItem}>
      <div>
        <strong>{order.blogger_name || `Блогер #${order.blogger_id.slice(0, 8)}`}</strong>
        {order.message && <p className={styles.muted}>{order.message}</p>}
        <p className={styles.muted}>
          {order.amount_kopeks != null && <span>{formatMoney(order.amount_kopeks)} · </span>}
          <span className={statusClass(order.status)}>{order.status}</span>
        </p>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
