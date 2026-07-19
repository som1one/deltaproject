"use client";

import { formatDateTime, formatLedgerStatus, formatMoney } from "@/lib/format";
import type { LedgerEntryRead, UserMeRead } from "@/lib/types";
import { StatusPill } from "@/components/common/ui";

import { BalanceCard } from "./balance-card";
import { Section } from "./section";
import { ledgerTone } from "./ledger";
import styles from "./blogger-overview.module.css";

/* =========================================================
   Blogger overview — карта баланса + приглашение на
   маркетплейс + превью последних операций из истории.
   ========================================================= */

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
      <h3 className={styles.ctaTitle}>Больше заказов — на&nbsp;маркетплейсе</h3>
      <p className={styles.ctaText}>
        Берите рекламные интеграции с прямой оплатой через площадку. Деньги
        держатся в эскроу и приходят после выполнения — без переписок о предоплате.
      </p>
    </div>
    <ul className={styles.ctaPoints}>
      <li className={styles.ctaPoint}>Оплата в эскроу</li>
      <li className={styles.ctaPoint}>Прямые заказы</li>
      <li className={styles.ctaPoint}>Вывод на карту</li>
    </ul>
    <a className={styles.ctaBtn} href="/blogger/marketplace">
      Открыть маркетплейс
      <ArrowIcon />
    </a>
  </section>
);

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
}) => (
  <div className={styles.root}>
    <div className={styles.topGrid}>
      <BalanceCard me={me} />
      <MarketplaceCta />
    </div>

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
