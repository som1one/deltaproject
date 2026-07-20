"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { appConfig } from "@/lib/config";
import { formatMoney, formatNumber } from "@/lib/format";
import { tokenStorage } from "@/lib/storage";
import { useToast } from "@/components/common/toast";
import type { UserMeRead } from "@/lib/types";

import { BalanceCard } from "./balance-card";
import { Section } from "./section";
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

type ChartPeriod = "week" | "month" | "all";

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

const formatChartDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/** Accumulate commissions by day into a running balance series. */
const buildBalanceSeries = (
  items: CommissionEntry[],
  period: ChartPeriod,
): { date: string; balance: number }[] => {
  const now = new Date();
  let cutoff: Date;

  switch (period) {
    case "week":
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      cutoff = new Date(0);
  }

  const filtered = items.filter((item) => new Date(item.date) >= cutoff);
  // Группируем по дню
  const grouped = new Map<string, number>();
  for (const item of filtered) {
    const day = item.date.slice(0, 10);
    grouped.set(day, (grouped.get(day) || 0) + item.commission_amount_kopeks);
  }

  // Сортируем по дате и строим кумулятивную сумму
  const sorted = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  let running = 0;
  return sorted.map(([date, amount]) => {
    running += amount;
    return { date, balance: running };
  });
};

/* =========================================================
   Icons
   ========================================================= */

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* =========================================================
   Balance Chart (SVG)
   ========================================================= */

const BalanceChart = ({ data }: { data: { date: string; balance: number }[] }) => {
  if (data.length === 0) return null;

  const WIDTH = 560;
  const HEIGHT = 120;
  const PX = 36;
  const PY = 16;
  const CW = WIDTH - PX * 2;
  const CH = HEIGHT - PY * 2;

  const maxVal = Math.max(...data.map((d) => d.balance), 1);

  const points = data.map((d, i) => {
    const x = PX + (data.length === 1 ? CW / 2 : (i / (data.length - 1)) * CW);
    const y = PY + CH - (d.balance / maxVal) * CH;
    return { x, y, ...d };
  });

  const buildPath = (): string => {
    if (points.length === 1) return `M${points[0].x},${points[0].y}`;
    let path = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }
    return path;
  };

  const linePath = buildPath();
  const areaPath = `${linePath} L${points[points.length - 1].x},${PY + CH} L${points[0].x},${PY + CH} Z`;

  return (
    <div className={styles.chartArea}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="График динамики заработка"
      >
        <defs>
          <linearGradient id="balAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac, i) => {
          const y = PY + CH - frac * CH;
          return (
            <line key={i} x1={PX} y1={y} x2={WIDTH - PX} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3 3" />
          );
        })}
        <path d={areaPath} fill="url(#balAreaGrad)" />
        <path d={linePath} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--text-strong)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.8">
            <title>{formatChartDate(p.date)}: {formatMoney(p.balance)}</title>
          </circle>
        ))}
        {/* X-axis labels */}
        {points.length >= 2 ? (
          <>
            <text x={points[0].x} y={HEIGHT - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--font-narrow)">
              {formatChartDate(points[0].date)}
            </text>
            <text x={points[points.length - 1].x} y={HEIGHT - 2} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="var(--font-narrow)">
              {formatChartDate(points[points.length - 1].date)}
            </text>
          </>
        ) : null}
        {/* Last value annotation */}
        <text x={points[points.length - 1].x + 4} y={points[points.length - 1].y - 6} textAnchor="start" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="var(--font-mono)">
          {formatMoney(points[points.length - 1].balance)}
        </text>
      </svg>
    </div>
  );
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
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");

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
    queryKey: ["marketplace", "worker", "commissions-all"],
    queryFn: async (): Promise<CommissionListResponse | null> => {
      const res = await fetch(
        `${appConfig.apiBaseUrl}/marketplace/worker/commissions?page=1&page_size=50`,
        { headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` } },
      );
      if (!res.ok) return null;
      return res.json();
    },
  });

  const stats = statsQuery.data;
  const allCommissions = commissionsQuery.data?.items || [];
  const recentCommissions = allCommissions.slice(0, 5);

  const chartData = useMemo(
    () => buildBalanceSeries(allCommissions, chartPeriod),
    [allCommissions, chartPeriod],
  );

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

  // Кнопка выплаты смотрит на оба контура: маркетплейс-заработок + легаси-остаток.
  const hasBalance = me.marketplace_balance_kopeks + me.balance > 0;
  const hasCard = Boolean(me.payout_card_last4);

  return (
    <div className={styles.root}>
      {/* ---- Верхний ряд: карта баланса + действия и реф-ссылка ---- */}
      <div className={styles.topGrid}>
        <BalanceCard me={me} />

        <aside className={styles.side}>
          <div className={styles.sideBlock}>
            <p className={styles.sideLabel}>Быстрые действия</p>
            <div className={styles.sideActions}>
              {hasCard ? (
                <button
                  type="button"
                  className={styles.sideAction}
                  onClick={() => onNavigate?.("finance")}
                  disabled={!hasBalance}
                >
                  <span>Запросить выплату</span>
                  <ArrowIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.sideAction}
                  onClick={() => onNavigate?.("profile")}
                >
                  <span>Привязать карту</span>
                  <ArrowIcon />
                </button>
              )}
              <button
                type="button"
                className={styles.sideAction}
                onClick={() => onNavigate?.("scripts")}
              >
                <span>Скрипты сообщений</span>
                <ArrowIcon />
              </button>
            </div>
            {!hasBalance && hasCard ? (
              <p className={styles.sideHint}>Баланс пуст — начните с реферальной ссылки ниже.</p>
            ) : null}
          </div>

          <div className={styles.sideBlock}>
            <p className={styles.sideLabel}>Реферальная ссылка</p>
            <p className={styles.refUrl}>
              {referralLoading ? "Получаем ссылку…" : referralUrl || "не получена"}
            </p>
            <button
              type="button"
              className={`${styles.refCopyBtn}${copied ? ` ${styles.refCopied}` : ""}`}
              onClick={handleCopy}
              disabled={!referralUrl}
            >
              {copied ? "Скопировано" : "Скопировать ссылку"}
            </button>
            <p className={styles.sideHint}>
              Заказчик, пришедший по ссылке, привязывается к вам навсегда.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- График баланса ---- */}
      {chartData.length > 1 ? (
        <Section
          label="Динамика заработка"
          aside={
            <div className={styles.chartPeriod}>
              {([
                { id: "week", label: "7 дн" },
                { id: "month", label: "30 дн" },
                { id: "all", label: "Всё" },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.chartPeriodBtn}${chartPeriod === id ? ` ${styles.chartPeriodBtnActive}` : ""}`}
                  aria-pressed={chartPeriod === id}
                  onClick={() => setChartPeriod(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          <BalanceChart data={chartData} />
        </Section>
      ) : null}

      {/* ---- Метрики: тихая типографская строка ---- */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          {/* Коротко: длинный «Заработано всего» ломал строку метрик на мобиле. */}
          <span className={styles.metricLabel}>Заработано</span>
          <span className={styles.metricValue}>
            {stats ? formatMoney(stats.total_earnings_kopeks) : "—"}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Рефералов</span>
          <span className={styles.metricValue}>
            {stats ? formatNumber(stats.referral_count) : "0"}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Заказов</span>
          <span className={styles.metricValue}>
            {commissionsQuery.data ? formatNumber(commissionsQuery.data.total) : "0"}
          </span>
        </div>
      </div>

      {/* ---- Последние комиссии ---- */}
      <Section
        label="Последние комиссии"
        aside={
          recentCommissions.length > 0 ? (
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
        {recentCommissions.length === 0 ? (
          <div className={styles.activityEmpty}>
            <p className={styles.activityEmptyTitle}>Пока нет комиссий</p>
            <p className={styles.activityEmptyText}>
              Появятся после первого оплаченного заказа приведённого заказчика.
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
      </Section>

      {/* ---- Как работать ---- */}
      <Section label="Как работать">
        <ol className={styles.howSteps}>
          <li className={styles.howStep}>
            <span className={styles.howStepNum}>01</span>
            <span className={styles.howStepTitle}>Найдите заказчика</span>
            <span className={styles.howStepDesc}>
              Реклама у блогеров нужна предпринимателям, экспертам и магазинам —
              ищите их в бизнес-чатах, среди знакомых и бывших клиентов.
            </span>
          </li>
          <li className={styles.howStep}>
            <span className={styles.howStepNum}>02</span>
            <span className={styles.howStepTitle}>Напишите по скрипту</span>
            <span className={styles.howStepDesc}>
              Готовые первые сообщения и ответы на возражения — в «Скриптах
              сообщений». Разговор завершайте отправкой реферальной ссылки.
            </span>
          </li>
          <li className={styles.howStep}>
            <span className={styles.howStepNum}>03</span>
            <span className={styles.howStepTitle}>Заказчик оформляет заказ</span>
            <span className={styles.howStepDesc}>
              По ссылке он попадает в каталог блогеров и регистрируется. Дальше
              каждый его заказ — сколько бы их ни было — засчитывается вам.
            </span>
          </li>
          <li className={styles.howStep}>
            <span className={styles.howStepNum}>04</span>
            <span className={styles.howStepTitle}>Комиссия начисляется сама</span>
            <span className={styles.howStepDesc}>
              После оплаты заказа ваш процент автоматически падает на баланс.
              Свежие начисления — здесь в обзоре, полная история — в «Финансах».
            </span>
          </li>
          <li className={styles.howStep}>
            <span className={styles.howStepNum}>05</span>
            <span className={styles.howStepTitle}>Выводите на карту</span>
            <span className={styles.howStepDesc}>
              Привяжите карту в профиле и запросите выплату в «Финансах» —
              заявку обработает администратор.
            </span>
          </li>
        </ol>
      </Section>
    </div>
  );
};
