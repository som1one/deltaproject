import type { OrderStatus } from "@/lib/types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Ожидает оплату",
  PAYMENT_FAILED: "Оплата не прошла",
  ESCROW_HELD: "Оплачен · в работе",
  BLOGGER_CONFIRMED: "Выполнен блогером",
  COMPLETED: "Завершён",
  REFUNDED: "Возврат",
  CANCELLED: "Отменён",
};

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "bronze";

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING_PAYMENT: "warning",
  PAYMENT_FAILED: "danger",
  ESCROW_HELD: "info",
  BLOGGER_CONFIRMED: "bronze",
  COMPLETED: "success",
  REFUNDED: "danger",
  CANCELLED: "neutral",
};

export const orderStatusLabel = (status: string): string =>
  ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

export const orderStatusTone = (status: string): BadgeTone =>
  ORDER_STATUS_TONE[status as OrderStatus] ?? "neutral";
