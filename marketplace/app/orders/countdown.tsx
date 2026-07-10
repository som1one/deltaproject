"use client";

/* Счётчики сроков сделки: дедлайн работы и окно приёмки.
   Тикают раз в минуту; ближе суток — оранжевый, просрочка — красный. */

import { useEffect, useState } from "react";

import styles from "./orders.module.css";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Русская плюрализация: pluralRu(3, "день", "дня", "дней") → «дня». */
export const pluralRu = (n: number, one: string, few: string, many: string): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** 274 800 000 мс → «3 дня 4 часа», «5 часов 12 мин.», «42 мин.». */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, ms);
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);

  if (days > 0) {
    const d = `${days} ${pluralRu(days, "день", "дня", "дней")}`;
    return hours > 0 ? `${d} ${hours} ${pluralRu(hours, "час", "часа", "часов")}` : d;
  }
  if (hours > 0) {
    const h = `${hours} ${pluralRu(hours, "час", "часа", "часов")}`;
    return minutes > 0 ? `${h} ${minutes} мин.` : h;
  }
  return `${Math.max(minutes, 1)} мин.`;
};

/** Короткая форма для строки реестра: «3 дн. 4 ч.», «5 ч. 12 м.», «42 м.». */
const formatDurationShort = (ms: number): string => {
  const total = Math.max(0, ms);
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);

  if (days > 0) return hours > 0 ? `${days} дн. ${hours} ч.` : `${days} дн.`;
  if (hours > 0) return minutes > 0 ? `${hours} ч. ${minutes} м.` : `${hours} ч.`;
  return `${Math.max(minutes, 1)} м.`;
};

const ClockIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

type CountdownProps = {
  /** ISO-дата дедлайна: deadline_at (work) или review_deadline_at (review). */
  deadline: string;
  /** work — дедлайн сдачи работы; review — окно приёмки у заказчика. */
  mode: "work" | "review";
  /** Короткая строка для реестра сделок вместо полной фразы. */
  compact?: boolean;
};

export const Countdown = ({ deadline, mode, compact = false }: CountdownProps) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(timer);
  }, []);

  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return null;

  const diff = target - now;
  const overdue = diff <= 0;
  const urgent = !overdue && diff < DAY;

  const tone = overdue
    ? styles.countDanger
    : urgent
      ? styles.countWarn
      : styles.countOk;

  if (compact) {
    const text =
      mode === "work"
        ? overdue
          ? `просрочено на ${formatDurationShort(-diff)}`
          : `осталось ${formatDurationShort(diff)}`
        : overdue
          ? "автоприёмка скоро"
          : `проверка · ${formatDurationShort(diff)}`;
    return (
      <span className={`${styles.countChip} ${tone}`}>
        <ClockIcon />
        {text}
      </span>
    );
  }

  const text =
    mode === "work"
      ? overdue
        ? `Просрочено на ${formatDuration(-diff)}`
        : `До дедлайна — ${formatDuration(diff)}`
      : overdue
        ? "Окно проверки истекло — работа будет принята автоматически"
        : `У заказчика ${formatDuration(diff)} на проверку, дальше — автоприёмка`;

  return (
    <span className={`${styles.count} ${tone}`}>
      <ClockIcon />
      {text}
    </span>
  );
};
