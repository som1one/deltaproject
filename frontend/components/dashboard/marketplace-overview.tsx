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

type ChartPeriod = "week" | "month" | "all";

/* =========================================================
   Helpers
   ========================================================= */

const aggregateByDay = (
  items: CommissionEntry[],
  period: ChartPeriod,
): { date: string; amount: number }[] => {
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
  const grouped = new Map<string, number>();

  for (const item of filtered) {
    const day = item.date.slice(0, 10);
    grouped.set(day, (grouped.get(day) || 0) + item.commission_amount_kopeks);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
};

const formatChartDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/* =========================================================
   Area Chart (SVG)
   ========================================================= */

const EarningsChart = ({ data }: { data: { date: string; amount: number }[] }) => {
  if (data.length === 0) {
    return (
      <p className={styles.chartEmpty}>
        Пока нет данных для графика. Комиссии будут отображаться здесь.
      </p>
    );
  }

  const WIDTH = 600;
  const HEIGHT = 160;
  const PADDING_X = 40;
  const PADDING_Y = 20;
  const CHART_W = WIDTH - PADDING_X * 2;
  const CHART_H = HEIGHT - PADDING_Y * 2;

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  const points = data.map((d, i) => {
    const x = PADDING_X + (data.length === 1 ? CHART_W / 2 : (i / (data.length - 1)) * CHART_W);
    const y = PADDING_Y + CHART_H - (d.amount / maxAmount) * CHART_H;
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
  const areaPath = `${linePath} L${points[points.length - 1].x},${PADDING_Y + CHART_H} L${points[0].x},${PADDING_Y + CHART_H} Z`;
  const yTicks = [0, maxAmount / 2, maxAmount];

  const xLabels: { x: number; label: string }[] = [];
  if (points.length >= 1) xLabels.push({ x: points[0].x, label: formatChartDate(points[0].date) });
  if (points.length >= 3) {
    const mid = Math.floor(points.length / 2);
    xLabels.push({ x: points[mid].x, label: formatChartDate(points[mid].date) });
  }
  if (points.length >= 2) {
    xLabels.push({ x: points[points.length - 1].x, label: formatChartDate(points[points.length - 1].date) });
  }

  return (
    <div className={styles.chartArea}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="График комиссий за период"
      >
        {yTicks.map((tick, i) => {
          const y = PADDING_Y + CHART_H - (tick / maxAmount) * CHART_H;
          return (
            <line key={i} x1={PADDING_X} y1={y} x2={WIDTH - PADDING_X} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
          );
        })}
        <defs>
          <linearGradient id="mkAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#mkAreaGrad)" />
        <path d={linePath} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--text-strong)" stroke="rgba(0,0,0,0.4)" strokeWidth="1">
            <title>{formatChartDate(p.date)}: {formatMoney(p.amount)}</title>
          </circle>
        ))}
        {yTicks.map((tick, i) => {
          const y = PADDING_Y + CHART_H - (tick / maxAmount) * CHART_H;
          return (
            <text key={i} x={PADDING_X - 8} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="var(--font-mono)">
              {tick === 0 ? "0" : `${Math.round(tick / 100)}`}
            </text>
          );
        })}
        {xLabels.map((label, i) => (
          <text key={i} x={label.x} y={HEIGHT - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="var(--font-narrow)">
            {label.label}
          </text>
        ))}
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
}: {
  me: UserMeRead;
  referralUrl: string | null;
  referralLoading?: boolean;
}) => {
  const { toast: pushToast } = useToast();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
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
    queryKey: ["marketplace", "worker", "commissions-chart"],
    queryFn: async (): Promise<CommissionListResponse | null> => {
      const res = await fetch(
        `${appConfig.apiBaseUrl}/marketplace/worker/commissions?page=1&page_size=50`,
        { headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` } },
      );
      if (!res.ok) return null;
      return res.json();
    },
  });

  const chartData = useMemo(
    () => aggregateByDay(commissionsQuery.data?.items || [], chartPeriod),
    [commissionsQuery.data, chartPeriod],
  );

  const stats = statsQuery.data;

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

  return (
    <div className={styles.root}>
      {/* ---- Unified stats grid ---- */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardPrimary}`}>
          <p className={styles.statLabel}>Доступно к выводу</p>
          <p className={styles.statValue}>{formatMoney(me.balance)}</p>
          <p className={styles.statNote}>Запросите выплату в «Финансах».</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>В обработке</p>
          <p className={styles.statValue}>{formatMoney(me.balance_pending_confirmation_kopeks)}</p>
          <p className={styles.statNote}>Ожидает подтверждения.</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Ваша ставка</p>
          <p className={styles.statValue}>{me.percent}%</p>
          <p className={styles.statNote}>Доля от каждой сделки.</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Привязка</p>
          <p className={`${styles.statValue} ${styles.statValueSmall}`}>
            {me.linked_to ? "Активна" : "Свободный"}
          </p>
          <p className={styles.statNote}>
            {me.linked_to ? "Сделки идут блогеру." : "Перейдите по реф-ссылке."}
          </p>
        </div>
        <div className={`${styles.statCard} ${styles.statCardAccent}`}>
          <p className={styles.statLabel}>Баланс маркетплейса</p>
          <p className={styles.statValue}>{stats ? formatMoney(stats.balance_kopeks) : "—"}</p>
          <p className={styles.statNote}>Комиссия с заказов рефералов.</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Заработано всего</p>
          <p className={styles.statValue}>{stats ? formatMoney(stats.total_earnings_kopeks) : "—"}</p>
          <p className={styles.statNote}>За всё время работы.</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Приведено заказчиков</p>
          <p className={styles.statValue}>{stats ? formatNumber(stats.referral_count) : "—"}</p>
          <p className={styles.statNote}>Зарегистрировались по ссылке.</p>
        </div>
      </div>

      {/* ---- Earnings chart ---- */}
      <div className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <div className={styles.chartHeaderLeft}>
            <p className={styles.chartEyebrow}>Аналитика</p>
            <h3 className={styles.chartTitle}>Комиссии за период</h3>
          </div>
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
                onClick={() => setChartPeriod(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <EarningsChart data={chartData} />
        <div className={styles.chartLegend}>
          <span className={styles.chartLegendItem}>
            <span className={styles.chartLegendDot} style={{ background: "rgba(255,255,255,0.65)" }} />
            Комиссии, ₽
          </span>
        </div>
      </div>

      {/* ---- Referral link ---- */}
      <div className={styles.referralSection}>
        <div className={styles.referralHeader}>
          <h3 className={styles.referralTitle}>Реферальная ссылка</h3>
          <p className={styles.referralDesc}>
            Приглашайте заказчиков — получайте комиссию с каждого оплаченного заказа.
          </p>
        </div>

        <div>
          <p className={styles.referralLinkLabel}>Ваша ссылка</p>
          <div className={styles.referralLinkRow}>
            <input
              className={styles.referralLinkInput}
              readOnly
              value={referralLoading ? "Загрузка..." : referralUrl || "Не удалось получить ссылку"}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              aria-label="Реферальная ссылка"
            />
            <button
              type="button"
              className={`${styles.referralCopyBtn}${copied ? ` ${styles.referralCopied}` : ""}`}
              onClick={handleCopy}
              disabled={!referralUrl}
              aria-label="Копировать ссылку"
            >
              {copied ? "✓" : "Копировать"}
            </button>
          </div>
        </div>

        <div className={styles.referralNote}>
          <svg className={styles.referralNoteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>
            Когда заказчик регистрируется по вашей ссылке, он навсегда закрепляется за вами. Вы будете получать комиссию с его заказов.
          </span>
        </div>
      </div>
    </div>
  );
};
