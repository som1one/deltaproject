export const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(value))
    : "—";

/** Копейки → «12 500 ₽» (без копеек, если ровно). */
export const formatMoney = (kopeks: number | null | undefined): string => {
  if (kopeks == null) return "—";
  const rub = kopeks / 100;
  const hasCents = kopeks % 100 !== 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(rub);
};

/** 1 234 567 → «1,2 млн», 45 600 → «45,6K». */
export const formatAudience = (count: number | null | undefined): string => {
  if (count == null) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (count >= 1_000) return `${(count / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}K`;
  return count.toLocaleString("ru-RU");
};

/** «1234 5678 9012 3456» из сплошного номера карты. */
export const formatCardNumber = (pan: string): string =>
  pan.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
