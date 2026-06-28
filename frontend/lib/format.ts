export const formatMoney = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value / 100);

export const formatNumber = (value: number) => new Intl.NumberFormat("ru-RU").format(value);

export const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

export const formatShortDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
      }).format(new Date(value))
    : "—";

export const pluralRu = (count: number, forms: readonly [string, string, string]): string => {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
};

export const formatRole = (role: string) => {
  switch (role) {
    case "Worker":
      return "Работник";
    case "Bloger":
      return "Блогер";
    case "Admin":
      return "Администратор";
    case "Client":
      return "Клиент";
    default:
      return role;
  }
};

export const formatDealStatus = (status: string) => {
  switch (status) {
    case "NEW":
      return "Новая";
    case "REVIEW":
      return "Проверка";
    case "CONFIRMED":
      return "Подтверждена";
    case "ESCROW_HELD":
      return "Эскроу";
    case "PAID":
      return "Оплачена";
    case "COMPLETED":
      return "Выполнена";
    case "REJECTED":
      return "Отклонена";
    case "REFUNDED":
      return "Возврат";
    default:
      return status;
  }
};

export const dealStatusTone = (
  status: string,
): "active" | "success" | "muted" | "danger" | "default" | "completed" => {
  switch (status) {
    case "NEW":
    case "REVIEW":
    case "CONFIRMED":
    case "ESCROW_HELD":
      return "active";
    case "PAID":
      return "success";
    case "COMPLETED":
      return "completed";
    case "REJECTED":
    case "REFUNDED":
      return "danger";
    default:
      return "default";
  }
};

export const formatLedgerStatus = (status: string) => {
  switch (status) {
    case "payout_request":
      return "Запрос выплаты";
    case "freeze":
      return "Заморозка";
    case "pending_confirmation":
      return "Ожидает подтверждения";
    case "completed":
      return "Завершено";
    case "rejected":
      return "Отклонено";
    default:
      return status;
  }
};
