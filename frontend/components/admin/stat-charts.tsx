"use client";

import type { DailyCountPoint } from "@/lib/types";
import styles from "@/components/admin/stat-charts.module.css";

/**
 * Графики раздела «Статистика» админки. Чистый SVG без библиотек:
 * дневные ряды приходят с бэкенда уже zero-filled, компонент только рисует.
 */

const VIEW_W = 960;
const VIEW_H = 170;
const PAD_TOP = 22;
const PAD_BOTTOM = 24;
const PAD_LEFT = 8;
const PAD_RIGHT = 36;

/** Верх шкалы. Для малых значений — впритык (+1), чтобы столбики не тонули. */
const scaleTop = (maxCount: number): number => {
  if (maxCount <= 0) return 4;
  if (maxCount <= 4) return maxCount + 1;
  const pow = 10 ** Math.floor(Math.log10(maxCount));
  const unit = maxCount / pow;
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
  const scaleMax = scaleTop(maxCount);
  const slotW = points.length > 0 ? innerW / points.length : innerW;
  const barW = Math.max(2, slotW * 0.62);
  const step = labelEvery(points.length);
  const isEmpty = maxCount === 0;
  // Цифры над столбиками — только когда их немного и они не слипнутся
  const showValues = points.length <= 31 && !isEmpty;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
      >
        <line
          className={styles.gridLine}
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={PAD_TOP + innerH * 0.5}
          y2={PAD_TOP + innerH * 0.5}
        />
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
            <g key={point.date}>
              <rect
                className={`${styles.bar}${isLast ? ` ${styles.barLast}` : ""}`}
                x={x}
                y={baselineY - height}
                width={barW}
                height={Math.max(height, point.count > 0 ? 2 : 0)}
              >
                <title>{`${formatDayLabel(point.date)} — ${point.count}`}</title>
              </rect>
              {showValues && point.count > 0 ? (
                <text
                  className={styles.valueLabel}
                  x={x + barW / 2}
                  y={baselineY - height - 5}
                  textAnchor="middle"
                >
                  {point.count}
                </text>
              ) : null}
            </g>
          );
        })}

        {points.map((point, index) => {
          const showLabel = index === points.length - 1 || index % step === 0;
          if (!showLabel) return null;
          // Не даём предпоследней подписи налезть на последнюю
          if (index !== points.length - 1 && points.length - 1 - index < step / 2) return null;
          const x = PAD_LEFT + slotW * index + slotW / 2;
          const isLast = index === points.length - 1;
          return (
            <text
              key={`label-${point.date}`}
              className={isLast ? styles.axisLabelToday : styles.axisLabel}
              x={x}
              y={VIEW_H - 6}
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

/* ------------------------------------------------------------------ */
/* Общие помощники для денежных графиков                               */
/* ------------------------------------------------------------------ */

/** Короткий формат денег для осей и подписей: «870 ₽», «12,5 тыс ₽», «1,2 млн ₽». */
export const formatShortMoney = (kopeks: number): string => {
  const rub = kopeks / 100;
  if (rub >= 1_000_000) {
    return `${(rub / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  }
  if (rub >= 10_000) {
    return `${Math.round(rub / 1_000).toLocaleString("ru-RU")} тыс ₽`;
  }
  if (rub >= 1_000) {
    return `${(rub / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс ₽`;
  }
  return `${Math.round(rub).toLocaleString("ru-RU")} ₽`;
};

export type DailyMoneyPoint = { date: string; count: number; amount_kopeks: number };

/* ------------------------------------------------------------------ */
/* Area-график денег по дням (оборот, доход платформы)                 */
/* ------------------------------------------------------------------ */

export const MoneyAreaChart = ({
  points,
  ariaLabel,
  countNoun = "операций",
}: {
  points: DailyMoneyPoint[];
  ariaLabel: string;
  countNoun?: string;
}) => {
  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT - 24;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + innerH;

  const maxAmount = points.reduce((acc, point) => Math.max(acc, point.amount_kopeks), 0);
  const scaleMax = scaleTop(maxAmount);
  const slotW = points.length > 0 ? innerW / points.length : innerW;
  const step = labelEvery(points.length);
  const isEmpty = maxAmount === 0;

  const xAt = (index: number) => PAD_LEFT + slotW * index + slotW / 2;
  const yAt = (amount: number) => baselineY - (amount / scaleMax) * innerH;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)} ${yAt(point.amount_kopeks).toFixed(1)}`)
    .join(" ");
  const areaPath =
    points.length > 1
      ? `${linePath} L${xAt(points.length - 1).toFixed(1)} ${baselineY} L${xAt(0).toFixed(1)} ${baselineY} Z`
      : "";
  const last = points[points.length - 1];

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel}>
        <line
          className={styles.gridLine}
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={PAD_TOP + innerH * 0.5}
          y2={PAD_TOP + innerH * 0.5}
        />
        <line className={styles.baseLine} x1={PAD_LEFT} x2={PAD_LEFT + innerW} y1={baselineY} y2={baselineY} />
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={PAD_TOP + 4}>
          {formatShortMoney(scaleMax)}
        </text>
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={PAD_TOP + innerH * 0.5 + 4}>
          {formatShortMoney(scaleMax / 2)}
        </text>
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={baselineY + 4}>
          0
        </text>

        {!isEmpty && areaPath ? <path className={styles.areaFill} d={areaPath} /> : null}
        {!isEmpty ? <path className={styles.areaLine} d={linePath} /> : null}
        {!isEmpty && last ? (
          <circle className={styles.areaDot} cx={xAt(points.length - 1)} cy={yAt(last.amount_kopeks)} r={3.2} />
        ) : null}

        {points.map((point, index) => (
          <rect
            key={`hover-${point.date}`}
            className={styles.hoverCol}
            x={PAD_LEFT + slotW * index}
            y={PAD_TOP}
            width={slotW}
            height={innerH}
          >
            <title>
              {`${formatDayLabel(point.date)} — ${formatShortMoney(point.amount_kopeks)} · ${point.count} ${countNoun}`}
            </title>
          </rect>
        ))}

        {points.map((point, index) => {
          const showLabel = index === points.length - 1 || index % step === 0;
          if (!showLabel) return null;
          if (index !== points.length - 1 && points.length - 1 - index < step / 2) return null;
          const isLast = index === points.length - 1;
          return (
            <text
              key={`label-${point.date}`}
              className={isLast ? styles.axisLabelToday : styles.axisLabel}
              x={xAt(index)}
              y={VIEW_H - 6}
              textAnchor="middle"
            >
              {formatDayLabel(point.date)}
            </text>
          );
        })}

        {isEmpty ? (
          <text className={styles.emptyNote} x={PAD_LEFT + innerW / 2} y={PAD_TOP + innerH / 2} textAnchor="middle">
            Пока нет данных за период
          </text>
        ) : null}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Столбики денег по дням (суммы в тултипах)                           */
/* ------------------------------------------------------------------ */

export const MoneyBarsChart = ({
  points,
  ariaLabel,
  countNoun = "операций",
}: {
  points: DailyMoneyPoint[];
  ariaLabel: string;
  countNoun?: string;
}) => {
  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT - 24;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + innerH;

  const maxAmount = points.reduce((acc, point) => Math.max(acc, point.amount_kopeks), 0);
  const scaleMax = scaleTop(maxAmount);
  const slotW = points.length > 0 ? innerW / points.length : innerW;
  const barW = Math.max(2, slotW * 0.62);
  const step = labelEvery(points.length);
  const isEmpty = maxAmount === 0;

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel}>
        <line
          className={styles.gridLine}
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={PAD_TOP + innerH * 0.5}
          y2={PAD_TOP + innerH * 0.5}
        />
        <line className={styles.baseLine} x1={PAD_LEFT} x2={PAD_LEFT + innerW} y1={baselineY} y2={baselineY} />
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={PAD_TOP + 4}>
          {formatShortMoney(scaleMax)}
        </text>
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={baselineY + 4}>
          0
        </text>

        {points.map((point, index) => {
          const height = (point.amount_kopeks / scaleMax) * innerH;
          const x = PAD_LEFT + slotW * index + (slotW - barW) / 2;
          const isLast = index === points.length - 1;
          return (
            <rect
              key={point.date}
              className={`${styles.bar}${isLast ? ` ${styles.barLast}` : ""}`}
              x={x}
              y={baselineY - height}
              width={barW}
              height={Math.max(height, point.amount_kopeks > 0 ? 2 : 0)}
            >
              <title>
                {`${formatDayLabel(point.date)} — ${formatShortMoney(point.amount_kopeks)} · ${point.count} ${countNoun}`}
              </title>
            </rect>
          );
        })}

        {points.map((point, index) => {
          const showLabel = index === points.length - 1 || index % step === 0;
          if (!showLabel) return null;
          if (index !== points.length - 1 && points.length - 1 - index < step / 2) return null;
          const x = PAD_LEFT + slotW * index + slotW / 2;
          const isLast = index === points.length - 1;
          return (
            <text
              key={`label-${point.date}`}
              className={isLast ? styles.axisLabelToday : styles.axisLabel}
              x={x}
              y={VIEW_H - 6}
              textAnchor="middle"
            >
              {formatDayLabel(point.date)}
            </text>
          );
        })}

        {isEmpty ? (
          <text className={styles.emptyNote} x={PAD_LEFT + innerW / 2} y={PAD_TOP + innerH / 2} textAnchor="middle">
            Пока нет данных за период
          </text>
        ) : null}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Стек-столбики: две серии по дням (например заказчики/авторы)        */
/* ------------------------------------------------------------------ */

export type DailyTwoSeriesPoint = { date: string; primary: number; secondary: number };

export const StackedDailyBarsChart = ({
  points,
  ariaLabel,
  primaryLabel,
  secondaryLabel,
}: {
  points: DailyTwoSeriesPoint[];
  ariaLabel: string;
  primaryLabel: string;
  secondaryLabel: string;
}) => {
  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + innerH;

  const maxTotal = points.reduce((acc, point) => Math.max(acc, point.primary + point.secondary), 0);
  const scaleMax = scaleTop(maxTotal);
  const slotW = points.length > 0 ? innerW / points.length : innerW;
  const barW = Math.max(2, slotW * 0.62);
  const step = labelEvery(points.length);
  const isEmpty = maxTotal === 0;

  return (
    <div className={styles.chartWrap}>
      <div className={styles.legendRow} aria-hidden>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} />
          {primaryLabel}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.legendSwatchSoft}`} />
          {secondaryLabel}
        </span>
      </div>
      <svg className={styles.chartSvg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel}>
        <line
          className={styles.gridLine}
          x1={PAD_LEFT}
          x2={PAD_LEFT + innerW}
          y1={PAD_TOP + innerH * 0.5}
          y2={PAD_TOP + innerH * 0.5}
        />
        <line className={styles.baseLine} x1={PAD_LEFT} x2={PAD_LEFT + innerW} y1={baselineY} y2={baselineY} />
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={PAD_TOP + 4}>
          {scaleMax}
        </text>
        <text className={styles.axisLabel} x={PAD_LEFT + innerW + 6} y={baselineY + 4}>
          0
        </text>

        {points.map((point, index) => {
          const x = PAD_LEFT + slotW * index + (slotW - barW) / 2;
          const primaryH = (point.primary / scaleMax) * innerH;
          const secondaryH = (point.secondary / scaleMax) * innerH;
          const gap = point.primary > 0 && point.secondary > 0 ? 2 : 0;
          return (
            <g key={point.date}>
              {point.primary > 0 ? (
                <rect
                  className={styles.bar}
                  x={x}
                  y={baselineY - primaryH}
                  width={barW}
                  height={Math.max(primaryH, 2)}
                />
              ) : null}
              {point.secondary > 0 ? (
                <rect
                  className={styles.barSoft}
                  x={x}
                  y={baselineY - primaryH - gap - secondaryH}
                  width={barW}
                  height={Math.max(secondaryH, 2)}
                />
              ) : null}
              <rect className={styles.hoverCol} x={PAD_LEFT + slotW * index} y={PAD_TOP} width={slotW} height={innerH}>
                <title>
                  {`${formatDayLabel(point.date)} — ${primaryLabel.toLowerCase()}: ${point.primary}, ${secondaryLabel.toLowerCase()}: ${point.secondary}`}
                </title>
              </rect>
            </g>
          );
        })}

        {points.map((point, index) => {
          const showLabel = index === points.length - 1 || index % step === 0;
          if (!showLabel) return null;
          if (index !== points.length - 1 && points.length - 1 - index < step / 2) return null;
          const x = PAD_LEFT + slotW * index + slotW / 2;
          const isLast = index === points.length - 1;
          return (
            <text
              key={`label-${point.date}`}
              className={isLast ? styles.axisLabelToday : styles.axisLabel}
              x={x}
              y={VIEW_H - 6}
              textAnchor="middle"
            >
              {formatDayLabel(point.date)}
            </text>
          );
        })}

        {isEmpty ? (
          <text className={styles.emptyNote} x={PAD_LEFT + innerW / 2} y={PAD_TOP + innerH / 2} textAnchor="middle">
            Пока нет данных за период
          </text>
        ) : null}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Донат: распределение с легендой (моно-палитра через прозрачность)   */
/* ------------------------------------------------------------------ */

export type DonutSlice = { label: string; value: number; hint?: string };

const DONUT_OPACITIES = [1, 0.72, 0.52, 0.36, 0.24, 0.16, 0.11, 0.07, 0.05];

export const DonutChart = ({
  slices,
  centerLabel,
  ariaLabel,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  ariaLabel: string;
}) => {
  const total = slices.reduce((acc, slice) => acc + slice.value, 0);
  const R = 56;
  const STROKE = 24;
  const C = 2 * Math.PI * R;
  const GAP = slices.filter((slice) => slice.value > 0).length > 1 ? 2.5 : 0;

  let offset = 0;
  const arcs = slices.map((slice, index) => {
    const share = total > 0 ? slice.value / total : 0;
    const len = Math.max(share * C - GAP, 0);
    const arc = { slice, index, share, len, start: offset };
    offset += share * C;
    return arc;
  });

  return (
    <div className={styles.donutWrap} role="img" aria-label={ariaLabel}>
      <svg className={styles.donutSvg} viewBox="0 0 160 160">
        <circle cx={80} cy={80} r={R} className={styles.donutTrack} strokeWidth={STROKE} />
        {total > 0
          ? arcs
              .filter((arc) => arc.len > 0)
              .map((arc) => (
                <circle
                  key={arc.slice.label}
                  cx={80}
                  cy={80}
                  r={R}
                  className={styles.donutArc}
                  strokeWidth={STROKE}
                  strokeOpacity={DONUT_OPACITIES[arc.index % DONUT_OPACITIES.length]}
                  strokeDasharray={`${arc.len.toFixed(2)} ${(C - arc.len).toFixed(2)}`}
                  strokeDashoffset={(-arc.start - GAP / 2).toFixed(2)}
                >
                  <title>{`${arc.slice.label} — ${arc.slice.value} (${Math.round(arc.share * 100)}%)`}</title>
                </circle>
              ))
          : null}
        <text className={styles.donutCenterValue} x={80} y={78} textAnchor="middle">
          {total.toLocaleString("ru-RU")}
        </text>
        <text className={styles.donutCenterLabel} x={80} y={94} textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <ul className={styles.donutLegend}>
        {slices.map((slice, index) => (
          <li key={slice.label} className={styles.donutLegendItem}>
            <span
              className={styles.legendSwatch}
              style={{ opacity: DONUT_OPACITIES[index % DONUT_OPACITIES.length] }}
            />
            <span className={styles.donutLegendLabel}>{slice.label}</span>
            <span className={styles.donutLegendValue}>
              {slice.value.toLocaleString("ru-RU")}
              {total > 0 ? ` · ${Math.round((slice.value / total) * 100)}%` : ""}
              {slice.hint ? ` · ${slice.hint}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Горизонтальные бары: топы, услуги, оценки                           */
/* ------------------------------------------------------------------ */

export type HBarItem = {
  label: string;
  value: number;
  valueLabel: string;
  hint?: string;
  /** Задан — строка кликабельна (например, переход в карточку участника). */
  onSelect?: () => void;
};

export const HBarList = ({ items, emptyText }: { items: HBarItem[]; emptyText: string }) => {
  const max = items.reduce((acc, item) => Math.max(acc, item.value), 0);
  if (items.length === 0 || max === 0) {
    return <p className={styles.chartEmptyText}>{emptyText}</p>;
  }
  return (
    <ul className={styles.hbarList}>
      {items.map((item, index) => (
        <li
          key={`${item.label}-${index}`}
          className={`${styles.hbarRow}${item.onSelect ? ` ${styles.hbarRowClickable}` : ""}`}
          onClick={item.onSelect}
          onKeyDown={
            item.onSelect
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    item.onSelect?.();
                  }
                }
              : undefined
          }
          role={item.onSelect ? "button" : undefined}
          tabIndex={item.onSelect ? 0 : undefined}
        >
          <div className={styles.hbarHead}>
            <span className={styles.hbarLabel} title={item.label}>
              {item.label}
              {item.hint ? <span className={styles.hbarHint}> {item.hint}</span> : null}
            </span>
            <span className={styles.hbarValue}>{item.valueLabel}</span>
          </div>
          <div className={styles.hbarTrack}>
            <div className={styles.hbarFill} style={{ width: `${Math.max((item.value / max) * 100, 1)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

/* ------------------------------------------------------------------ */
/* Воронка когорты заказов                                             */
/* ------------------------------------------------------------------ */

export type FunnelItem = { label: string; count: number };

export const FunnelChart = ({ stages, emptyText }: { stages: FunnelItem[]; emptyText: string }) => {
  const first = stages[0]?.count ?? 0;
  if (first === 0) {
    return <p className={styles.chartEmptyText}>{emptyText}</p>;
  }
  return (
    <ul className={styles.funnelList}>
      {stages.map((stage, index) => {
        const share = first > 0 ? stage.count / first : 0;
        const prev = index > 0 ? stages[index - 1].count : 0;
        const stepPct = index > 0 && prev > 0 ? Math.round((stage.count / prev) * 100) : null;
        return (
          <li key={stage.label} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{stage.label}</span>
            <div className={styles.funnelTrack}>
              <div className={styles.funnelFill} style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
            </div>
            <span className={styles.funnelValue}>
              {stage.count.toLocaleString("ru-RU")}
              <span className={styles.funnelShare}>
                {index === 0 ? "100%" : `${Math.round(share * 100)}%${stepPct !== null ? ` · шаг ${stepPct}%` : ""}`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};

/* ------------------------------------------------------------------ */
/* Вертикальная гистограмма (чеки)                                     */
/* ------------------------------------------------------------------ */

export type HistogramItem = { label: string; count: number };

export const ColumnHistogram = ({ items, ariaLabel }: { items: HistogramItem[]; ariaLabel: string }) => {
  const innerW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + innerH;
  const maxCount = items.reduce((acc, item) => Math.max(acc, item.count), 0);
  const scaleMax = scaleTop(maxCount);
  const slotW = items.length > 0 ? innerW / items.length : innerW;
  const barW = Math.max(6, slotW * 0.5);
  const isEmpty = maxCount === 0;

  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chartSvg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel}>
        <line className={styles.baseLine} x1={PAD_LEFT} x2={PAD_LEFT + innerW} y1={baselineY} y2={baselineY} />
        {items.map((item, index) => {
          const height = (item.count / scaleMax) * innerH;
          const x = PAD_LEFT + slotW * index + (slotW - barW) / 2;
          return (
            <g key={item.label}>
              <rect
                className={styles.bar}
                x={x}
                y={baselineY - height}
                width={barW}
                height={Math.max(height, item.count > 0 ? 2 : 0)}
              >
                <title>{`${item.label} — ${item.count}`}</title>
              </rect>
              {item.count > 0 ? (
                <text
                  className={styles.valueLabel}
                  x={x + barW / 2}
                  y={baselineY - height - 5}
                  textAnchor="middle"
                >
                  {item.count}
                </text>
              ) : null}
              <text className={styles.axisLabel} x={x + barW / 2} y={VIEW_H - 6} textAnchor="middle">
                {item.label}
              </text>
            </g>
          );
        })}
        {isEmpty ? (
          <text className={styles.emptyNote} x={PAD_LEFT + innerW / 2} y={PAD_TOP + innerH / 2} textAnchor="middle">
            Пока нет оплат за период
          </text>
        ) : null}
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Теплокарта активности: 7 дней × 24 часа (МСК)                       */
/* ------------------------------------------------------------------ */

const HEAT_DOW_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const ActivityHeatmap = ({ grid, ariaLabel }: { grid: number[][]; ariaLabel: string }) => {
  const LEFT = 34;
  const GAP = 2.5;
  const innerW = VIEW_W - LEFT - 6;
  const cellW = (innerW - GAP * 23) / 24;
  const cellH = 17;
  const height = 6 + 7 * (cellH + GAP) + 18;
  const max = grid.reduce((acc, row) => row.reduce((a, v) => Math.max(a, v), acc), 0);

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        style={{ maxHeight: 300 }}
        role="img"
        aria-label={ariaLabel}
      >
        {grid.map((row, dow) => (
          <g key={HEAT_DOW_LABELS[dow]}>
            <text
              className={styles.axisLabel}
              x={LEFT - 8}
              y={6 + dow * (cellH + GAP) + cellH / 2 + 3.5}
              textAnchor="end"
            >
              {HEAT_DOW_LABELS[dow]}
            </text>
            {row.map((value, hour) => {
              const opacity = value > 0 && max > 0 ? 0.14 + 0.86 * (value / max) : 0;
              return (
                <rect
                  key={`${dow}-${hour}`}
                  className={value > 0 ? styles.heatCell : styles.heatCellEmpty}
                  x={LEFT + hour * (cellW + GAP)}
                  y={6 + dow * (cellH + GAP)}
                  width={cellW}
                  height={cellH}
                  rx={2.5}
                  style={value > 0 ? { fillOpacity: opacity } : undefined}
                >
                  <title>{`${HEAT_DOW_LABELS[dow]} ${String(hour).padStart(2, "0")}:00 — ${value}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((hour) => (
          <text
            key={`hour-${hour}`}
            className={styles.axisLabel}
            x={LEFT + hour * (cellW + GAP) + cellW / 2}
            y={height - 4}
            textAnchor="middle"
          >
            {hour}
          </text>
        ))}
        {max === 0 ? (
          <text className={styles.emptyNote} x={LEFT + innerW / 2} y={height / 2} textAnchor="middle">
            Пока нет активности за период
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
