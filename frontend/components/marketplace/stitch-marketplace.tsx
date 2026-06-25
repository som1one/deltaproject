"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { appConfig } from "@/lib/config";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { NAV_ITEMS, NAV_CTA } from "@/components/marketing/nav-config";
import { SiteFooter } from "@/components/common/site-footer";

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

// ============================================================
// Shell / Navigation
// ============================================================

export function AdMarketplaceShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBlogger } = useAuth();
  const accountHref = isAuthenticated ? (isBlogger ? "/blogger/cabinet" : "/cabinet") : `${appConfig.marketplaceUrl}/auth/login`;
  const accountLabel = isAuthenticated ? "Личный кабинет" : "Войти";

  return (
    <div className={styles.root}>
      <MarketingNav
        brandSub="агентство · каталог"
        items={NAV_ITEMS}
        cta={{ href: accountHref, label: accountLabel }}
      />
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
