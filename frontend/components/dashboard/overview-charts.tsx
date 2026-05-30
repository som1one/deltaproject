"use client";

import { useMemo } from "react";

import { formatDealStatus, formatNumber, pluralRu } from "@/lib/format";
import type { DealRead, DealStatus } from "@/lib/types";

import styles from "./overview-charts.module.css";

/* =========================================================
   Monochrome dashboard charts: pipeline funnel + status donut.
   Visual language matches the rest of the cabinet (white-on-black,
   opacity ladder, mono-typography for numbers).
   ========================================================= */

const PIPELINE: readonly DealStatus[] = [
  "NEW",
  "REVIEW",
  "CONFIRMED",
  "PAID",
  "COMPLETED",
];

// Per-status colour palette. Stays inside the cabinet's monochrome surface
// (black background, white text) but adds enough hue to read the funnel
// at a glance. Tuned to feel premium, not playful.
const STATUS_COLOR: Record<DealStatus, string> = {
  NEW: "#7da7ff",          // холодно-синий — только что прилетело
  REVIEW: "#e7c66a",       // тёплый янтарь — на проверке
  CONFIRMED: "#a78bff",    // лиловый — подтверждена админом
  ESCROW_HELD: "#6fb3c9",  // бирюзовый — деньги в эскроу
  PAID: "#7fd4a8",         // зелёный — оплачена
  COMPLETED: "#9aa6b8",    // приглушённый стальной — закрыта
  REJECTED: "#e07b7b",     // красный — отклонена
  REFUNDED: "#c98a6f",     // терракот — возврат
};

// Track tone (рельса воронки) — единый, чтобы не пестрило.
const FUNNEL_TRACK_OPACITY = 0.85;

const countByStatus = (deals: readonly DealRead[]) => {
  const counts = new Map<DealStatus, number>();
  for (const deal of deals) {
    counts.set(deal.status, (counts.get(deal.status) || 0) + 1);
  }
  return counts;
};

/* =========================================================
   Funnel — pipeline progression
   ========================================================= */

type FunnelRow = {
  status: DealStatus;
  count: number;
  width: number; // 0..1, доля относительно самого большого этапа в пайплайне
  share: number; // доля от всех сделок (для подписи %)
};

type FunnelData = {
  rows: FunnelRow[];
  rejected: { count: number; share: number } | null;
  conversion: number | null;
};

const buildFunnel = (deals: readonly DealRead[]): FunnelData => {
  const counts = countByStatus(deals);
  const total = deals.length || 1;
  const pipelineCounts = PIPELINE.map((status) => counts.get(status) || 0);
  // База для длины полосок — самый «толстый» этап. Так невидимое поле
  // выглядит соразмерно: если NEW=1 и PAID=1, обе полоски одинаковые.
  const maxStage = Math.max(0, ...pipelineCounts);

  const rows: FunnelRow[] = PIPELINE.map((status, idx) => {
    const count = pipelineCounts[idx];
    return {
      status,
      count,
      width: maxStage > 0 ? count / maxStage : 0,
      share: count / total,
    };
  });

  const rejectedCount = counts.get("REJECTED") || 0;
  const rejected = rejectedCount > 0
    ? { count: rejectedCount, share: rejectedCount / total }
    : null;

  // Конверсия — от первого ненулевого этапа до последнего ненулевого.
  const firstReached = rows.find((row) => row.count > 0);
  const lastReached = [...rows].reverse().find((row) => row.count > 0);
  const conversion =
    firstReached && lastReached && firstReached.status !== lastReached.status && firstReached.count > 0
      ? Math.round((lastReached.count / firstReached.count) * 100)
      : null;

  return { rows, rejected, conversion };
};

const FunnelChart = ({ deals }: { deals: readonly DealRead[] }) => {
  const data = useMemo(() => buildFunnel(deals), [deals]);
  const hasAny = data.rows.some((row) => row.count > 0);

  return (
    <div className={styles.chartFrame}>
      <header className={styles.chartHeader}>
        <div>
          <p className={styles.chartEyebrow}>Воронка</p>
          <h3 className={styles.chartTitle}>Движение сделок</h3>
        </div>
        {data.conversion !== null ? (
          <span className={styles.chartTotal}>
            конверсия {data.conversion}%
          </span>
        ) : null}
      </header>

      {hasAny ? (
        <ul className={styles.funnel}>
          {data.rows.map((row) => {
            const fillWidth = row.count > 0
              ? Math.max(row.width * 100, 6) // минимальная ширина для визуального присутствия
              : 0;
            return (
              <li key={row.status} className={styles.funnelRow}>
                <span className={styles.funnelLabel}>
                  {formatDealStatus(row.status)}
                </span>
                <div className={styles.funnelTrack}>
                  <div
                    className={styles.funnelFill}
                    style={{
                      width: `${fillWidth}%`,
                      background: STATUS_COLOR[row.status],
                      opacity: row.count > 0 ? FUNNEL_TRACK_OPACITY : 0,
                    }}
                  />
                </div>
                <span className={styles.funnelMetric}>
                  <span className={styles.funnelCount}>{formatNumber(row.count)}</span>
                  <span className={styles.funnelShare}>
                    {Math.round(row.share * 100)}%
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.chartEmpty}>Пока нет сделок в воронке.</p>
      )}

      {data.rejected ? (
        <p className={styles.funnelLost}>
          <span
            className={styles.funnelLostDot}
            style={{ background: STATUS_COLOR.REJECTED }}
            aria-hidden
          />
          <span className={styles.funnelLostText}>
            Отклонено: <strong>{formatNumber(data.rejected.count)}</strong>
          </span>
          <span className={styles.funnelLostShare}>
            {Math.round(data.rejected.share * 100)}% от всех заявок
          </span>
        </p>
      ) : null}
    </div>
  );
};

/* =========================================================
   Donut — distribution by status
   ========================================================= */

type StatusSlice = {
  status: DealStatus;
  count: number;
  fraction: number;
  startAngle: number;
  endAngle: number;
};

const buildSlices = (deals: readonly DealRead[]): StatusSlice[] => {
  const counts = countByStatus(deals);
  const total = deals.length || 1;
  const ordered: DealStatus[] = [...PIPELINE, "REJECTED"];
  let cursor = -Math.PI / 2;
  return ordered
    .filter((status) => (counts.get(status) || 0) > 0)
    .map((status) => {
      const count = counts.get(status) || 0;
      const fraction = count / total;
      const startAngle = cursor;
      const endAngle = cursor + fraction * Math.PI * 2;
      cursor = endAngle;
      return { status, count, fraction, startAngle, endAngle };
    });
};

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

const arcPath = (
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) => {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    `M${startOuter.x.toFixed(2)},${startOuter.y.toFixed(2)}`,
    `A${rOuter},${rOuter} 0 ${largeArc} 1 ${endOuter.x.toFixed(2)},${endOuter.y.toFixed(2)}`,
    `L${startInner.x.toFixed(2)},${startInner.y.toFixed(2)}`,
    `A${rInner},${rInner} 0 ${largeArc} 0 ${endInner.x.toFixed(2)},${endInner.y.toFixed(2)}`,
    "Z",
  ].join(" ");
};

const DonutChart = ({ slices, total }: { slices: StatusSlice[]; total: number }) => {
  const SIZE = 160;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const rOuter = 68;
  const rInner = 48;

  return (
    <div className={styles.chartFrame}>
      <header className={styles.chartHeader}>
        <div>
          <p className={styles.chartEyebrow}>Структура</p>
          <h3 className={styles.chartTitle}>По статусам</h3>
        </div>
        <span className={styles.chartTotal}>{formatNumber(total)} всего</span>
      </header>

      <div className={styles.donutBody}>
        <div className={styles.donutFigure}>
          <svg
            className={styles.donutSvg}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label="Круговая диаграмма распределения сделок по статусам"
          >
          <circle
            cx={cx}
            cy={cy}
            r={(rOuter + rInner) / 2}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={rOuter - rInner}
          />
          {slices.map((slice) => (
            <path
              key={slice.status}
              d={arcPath(cx, cy, rOuter, rInner, slice.startAngle, slice.endAngle)}
              fill={STATUS_COLOR[slice.status]}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={1}
            >
              <title>
                {formatDealStatus(slice.status)}: {slice.count} ({Math.round(slice.fraction * 100)}%)
              </title>
            </path>
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" className={styles.donutTotalNumber}>
            {total}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className={styles.donutTotalLabel}>
            {pluralRu(total, ["сделка", "сделки", "сделок"])}
          </text>
          </svg>
        </div>

        <ul className={styles.legend}>
          {slices.map((slice) => (
            <li key={slice.status} className={styles.legendItem}>
              <span
                className={styles.legendBar}
                style={{ background: STATUS_COLOR[slice.status] }}
                aria-hidden
              />
              <div className={styles.legendBody}>
                <span className={styles.legendLabel}>
                  {formatDealStatus(slice.status)}
                </span>
                <div className={styles.legendMetrics}>
                  <span className={styles.legendNumber}>{slice.count}</span>
                  <span className={styles.legendPct}>
                    {Math.round(slice.fraction * 100)}%
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* =========================================================
   Public component
   ========================================================= */

export const OverviewCharts = ({ deals }: { deals: readonly DealRead[] }) => {
  const slices = useMemo(() => buildSlices(deals), [deals]);

  if (deals.length === 0) {
    return null;
  }

  return (
    <div className={styles.charts}>
      <FunnelChart deals={deals} />
      <DonutChart slices={slices} total={deals.length} />
    </div>
  );
};
