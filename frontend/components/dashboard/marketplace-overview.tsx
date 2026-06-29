"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { appConfig } from "@/lib/config";
import { formatMoney, formatNumber } from "@/lib/format";
import { tokenStorage } from "@/lib/storage";
import { useToast } from "@/components/common/toast";
import type { UserMeRead } from "@/lib/types";

import styles from "./marketplace-overview.module.css";

/* =========================================================
   Types
   ========================================================= */

type MarketplaceStats = {
  total_earnings_kopeks: number;
  balance_kopeks: number;
  referral_count: number;
};

type CommissionEntry = {
  order_id: string;
  client_name: string;
  order_amount_kopeks: number;
  commission_pct: number;
  commission_amount_kopeks: number;
  date: string;
};

type CommissionListResponse = {
  items: CommissionEntry[];
  total: number;
  page: number;
  page_size: number;
};

/* =========================================================
   Helpers
   ========================================================= */

const formatRelativeDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/* =========================================================
   Main Component
   ========================================================= */

export const MarketplaceOverview = ({
  me,
  referralUrl,
  referralLoading,
  onNavigate,
}: {
  me: UserMeRead;
  referralUrl: string | null;
  referralLoading?: boolean;
  /** Navigate to another tab programmatically */
  onNavigate?: (tab: string) => void;
}) => {
  const { toast: pushToast } = useToast();
  const [copied, setCopied] = useState(false);

  const statsQuery = useQuery({
    queryKey: ["marketplace", "worker", "stats"],
    queryFn: async (): Promise<MarketplaceStats | null> => {
      const res = await fetch(`${appConfig.apiBaseUrl}/marketplace/worker/stats`, {
        headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const commissionsQuery = useQuery({
    queryKey: ["marketplace", "worker", "commissions-recent"],
    queryFn: async (): Promise<CommissionListResponse | null> => {
      const res = await fetch(
        `${appConfig.apiBaseUrl}/marketplace/worker/commissions?page=1&page_size=5`,
        { headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` } },
      );
      if (!res.ok) return null;
      return res.json();
    },
  });

  const stats = statsQuery.data;
  const recentCommissions = commissionsQuery.data?.items || [];

  const handleCopy = useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      pushToast("Ссылка скопирована", "success");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      pushToast("Не удалось скопировать", "error");
    }
  }, [referralUrl, pushToast]);

  const hasBalance = me.balance > 0;
  const hasCard = Boolean(me.payout_card_last4);

  return (
    <div className={styles.root}>
      {/* ---- Hero: главная цифра + быстрые действия ---- */}
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <p className={styles.heroLabel}>Ваш баланс</p>
          <p className={styles.heroValue}>{formatMoney(me.balance)}</p>
          {me.balance_pending_confirmation_kopeks > 0 ? (
            <p className={styles.heroPending}>
              + {formatMoney(me.balance_pending_confirmation_kopeks)} на подтверждении
            </p>
          ) : null}
        </div>
        <div className={styles.heroActions}>
          {hasBalance && hasCard ? (
            <button
              type="button"
              className={styles.heroBtn}
              onClick={() => onNavigate?.("finance")}
            >
              Запросить выплату
            </button>
          ) : !hasCard ? (
            <button
              type="button"
              className={`${styles.heroBtn} ${styles.heroBtnSecondary}`}
              onClick={() => onNavigate?.("profile")}
            >
              Привязать карту
            </button>
          ) : (
            <span className={styles.heroHint}>Баланс пуст — приглашайте заказчиков</span>
          )}
        </div>
      </section>

      {/* ---- Компактная строка метрик ---- */}
      <section className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricValue}>{me.percent}%</span>
          <span className={styles.metricLabel}>ставка</span>
        </div>
        <div className={styles.metricDivider} />
        <div className={styles.metric}>
          <span className={styles.metricValue}>
            {stats ? formatMoney(stats.total_earnings_kopeks) : "—"}
          </span>
          <span className={styles.metricLabel}>заработано всего</span>
        </div>
        <div className={styles.metricDivider} />
        <div className={styles.metric}>
          <span className={styles.metricValue}>
            {stats ? formatNumber(stats.referral_count) : "0"}
          </span>
          <span className={styles.metricLabel}>рефералов</span>
        </div>
        <div className={styles.metricDivider} />
        <div className={styles.metric}>
          <span className={styles.metricValue}>
            {me.linked_to ? "Да" : "Нет"}
          </span>
          <span className={styles.metricLabel}>привязка</span>
        </div>
      </section>

      {/* ---- Реферальная ссылка — компактно ---- */}
      <section className={styles.refRow}>
        <div className={styles.refInfo}>
          <span className={styles.refLabel}>Реф-ссылка</span>
          <span className={styles.refUrl}>
            {referralLoading ? "..." : referralUrl || "не получена"}
          </span>
        </div>
        <button
          type="button"
          className={`${styles.refCopyBtn}${copied ? ` ${styles.refCopied}` : ""}`}
          onClick={handleCopy}
          disabled={!referralUrl}
        >
          {copied ? "✓ Скопировано" : "Скопировать"}
        </button>
      </section>

      {/* ---- Последние комиссии (лента) ---- */}
      <section className={styles.activity}>
        <div className={styles.activityHeader}>
          <h3 className={styles.activityTitle}>Последние комиссии</h3>
          {recentCommissions.length > 0 ? (
            <button
              type="button"
              className={styles.activityLink}
              onClick={() => onNavigate?.("finance")}
            >
              Все операции →
            </button>
          ) : null}
        </div>

        {recentCommissions.length === 0 ? (
          <div className={styles.activityEmpty}>
            <p className={styles.activityEmptyTitle}>Пока нет комиссий</p>
            <p className={styles.activityEmptyText}>
              Приглашайте заказчиков по реферальной ссылке — комиссия начислится автоматически после оплаты.
            </p>
          </div>
        ) : (
          <ul className={styles.activityList}>
            {recentCommissions.map((entry) => (
              <li key={entry.order_id} className={styles.activityItem}>
                <div className={styles.activityItemMain}>
                  <span className={styles.activityItemName}>{entry.client_name}</span>
                  <span className={styles.activityItemOrder}>
                    заказ на {formatMoney(entry.order_amount_kopeks)}
                  </span>
                </div>
                <div className={styles.activityItemRight}>
                  <span className={styles.activityItemAmount}>
                    +{formatMoney(entry.commission_amount_kopeks)}
                  </span>
                  <span className={styles.activityItemDate}>
                    {formatRelativeDate(entry.date)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
