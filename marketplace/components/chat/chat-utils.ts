import type { ChatMessage, ChatPartner } from "@/lib/types";

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** «14:05» — время сообщения в углу пузыря. */
export const timeShort = (iso: string): string =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Время в списке тредов: сегодня — только часы, дальше — дата. */
export const threadTime = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return timeShort(iso);
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d);
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(d);
};

/** Подпись разделителя дня в ленте: «Сегодня» / «Вчера» / «5 июля». */
export const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return "Сегодня";
  if (isSameDay(d, yesterday)) return "Вчера";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };
  return new Intl.DateTimeFormat("ru-RU", opts).format(d);
};

/** Ключ дня для группировки сообщений. */
export const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Превью последнего сообщения в списке тредов. */
export const previewText = (message: ChatMessage): string => {
  if (message.kind === "offer") return "📋 Предложение услуги";
  if (message.kind === "image") return message.text ? `📷 ${message.text}` : "📷 Фото";
  return message.text;
};

/** Роль собеседника человеческим словом. */
export const roleCaption = (partner: ChatPartner): string =>
  partner.is_blogger ? "автор" : "заказчик";

/** Русская плюрализация: plural(3, ["отзыв", "отзыва", "отзывов"]). */
export const plural = (n: number, forms: [string, string, string]): string => {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
};
