"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { appConfig } from "@/lib/config";
import { formatDateTime, formatLedgerStatus, formatMoney, formatNumber } from "@/lib/format";
import { tokenStorage } from "@/lib/storage";
import { useToast } from "@/components/common/toast";
import type { LedgerEntryRead, UserMeRead } from "@/lib/types";
import { StatusPill } from "@/components/common/ui";

import { BalanceCard } from "./balance-card";
import { Section } from "./section";
import { ledgerTone } from "./ledger";
import styles from "./blogger-overview.module.css";

/* =========================================================
   Blogger overview — карта баланса + приглашение на
   маркетплейс + реферальная сеть (2-й уровень) + превью
   последних операций из истории.
   ========================================================= */

type BloggerStats = {
  total_earnings_kopeks: number;
  balance_kopeks: number;
  recruited_workers_count: number;
  referral_outflow_kopeks: number;
};

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* =========================================================
   Marketplace CTA
   ========================================================= */

const MarketplaceCta = () => (
  <section className={styles.cta} aria-label="Маркетплейс">
    <div className={styles.ctaTop}>
      <p className={styles.ctaEyebrow}>Маркетплейс</p>
      <h3 className={styles.ctaTitle}>Больше заказов&nbsp;— на&nbsp;маркетплейсе</h3>
      <p className={styles.ctaText}>
        Берите рекламные интеграции с прямой оплатой через площадку. Деньги
        держатся в эскроу и приходят после выполнения — без переписок о предоплате.
      </p>
    </div>
    <ul className={styles.ctaPoints}>
      <li className={styles.ctaPoint}>Эскроу-оплата</li>
      <li className={styles.ctaPoint}>Прямые заказы</li>
      <li className={styles.ctaPoint}>Вывод на карту</li>
    </ul>
    <a className={styles.ctaBtn} href={appConfig.marketplaceUrl}>
      Открыть маркетплейс
      <ArrowIcon />
    </a>
  </section>
);

/* =========================================================
   Реферальная сеть — ссылка на приглашение воркеров + «нагон».
   С каждого заказа автора часть уходит на рефкомиссии; чтобы
   не только терять, а зарабатывать — приглашайте воркеров.
   ========================================================= */

const ReferralInvite = ({
  referralUrl,
  stats,
}: {
  referralUrl: string | null;
  stats: BloggerStats | null;
}) => {
  const { toast: pushToast } = useToast();
  const [copied, setCopied] = useState(false);

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

  const outflow = stats?.referral_outflow_kopeks ?? 0;

  return (
    <Section label="Приглашайте воркеров">
      <div className={styles.refBlock}>
        <p className={styles.nudgeText}>
          {outflow > 0 ? (
            <>
              С ваших заказов на реферальные комиссии уже ушло{" "}
              <span className={styles.nudgeStrong}>{formatMoney(outflow)}</span>.{" "}
            </>
          ) : (
            <>Часть каждого вашего заказа уходит на реферальные комиссии. </>
          )}
          Приглашайте воркеров по своей ссылке — и получайте процент с их заказов,
          а не только теряйте.
        </p>

        <p className={styles.refUrl}>{referralUrl || "ссылка недоступна"}</p>
        <button
          type="button"
          className={`${styles.refCopyBtn}${copied ? ` ${styles.refCopied}` : ""}`}
          onClick={handleCopy}
          disabled={!referralUrl}
        >
          {copied ? "Скопировано" : "Скопировать ссылку"}
        </button>

        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Приведено воркеров</span>
            <span className={styles.metricValue}>
              {stats ? formatNumber(stats.recruited_workers_count) : "0"}
            </span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Заработано на рефералах</span>
            <span className={styles.metricValue}>
              {stats ? formatMoney(stats.total_earnings_kopeks) : "—"}
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
};

/* =========================================================
   Recent operations — hairline-список последних записей
   истории. Клик открывает ту же модалку, что и в «Финансах».
   ========================================================= */

const RecentOperations = ({
  ledger,
  loading,
  onSelectEntry,
}: {
  ledger: LedgerEntryRead[];
  loading?: boolean;
  onSelectEntry?: (entry: LedgerEntryRead) => void;
}) => {
  if (loading) {
    return (
      <div className={styles.opsSkeleton}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.opsSkeletonRow} />
        ))}
      </div>
    );
  }

  const recent = ledger.slice(0, 4);

  if (recent.length === 0) {
    return (
      <div className={styles.opsEmpty}>
        <p className={styles.opsEmptyTitle}>Операций пока нет</p>
        <p className={styles.opsEmptyText}>
          Здесь появятся начисления по заказам и выплаты на карту.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.opsList}>
      {recent.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className={styles.opsRow}
            onClick={() => onSelectEntry?.(entry)}
          >
            <span
              className={styles.opsAmount}
              data-negative={entry.amount_kopeks < 0 ? "true" : undefined}
            >
              {entry.amount_kopeks < 0 ? "−" : "+"}
              {formatMoney(Math.abs(entry.amount_kopeks))}
            </span>
            <StatusPill tone={ledgerTone(entry.status)}>
              {formatLedgerStatus(entry.status)}
            </StatusPill>
            <span className={styles.opsDate}>{formatDateTime(entry.created_at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

/* =========================================================
   Public component
   ========================================================= */

export const BloggerOverview = ({
  me,
  ledger,
  ledgerLoading,
  onNavigate,
  onSelectEntry,
}: {
  me: UserMeRead;
  ledger: LedgerEntryRead[];
  ledgerLoading?: boolean;
  onNavigate?: (tab: string) => void;
  onSelectEntry?: (entry: LedgerEntryRead) => void;
}) => {
  // Ссылка блогера приходит из /me относительным путём /ref/{nickname};
  // приглашение воркеров идёт по хосту платформы (этого приложения).
  const referralUrl = useMemo(() => {
    const path = me.referral_invite_url;
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${path}`;
  }, [me.referral_invite_url]);

  const statsQuery = useQuery({
    queryKey: ["marketplace", "blogger", "stats"],
    queryFn: async (): Promise<BloggerStats | null> => {
      const res = await fetch(`${appConfig.apiBaseUrl}/marketplace/blogger/stats`, {
        headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  return (
    <div className={styles.root}>
      <div className={styles.topGrid}>
        <BalanceCard me={me} />
        <MarketplaceCta />
      </div>

      <ReferralInvite referralUrl={referralUrl} stats={statsQuery.data ?? null} />

      <Section
        label="Последние операции"
        aside={
          ledger.length > 0 ? (
            <button
              type="button"
              className={styles.sectionLink}
              onClick={() => onNavigate?.("finance")}
            >
              Все операции →
            </button>
          ) : null
        }
      >
        <RecentOperations
          ledger={ledger}
          loading={ledgerLoading}
          onSelectEntry={onSelectEntry}
        />
      </Section>
    </div>
  );
};
