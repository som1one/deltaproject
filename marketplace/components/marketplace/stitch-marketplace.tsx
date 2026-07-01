"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { appConfig } from "@/lib/config";
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

  // Blogger goes to the main platform cabinet; client stays on marketplace
  const cabinetHref = isBlogger
    ? `${appConfig.mainAppUrl}/cabinet`
    : "/home";

  const navCta = isAuthenticated
    ? { href: cabinetHref, label: "Личный кабинет" }
    : { href: "/auth/login", label: "Войти" };

  return (
    <div className={styles.root}>
      <MarketingNav
        brandSub="агентство · каталог"
        items={NAV_ITEMS}
        cta={navCta}
      />
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>looney moon</span>
          <span className={styles.brandSub}>АГЕНТСТВО</span>
        </Link>
        <div className={styles.navLinks}>
          <Link className={styles.navActive} href="/">
            Каталог
          </Link>
          <Link className={styles.navLink} href="/support">
            Поддержка
          </Link>
        </div>
        <div className={styles.navLinks}>
          {isAuthenticated ? (
            <Link
              className={styles.navLink}
              href={cabinetHref}
              {...(isBlogger ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              Личный кабинет
            </Link>
          ) : (
            <>
              <Link className={styles.navLink} href="/auth/login">
                Вход
              </Link>
              <Link className={styles.navAction} href="/auth/register">
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
// Header — Premium Hero
// ============================================================

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  lead?: string;
  display?: boolean;
  stats?: Array<{ label: string; value: string | number }>;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export function PageHeader({ eyebrow, title, lead, display, stats, searchValue, onSearchChange }: PageHeaderProps) {
  // Generate decorative dots
  const dots = Array.from({ length: 42 }, (_, i) => i);

  return (
    <header className={styles.pageHeader}>
      {/* Decorative dots grid */}
      <div className={styles.heroDecor} aria-hidden="true">
        {dots.map((i) => (
          <div key={i} className={styles.heroDecorDot} />
        ))}
      </div>

      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h1 className={display ? styles.displayTitle : styles.title}>
        {title}
      </h1>
      {lead && <p className={styles.lead}>{lead}</p>}

      {/* Inline hero search */}
      {onSearchChange !== undefined && (
        <div className={styles.heroSearch}>
          <span className={styles.heroSearchIcon} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            className={styles.heroSearchInput}
            placeholder="Поиск по имени или нише..."
            aria-label="Поиск блогеров"
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            id="hero-search"
          />
          <button className={styles.heroSearchBtn} type="button" aria-label="Искать">
            Найти
          </button>
        </div>
      )}

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
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${Math.round(val / 1_000)}K`;
    return new Intl.NumberFormat("ru-RU").format(val);
  };

  const imageSrc = blogger.profile_image_url || "/images/placeholder-portrait.jpg";
  const trustScore = blogger.rating ? blogger.rating.toFixed(1) : "9.5";

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
          {blogger.gender && (
            <span className={styles.tag}>{genderLabel(blogger.gender)}</span>
          )}
        </div>
        <button className={styles.saveButton} aria-label="Сохранить">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </button>
        {blogger.orders_count != null && blogger.orders_count > 0 && (
          <div className={styles.verifiedBadge}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
            Проверен
          </div>
        )}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span>{trustScore}</span>
            </div>
            <span className={styles.trustScoreLabel}>Trust</span>
          </div>
        </div>

        <p className={styles.description}>
          {blogger.description || "Профессиональный блогер, открыт к рекламным коллаборациям."}
        </p>

        <div className={styles.cardMetrics}>
          <div className={styles.metricItem}>
            <div className={styles.propertyLabel}>Аудитория</div>
            <div className={styles.metricValue}>
              {blogger.audience_size ? formatAudience(blogger.audience_size) : "—"}
            </div>
          </div>
          <div className={styles.metricItem}>
            <div className={styles.propertyLabel}>CPV</div>
            <div className={styles.metricValue}>{formatMoney(blogger.price_per_post)}</div>
          </div>
        </div>

        <button
          className={styles.orderButton}
          onClick={() => onOrder?.(blogger)}
          type="button"
          id={`order-btn-${blogger.id}`}
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
          <div style={{ width: "65%", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className={styles.skeletonLine} style={{ height: 22, width: "80%" }} />
            <div className={styles.skeletonLine} style={{ height: 14, width: "50%" }} />
          </div>
          <div className={styles.skeletonLine} style={{ height: 32, width: 40, borderRadius: 4 }} />
        </div>
        <div className={styles.skeletonLine} style={{ height: 40, marginBottom: 18 }} />
        <div className={styles.cardMetrics}>
          <div className={styles.skeletonLine} style={{ height: 36 }} />
          <div className={styles.skeletonLine} style={{ height: 36 }} />
        </div>
        <div className={styles.skeletonLine} style={{ height: 42 }} />
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
