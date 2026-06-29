"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { appConfig } from "@/lib/config";
import { formatMoney, formatNumber } from "@/lib/format";
import { tokenStorage } from "@/lib/storage";
import { useToast } from "@/components/common/toast";

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

/** Group commissions by day and aggregate totals for the chart. */
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
    const day = item.date.slice(0, 10); // YYYY-MM-DD
    grouped.set(day, (grouped.get(day) || 0) + item.commission_amount_kopeks);
  }

  // Sort by date ascending
  const sorted = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));

  return sorted;
};

/** Format date for chart axis label. */
const formatChartDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/* =========================================================
   Area Chart (SVG)
   ========================================================= */

const EarningsChart = ({
  data,
}: {
  data: { date: string; amount: number }[];
}) => {
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

  // Build smooth path using cardinal spline approximation
  const buildPath = (): string => {
    if (points.length === 1) {
      return `M${points[0].x},${points[0].y}`;
    }

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

  // Fill area path (same line + close at bottom)
  const areaPath = `${linePath} L${points[points.length - 1].x},${PADDING_Y + CHART_H} L${points[0].x},${PADDING_Y + CHART_H} Z`;

  // Y-axis labels (3 ticks)
  const yTicks = [0, maxAmount / 2, maxAmount];

  // X-axis labels (first, middle, last)
  const xLabels: { x: number; label: string }[] = [];
  if (points.length >= 1) xLabels.push({ x: points[0].x, label: formatChartDate(points[0].date) });
  if (points.length >= 3) {
    const mid = Math.floor(points.length / 2);
    xLabels.push({ x: points[mid].x, label: formatChartDate(points[mid].date) });
  }
  if (points.length >= 2) {
    xLabels.push({
      x: points[points.length - 1].x,
      label: formatChartDate(points[points.length - 1].date),
    });
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
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = PADDING_Y + CHART_H - (tick / maxAmount) * CHART_H;
          return (
            <line
              key={i}
              x1={PADDING_X}
              y1={y}
              x2={WIDTH - PADDING_X}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Area */}
        <path d={areaPath} fill="url(#areaGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="var(--text-strong)"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth="1"
          >
            <title>
              {formatChartDate(p.date)}: {formatMoney(p.amount)}
            </title>
          </circle>
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => {
          const y = PADDING_Y + CHART_H - (tick / maxAmount) * CHART_H;
          return (
            <text
              key={i}
              x={PADDING_X - 8}
              y={y + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.35)"
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {tick === 0 ? "0" : `${Math.round(tick / 100)}`}
            </text>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={HEIGHT - 4}
            textAnchor="middle"
            fill="rgba(255,255,255,0.35)"
            fontSize="9"
            fontFamily="var(--font-narrow)"
          >
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
  referralUrl,
  referralLoading,
}: {
  referralUrl: string | null;
  referralLoading?: boolean;
}) => {
  const { toast: pushToast } = useToast();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [copied, setCopied] = useState(false);

  // Marketplace stats
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

  // Commission history for chart (fetch more items for a richer chart)
  const commissionsQuery = useQuery({
    queryKey: ["marketplace", "worker", "commissions-chart"],
    queryFn: async (): Promise<CommissionListResponse | null> => {
      const res = await fetch(
        `${appConfig.apiBaseUrl}/marketplace/worker/commissions?page=1&page_size=50`,
        {
          headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` },
        },
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
    <div>
      {/* ---- Stat cards ---- */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardAccent}`}>
          <p className={styles.statLabel}>Баланс маркетплейса</p>
          <p className={styles.statValue}>
            {stats ? formatMoney(stats.balance_kopeks) : "—"}
          </p>
          <p className={styles.statNote}>Комиссия с заказов рефералов.</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Заработано всего</p>
          <p className={styles.statValue}>
            {stats ? formatMoney(stats.total_earnings_kopeks) : "—"}
          </p>
          <p className={styles.statNote}>За всё время работы.</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Приведено заказчиков</p>
          <p className={styles.statValue}>
            {stats ? formatNumber(stats.referral_count) : "—"}
          </p>
          <p className={styles.statNote}>Зарегистрировались по вашей ссылке.</p>
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
            {(
              [
                { id: "week", label: "7 дн" },
                { id: "month", label: "30 дн" },
                { id: "all", label: "Всё" },
              ] as const
            ).map(({ id, label }) => (
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
            <span className={styles.chartLegendDot} style={{ background: "rgba(255,255,255,0.7)" }} />
            Комиссии, ₽
          </span>
          {chartData.length > 0 && (
            <span className={styles.chartLegendItem}>
              <span className={styles.chartLegendDot} style={{ background: "rgba(255,255,255,0.2)" }} />
              {chartData.length} {chartData.length === 1 ? "день" : chartData.length < 5 ? "дня" : "дней"}
            </span>
          )}
        </div>
      </div>

      {/* ---- Referral link ---- */}
      <div className={styles.referralSection}>
        <div className={styles.referralHeader}>
          <h3 className={styles.referralTitle}>Реферальная ссылка маркетплейса</h3>
          <p className={styles.referralDesc}>
            Приглашайте заказчиков на маркетплейс — получайте комиссию с каждого оплаченного заказа.
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
              {copied ? "Скопировано ✓" : "Копировать"}
            </button>
          </div>
        </div>

        <div className={styles.referralNote}>
          <svg className={styles.referralNoteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>
            Когда заказчик регистрируется по вашей ссылке, он навсегда закрепляется за вами.
            Вы будете получать комиссию с его заказов.
          </span>
        </div>
      </div>
    </div>
  );
};
