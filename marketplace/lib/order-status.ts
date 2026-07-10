import type { OrderStatus } from "@/lib/types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OFFER_PENDING: "Предложение отправлено",
  OFFER_DECLINED: "Предложение отклонено",
  PENDING_PAYMENT: "Ожидает оплату",
  PAYMENT_FAILED: "Оплата не прошла",
  ESCROW_HELD: "Оплачен · в работе",
  BLOGGER_CONFIRMED: "Работа на проверке",
  COMPLETED: "Завершён",
  REFUNDED: "Возврат",
  CANCELLED: "Отменён",
};

export const orderStatusLabel = (status: string): string =>
  ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

/* ── Штампы реестра ─────────────────────────────────────────
   Короткий текст в верхнем регистре для рамки-печати.
   Тон: active (--loden) · done (--ink) · alert (--oxblood). */

export type StampTone = "active" | "done" | "alert" | "muted";

export const ORDER_STATUS_STAMP: Record<OrderStatus, string> = {
  OFFER_PENDING: "Ждёт принятия",
  OFFER_DECLINED: "Отклонено",
  PENDING_PAYMENT: "Ожидает оплаты",
  PAYMENT_FAILED: "Оплата не прошла",
  ESCROW_HELD: "В работе",
  BLOGGER_CONFIRMED: "На проверке",
  COMPLETED: "Завершён",
  REFUNDED: "Возврат средств",
  CANCELLED: "Отменён",
};

export const ORDER_STATUS_STAMP_TONE: Record<OrderStatus, StampTone> = {
  OFFER_PENDING: "active",
  OFFER_DECLINED: "muted",
  PENDING_PAYMENT: "active",
  PAYMENT_FAILED: "alert",
  ESCROW_HELD: "active",
  BLOGGER_CONFIRMED: "active",
  COMPLETED: "done",
  REFUNDED: "alert",
  CANCELLED: "muted",
};

export const orderStampLabel = (status: string): string =>
  ORDER_STATUS_STAMP[status as OrderStatus] ?? status;

export const orderStampTone = (status: string): StampTone =>
  ORDER_STATUS_STAMP_TONE[status as OrderStatus] ?? "muted";

/** «Где сейчас деньги» — главный текст доверия во флоу сделки. */
export const ORDER_MONEY_LOCATION: Record<OrderStatus, string> = {
  OFFER_PENDING: "Оплата ещё не требуется",
  OFFER_DECLINED: "Перевод не потребовался",
  PENDING_PAYMENT: "Ожидает перевода",
  PAYMENT_FAILED: "Не поступила",
  ESCROW_HELD: "На счёте платформы",
  BLOGGER_CONFIRMED: "На счёте платформы",
  COMPLETED: "Передана автору",
  REFUNDED: "Возвращена заказчику",
  CANCELLED: "Перевод не потребовался",
};

export const orderMoneyLocation = (status: string): string =>
  ORDER_MONEY_LOCATION[status as OrderStatus] ?? "—";

/** Активные статусы (сделка живая) — используются в кабинете и реестре. */
export const ACTIVE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "OFFER_PENDING",
  "PENDING_PAYMENT",
  "ESCROW_HELD",
  "BLOGGER_CONFIRMED",
]);

/** Терминальные статусы — история. */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "COMPLETED",
  "REFUNDED",
  "CANCELLED",
  "OFFER_DECLINED",
  "PAYMENT_FAILED",
]);
