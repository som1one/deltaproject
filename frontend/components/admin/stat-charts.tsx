"use client";

import type { DailyCountPoint } from "@/lib/types";
import styles from "@/components/admin/stat-charts.module.css";

/**
 * Графики раздела «Статистика» админки. Чистый SVG без библиотек:
 * дневные ряды приходят с бэкенда уже zero-filled, компонент только рисует.
 */

const VIEW_W = 640;
const VIEW_H = 200;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const PAD_LEFT = 8;
const PAD_RIGHT = 34;

/** Верх шкалы: «красивое» число, чтобы сетка не плясала от выбросов. */
const niceMax = (value: number): number => {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const unit = value / pow;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return step * pow;
};

const formatDayLabel = (isoDate: string): string => {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
};

/** Шаг подписей оси X, чтобы они не слипались на длинных периодах. */
const labelEvery = (count: number): number => {
  if (count <= 14) return 2;
  if (count <= 31) return 5;
  if (count <= 60) return 10;
  return 15;
};

export const DailyBarsChart = ({
  points,
  ariaLabel,
}: {
  points: DailyCountPoint[];
  ariaLabel: string;
}) => {
  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + innerH;

  const maxCount = points.reduce((acc, point) => Math.max(acc, point.count), 0);
  const scaleMax = niceMax(maxCount);
  const slotW = points.length > 0 ? innerW / points.length : innerW;
  const barW = Math.max(1.5, slotW * 0.62);
  const step = labelEvery(points.length);
  const isEmpty = maxCount === 0;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Hairline-сетка по четвертям шкалы, подписи — 0 и максимум */}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            className={styles.gridLine}
            x1={PAD_LEFT}
            x2={PAD_LEFT + innerW}
            y1={PAD_TOP + innerH * fraction}
            y2={PAD_TOP + innerH * fraction}
          />
        ))}
        <line
          className={styles.baseLine}
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={baselineY}
          y2={baselineY}
        />
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={PAD_TOP + 4}>
          {scaleMax}
        </text>
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={baselineY + 4}>
          0
        </text>

        {points.map((point, index) => {
          const height = (point.count / scaleMax) * innerH;
          const x = PAD_LEFT + slotW * index + (slotW - barW) / 2;
          const isLast = index === points.length - 1;
          return (
            <rect
              key={point.date}
              className={`${styles.bar}${isLast ? ` ${styles.barLast}` : ""}`}
              x={x}
              y={baselineY - height}
              width={barW}
              height={Math.max(height, point.count > 0 ? 2 : 0)}
            >
              <title>{`${formatDayLabel(point.date)} — ${point.count}`}</title>
            </rect>
          );
        })}

        {points.map((point, index) => {
          const showLabel = index === points.length - 1 || index % step === 0;
          if (!showLabel) return null;
          // Не даём предпоследней подписи налезть на последнюю
          if (index !== points.length - 1 && points.length - 1 - index < step / 2) return null;
          const x = PAD_LEFT + slotW * index + slotW / 2;
          return (
            <text
              key={`label-${point.date}`}
              className={styles.axisLabel}
              x={x}
              y={VIEW_H - 8}
              textAnchor="middle"
            >
              {formatDayLabel(point.date)}
            </text>
          );
        })}

        {isEmpty ? (
          <text
            className={styles.emptyNote}
            x={PAD_LEFT + innerW / 2}
            y={PAD_TOP + innerH / 2}
            textAnchor="middle"
          >
            Пока нет данных за период
          </text>
        ) : null}
      </svg>
    </div>
  );
};

export const CHART_RANGES = [14, 30, 90] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const ChartRangeSwitch = ({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (next: ChartRange) => void;
}) => (
  <div className={styles.rangeRow}>
    <span className={styles.rangeLabel}>Период</span>
    {CHART_RANGES.map((range) => (
      <button
        key={range}
        type="button"
        className={`${styles.rangeButton}${value === range ? ` ${styles.rangeButtonActive}` : ""}`}
        onClick={() => onChange(range)}
      >
        {range} дней
      </button>
    ))}
  </div>
);
