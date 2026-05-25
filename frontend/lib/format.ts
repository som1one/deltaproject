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

export const formatRole = (role: string) => {
  switch (role) {
    case "Worker":
      return "Работник";
    case "Bloger":
      return "Блогер";
    case "Admin":
      return "Администратор";
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
    case "PAID":
      return "Оплачена";
    case "COMPLETED":
      return "Выполнена";
    case "REJECTED":
      return "Отклонена";
    default:
      return status;
  }
};

export const dealStatusTone = (
  status: string,
): "active" | "success" | "muted" | "danger" | "default" => {
  switch (status) {
    case "NEW":
    case "REVIEW":
    case "CONFIRMED":
      return "active";
    case "PAID":
      return "success";
    case "COMPLETED":
      return "muted";
    case "REJECTED":
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
