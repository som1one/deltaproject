"use client";

import { useState, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest, ApiError } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";

import styles from "./marketplace-panel.module.css";

/* ---------- Types ---------- */

type DashboardStats = {
  total_orders: number;
  total_revenue_kopeks: number;
  active_bloggers: number;
  registered_clients: number;
};

type AdminOrder = {
  id: string;
  client_name: string;
  blogger_name: string;
  amount_kopeks: number;
  status: string;
  created_at: string;
  payment_reported_at: string | null;
};

type PaymentSettings = {
  card_number: string | null;
  card_holder: string | null;
  card_bank: string | null;
  sbp_phone: string | null;
  yookassa_shop_id: string | null;
  yookassa_secret_set: boolean;
  yookassa_enabled: boolean;
};

type SettlementAccount = {
  account_number: string;
  bic: string;
  bank_name: string;
  recipient_name: string;
};

type AdminOrdersResponse = {
  items: AdminOrder[];
  total: number;
  page: number;
};

type CommissionSettings = {
  platform_commission_pct: string;
  worker_referral_commission_pct: string;
};

type SupportTicket = {
  id: string;
  subject: string;
  order_id: string | null;
  submitter_name: string;
  submitter_role: string;
  message: string;
  status: string;
  created_at: string;
  order_status: string | null;
  order_amount_kopeks: number | null;
};

type TicketsResponse = {
  items: SupportTicket[];
  total: number;
};

type BloggerAdmin = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subscriber_count: number;
  average_price_kopeks: number;
  engagement_rate?: number | null;
  rating?: number | null;
  reviews_count?: number;
  is_active: boolean;
};

type BloggersResponse = {
  items: BloggerAdmin[];
  total: number;
};

type ServiceType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type AudienceSubmission = {
  id: string;
  profile_id: string;
  status: string;
  payload: Record<string, unknown>;
  screenshots: string[];
  review_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  blogger_user_id: string;
  blogger_name: string;
  blogger_category: string | null;
  subscriber_count: number | null;
};

type PremiumRequest = {
  id: string;
  user_id: string;
  status: string;
  comment: string | null;
  created_at: string;
  resolved_at: string | null;
  blogger_name: string | null;
  blogger_email: string | null;
};

type AdminWithdrawal = {
  id: string;
  user_id: string;
  amount_kopeks: number;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  user_name: string;
  user_email: string;
  user_role: string;
  card_last4: string | null;
  card_brand: string | null;
  card_bank: string | null;
  card_holder: string | null;
};

type AdminWithdrawalsResponse = {
  items: AdminWithdrawal[];
  total: number;
};

export type AdminMarketplaceTab =
  | "dashboard"
  | "orders"
  | "payments"
  | "settings"
  | "tickets"
  | "bloggers"
  | "hero"
  | "services"
  | "moderation"
  | "premium"
  | "withdrawals";

/* ---------- Helpers ---------- */

function formatRubles(kopeks: number): string {
  const rubles = kopeks / 100;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(rubles);
}

function formatStatus(status: string): string {
  switch (status) {
    case "PENDING_PAYMENT": return "Ожидает оплаты";
    case "PAYMENT_FAILED": return "Ошибка оплаты";
    case "ESCROW_HELD": return "Эскроу";
    case "BLOGGER_CONFIRMED": return "Подтверждён";
    case "COMPLETED": return "Завершён";
    case "REFUNDED": return "Возврат";
    case "CANCELLED": return "Отменён";
    default: return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "PENDING_PAYMENT": return styles.statusPending;
    case "PAYMENT_FAILED": return styles.statusFailed;
    case "ESCROW_HELD": return styles.statusEscrow;
    case "BLOGGER_CONFIRMED": return styles.statusConfirmed;
    case "COMPLETED": return styles.statusCompleted;
    case "REFUNDED": return styles.statusRefunded;
    default: return "";
  }
}

const ORDER_STATUSES = [
  { value: "", label: "Все статусы" },
  { value: "PENDING_PAYMENT", label: "Ожидает оплаты" },
  { value: "PAYMENT_FAILED", label: "Ошибка оплаты" },
  { value: "ESCROW_HELD", label: "Эскроу" },
  { value: "BLOGGER_CONFIRMED", label: "Подтверждён" },
  { value: "COMPLETED", label: "Завершён" },
  { value: "REFUNDED", label: "Возврат" },
  { value: "CANCELLED", label: "Отменён" },
];

/* ---------- Panel (встраивается разделом в админку) ---------- */

export function AdminMarketplacePanel({ tab }: { tab: AdminMarketplaceTab }) {
  return (
    <div className={styles.container}>
      {tab === "dashboard" && <DashboardTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "tickets" && <TicketsTab />}
      {tab === "bloggers" && <BloggersTab />}
      {tab === "services" && <ServicesTab />}
      {tab === "moderation" && <ModerationTab />}
      {tab === "premium" && <PremiumTab />}
      {tab === "hero" && <HeroTab />}
      {tab === "withdrawals" && <WithdrawalsTab />}
    </div>
  );
}

/* ---------- Dashboard Tab ---------- */

function DashboardTab() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["admin-marketplace-dashboard"],
    queryFn: () => apiRequest<DashboardStats>("/admin/marketplace/dashboard", { auth: true }),
  });

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Всего заказов</span>
        <span className={styles.statValue}>{data?.total_orders ?? 0}</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Выручка</span>
        <span className={styles.statValue}>{formatRubles(data?.total_revenue_kopeks ?? 0)}</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Активных блогеров</span>
        <span className={styles.statValue}>{data?.active_bloggers ?? 0}</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statLabel}>Клиентов</span>
        <span className={styles.statValue}>{data?.registered_clients ?? 0}</span>
      </div>
    </div>
  );
}

/* ---------- Orders Tab ---------- */

function OrdersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [resolveOrder, setResolveOrder] = useState<AdminOrder | null>(null);
  const [actionError, setActionError] = useState("");

  const confirmPaymentMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest(`/admin/marketplace/orders/${orderId}/confirm-payment`, {
        method: "PATCH",
        auth: true,
      }),
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const refundMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiRequest(`/admin/marketplace/orders/${orderId}/refund`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const handleConfirmPayment = (order: AdminOrder) => {
    if (window.confirm(`Подтвердить поступление ${formatRubles(order.amount_kopeks)} по заказу ${order.client_name} → ${order.blogger_name}?`)) {
      confirmPaymentMutation.mutate(order.id);
    }
  };

  const handleRefund = (order: AdminOrder) => {
    const reason = window.prompt("Причина возврата (1–1000 символов):");
    if (reason && reason.trim()) {
      refundMutation.mutate({ orderId: order.id, reason: reason.trim() });
    }
  };

  const { data, isLoading } = useQuery<AdminOrdersResponse>({
    queryKey: ["admin-marketplace-orders", page, statusFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59`);
      return apiRequest<AdminOrdersResponse>(
        `/admin/marketplace/orders?${params.toString()}`,
        { auth: true },
      );
    },
  });

  const totalPages = data ? Math.ceil(data.total / 50) : 0;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Фильтр по статусу"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            type="date"
            className={styles.filterInput}
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            aria-label="Дата от"
          />
          <input
            type="date"
            className={styles.filterInput}
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            aria-label="Дата до"
          />
        </div>

        {isLoading && <LoadingSpinner size="small" />}

        {actionError && <p className={styles.errorMsg}>{actionError}</p>}

        {data && data.items.length === 0 && (
          <p className={styles.emptyText}>Нет заказов по выбранным фильтрам.</p>
        )}

        {data && data.items.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Клиент</th>
                  <th>Блогер</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id}>
                    <td>{formatDateTime(order.created_at)}</td>
                    <td>{order.client_name}</td>
                    <td>{order.blogger_name}</td>
                    <td>{formatRubles(order.amount_kopeks)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${getStatusClass(order.status)}`}>
                        {formatStatus(order.status)}
                      </span>
                      {order.status === "PENDING_PAYMENT" && order.payment_reported_at && (
                        <span
                          className={`${styles.statusBadge} ${styles.statusConfirmed}`}
                          style={{ marginLeft: 6 }}
                          title={`Клиент сообщил об оплате: ${formatDateTime(order.payment_reported_at)}`}
                        >
                          💳 клиент оплатил
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        {order.status === "PENDING_PAYMENT" && (
                          <button
                            type="button"
                            className={styles.resolveBtn}
                            onClick={() => handleConfirmPayment(order)}
                            disabled={confirmPaymentMutation.isPending}
                          >
                            Подтвердить оплату
                          </button>
                        )}
                        {order.status === "ESCROW_HELD" && (
                          <button
                            type="button"
                            className={styles.resolveBtn}
                            onClick={() => setResolveOrder(order)}
                          >
                            Решить
                          </button>
                        )}
                        {(order.status === "ESCROW_HELD" || order.status === "BLOGGER_CONFIRMED") && (
                          <button
                            type="button"
                            className={styles.resolveBtn}
                            onClick={() => handleRefund(order)}
                            disabled={refundMutation.isPending}
                          >
                            Возврат
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              type="button"
            >
              ←
            </button>
            <span style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)" }}>
              {page} / {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              type="button"
            >
              →
            </button>
          </div>
        )}
      </div>

      {resolveOrder && (
        <ResolveOrderModal
          order={resolveOrder}
          onClose={() => setResolveOrder(null)}
          onResolved={() => {
            setResolveOrder(null);
            queryClient.invalidateQueries({ queryKey: ["admin-marketplace-orders"] });
          }}
        />
      )}
    </>
  );
}

/* ---------- Resolve Order Modal ---------- */

function ResolveOrderModal({
  order,
  onClose,
  onResolved,
}: {
  order: AdminOrder;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<"favor_client" | "favor_blogger">("favor_client");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 1 || reason.trim().length > 500) {
        throw new Error("Причина должна быть от 1 до 500 символов");
      }
      return apiRequest(`/admin/marketplace/orders/${order.id}/resolve`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
    },
    onSuccess: () => onResolved(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Решение спора</h2>
        <p style={{ fontSize: "0.88rem", color: "var(--mp-text-muted)", margin: 0 }}>
          Заказ: {order.client_name} → {order.blogger_name} · {formatRubles(order.amount_kopeks)}
        </p>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.modalForm}>
          <div className={styles.fieldGroup}>
            <span className={styles.label}>Решение</span>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="decision"
                  value="favor_client"
                  checked={decision === "favor_client"}
                  onChange={() => setDecision("favor_client")}
                />
                В пользу клиента (возврат)
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="decision"
                  value="favor_blogger"
                  checked={decision === "favor_blogger"}
                  onChange={() => setDecision("favor_blogger")}
                />
                В пользу блогера (выплата)
              </label>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="resolve-reason">Причина (1-500 символов)</label>
            <textarea
              id="resolve-reason"
              className={styles.textarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Укажите причину решения..."
              maxLength={500}
            />
          </div>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
          >
            {resolveMutation.isPending ? "Сохраняем…" : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Payments Tab (реквизиты + ЮKassa) ---------- */

function PaymentsTab() {
  const queryClient = useQueryClient();

  // Карта + ЮKassa
  const [card, setCard] = useState({ card_number: "", card_holder: "", card_bank: "", sbp_phone: "" });
  const [yk, setYk] = useState({ shop_id: "", secret_key: "", enabled: false, secretSet: false });
  const [reqError, setReqError] = useState("");
  const [reqSuccess, setReqSuccess] = useState("");

  // Расчётный счёт
  const [account, setAccount] = useState({ account_number: "", bic: "", bank_name: "", recipient_name: "" });
  const [accError, setAccError] = useState("");
  const [accSuccess, setAccSuccess] = useState("");

  const { isLoading: reqLoading, error: reqLoadError } = useQuery<PaymentSettings>({
    queryKey: ["admin-marketplace-payment-requisites"],
    queryFn: async () => {
      const d = await apiRequest<PaymentSettings>("/admin/marketplace/payment-requisites", { auth: true });
      setCard({
        card_number: d.card_number ?? "",
        card_holder: d.card_holder ?? "",
        card_bank: d.card_bank ?? "",
        sbp_phone: d.sbp_phone ?? "",
      });
      setYk({ shop_id: d.yookassa_shop_id ?? "", secret_key: "", enabled: d.yookassa_enabled, secretSet: d.yookassa_secret_set });
      return d;
    },
  });

  const { isLoading: accLoading } = useQuery<SettlementAccount | null>({
    queryKey: ["admin-settlement-account"],
    queryFn: async () => {
      try {
        const d = await apiRequest<SettlementAccount>("/admin/settlement-account", { auth: true });
        setAccount({
          account_number: d.account_number,
          bic: d.bic,
          bank_name: d.bank_name,
          recipient_name: d.recipient_name,
        });
        return d;
      } catch (err) {
        // 404 = реквизиты ещё не настроены
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });

  const saveRequisites = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        card_number: card.card_number,
        card_holder: card.card_holder,
        card_bank: card.card_bank,
        sbp_phone: card.sbp_phone,
        yookassa_shop_id: yk.shop_id,
        yookassa_enabled: yk.enabled,
      };
      // Пустое поле секрета = не менять сохранённый ключ
      if (yk.secret_key.trim() !== "") body.yookassa_secret_key = yk.secret_key.trim();
      return apiRequest("/admin/marketplace/payment-requisites", {
        method: "PUT",
        auth: true,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      setReqSuccess("Реквизиты сохранены. Заказчики увидят их при оплате.");
      setReqError("");
      setYk((prev) => ({ ...prev, secret_key: "", secretSet: prev.secretSet || prev.secret_key.trim() !== "" }));
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-payment-requisites"] });
    },
    onError: (err: Error) => {
      setReqError(err.message);
      setReqSuccess("");
    },
  });

  const saveAccount = useMutation({
    mutationFn: () =>
      apiRequest("/admin/settlement-account", {
        method: "PUT",
        auth: true,
        body: JSON.stringify(account),
      }),
    onSuccess: () => {
      setAccSuccess("Реквизиты р/с сохранены.");
      setAccError("");
      queryClient.invalidateQueries({ queryKey: ["admin-settlement-account"] });
    },
    onError: (err: Error) => {
      setAccError(err.message);
      setAccSuccess("");
    },
  });

  if (reqLoading || accLoading) return <LoadingSpinner size="small" />;

  return (
    <>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Карта для приёма оплаты</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)", marginTop: 0 }}>
          Эти реквизиты видит заказчик на странице заказа. Пустой номер карты скрывает способ «перевод на карту».
        </p>

        {reqLoadError && <p className={styles.errorMsg}>Не удалось загрузить реквизиты: {reqLoadError.message}</p>}
        {reqError && <p className={styles.errorMsg}>{reqError}</p>}
        {reqSuccess && <p className={styles.successMsg}>{reqSuccess}</p>}

        <div className={styles.settingsForm}>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Номер карты</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={card.card_number}
              onChange={(e) => setCard((p) => ({ ...p, card_number: e.target.value }))}
              placeholder="2200 0000 0000 0000"
              aria-label="Номер карты"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Держатель карты</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={card.card_holder}
              onChange={(e) => setCard((p) => ({ ...p, card_holder: e.target.value }))}
              placeholder="IVAN IVANOV"
              aria-label="Держатель карты"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Банк</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={card.card_bank}
              onChange={(e) => setCard((p) => ({ ...p, card_bank: e.target.value }))}
              placeholder="Т-Банк"
              aria-label="Банк карты"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Телефон СБП (опц.)</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={card.sbp_phone}
              onChange={(e) => setCard((p) => ({ ...p, sbp_phone: e.target.value }))}
              placeholder="+7 900 000-00-00"
              aria-label="Телефон СБП"
            />
          </div>
        </div>

        <h2 className={styles.sectionTitle} style={{ marginTop: "1.6rem" }}>ЮKassa (онлайн-оплата)</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)", marginTop: 0 }}>
          Ключи из личного кабинета ЮKassa. Пока переключатель выключен — кнопка онлайн-оплаты скрыта у заказчиков.
        </p>

        <div className={styles.settingsForm}>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>shopId</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={yk.shop_id}
              onChange={(e) => setYk((p) => ({ ...p, shop_id: e.target.value }))}
              placeholder="123456"
              aria-label="ЮKassa shopId"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Секретный ключ</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              type="password"
              value={yk.secret_key}
              onChange={(e) => setYk((p) => ({ ...p, secret_key: e.target.value }))}
              placeholder={yk.secretSet ? "•••••••• (сохранён)" : "live_..."}
              aria-label="ЮKassa секретный ключ"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Онлайн-оплата включена</span>
            <input
              type="checkbox"
              checked={yk.enabled}
              onChange={(e) => setYk((p) => ({ ...p, enabled: e.target.checked }))}
              aria-label="Включить ЮKassa"
              style={{ width: 20, height: 20, accentColor: "var(--accent)" }}
            />
          </div>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => saveRequisites.mutate()}
            disabled={saveRequisites.isPending}
          >
            {saveRequisites.isPending ? "Сохраняем…" : "Сохранить реквизиты"}
          </button>
        </div>
      </div>

      <div className={styles.section} style={{ marginTop: "1.2rem" }}>
        <h2 className={styles.sectionTitle}>Расчётный счёт (банковский перевод)</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)", marginTop: 0 }}>
          Показывается заказчику как способ «банковский перевод». Все четыре поля обязательны.
        </p>

        {accError && <p className={styles.errorMsg}>{accError}</p>}
        {accSuccess && <p className={styles.successMsg}>{accSuccess}</p>}

        <div className={styles.settingsForm}>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Расчётный счёт (20 цифр)</span>
            <input
              className={styles.settingsInput}
              style={{ width: 260 }}
              value={account.account_number}
              onChange={(e) => setAccount((p) => ({ ...p, account_number: e.target.value.replace(/\D/g, "") }))}
              maxLength={20}
              placeholder="40817810000000000000"
              aria-label="Номер расчётного счёта"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>БИК (9 цифр)</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={account.bic}
              onChange={(e) => setAccount((p) => ({ ...p, bic: e.target.value.replace(/\D/g, "") }))}
              maxLength={9}
              placeholder="044525225"
              aria-label="БИК"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Банк</span>
            <input
              className={styles.settingsInput}
              style={{ width: 220 }}
              value={account.bank_name}
              onChange={(e) => setAccount((p) => ({ ...p, bank_name: e.target.value }))}
              placeholder="ПАО Сбербанк"
              aria-label="Наименование банка"
            />
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Получатель</span>
            <input
              className={styles.settingsInput}
              style={{ width: 260 }}
              value={account.recipient_name}
              onChange={(e) => setAccount((p) => ({ ...p, recipient_name: e.target.value }))}
              placeholder="ИП Иванов Иван Иванович"
              aria-label="Наименование получателя"
            />
          </div>

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => saveAccount.mutate()}
            disabled={saveAccount.isPending}
          >
            {saveAccount.isPending ? "Сохраняем…" : "Сохранить р/с"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Settings Tab ---------- */

function SettingsTab() {
  const queryClient = useQueryClient();
  const [platformPct, setPlatformPct] = useState("");
  const [workerPct, setWorkerPct] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { isLoading } = useQuery<CommissionSettings>({
    queryKey: ["admin-marketplace-settings"],
    queryFn: async () => {
      const d = await apiRequest<CommissionSettings>("/admin/marketplace/settings", { auth: true });
      setPlatformPct(d.platform_commission_pct);
      setWorkerPct(d.worker_referral_commission_pct);
      return d;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/marketplace/settings", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          platform_commission_pct: platformPct,
          worker_referral_commission_pct: workerPct,
        }),
      }),
    onSuccess: () => {
      setSuccess("Настройки сохранены!");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-settings"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess("");
    },
  });

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Настройки комиссий</h2>

      {error && <p className={styles.errorMsg}>{error}</p>}
      {success && <p className={styles.successMsg}>{success}</p>}

      <div className={styles.settingsForm}>
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Комиссия платформы (1-50%)</span>
          <input
            type="number"
            className={styles.settingsInput}
            value={platformPct}
            onChange={(e) => setPlatformPct(e.target.value)}
            min={1}
            max={50}
            step={0.01}
            aria-label="Комиссия платформы"
          />
          <span className={styles.settingsSuffix}>%</span>
        </div>

        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Комиссия воркера (1-30%)</span>
          <input
            type="number"
            className={styles.settingsInput}
            value={workerPct}
            onChange={(e) => setWorkerPct(e.target.value)}
            min={1}
            max={30}
            step={0.01}
            aria-label="Комиссия воркера"
          />
          <span className={styles.settingsSuffix}>%</span>
        </div>

        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Сохраняем…" : "Сохранить настройки"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Tickets Tab ---------- */

const TICKET_SUBJECT_LABELS: Record<string, string> = {
  dispute: "Спор по сделке",
  payment: "Оплата",
  technical: "Технический вопрос",
  general: "Вопрос",
};

const TICKET_ROLE_LABELS: Record<string, string> = {
  Bloger: "автор",
  Client: "заказчик",
};

/** Спор можно решить «в чью-то пользу», только пока деньги сделки в эскроу. */
const isDisputeResolvable = (ticket: SupportTicket): boolean =>
  ticket.order_id != null &&
  (ticket.order_status === "ESCROW_HELD" || ticket.order_status === "BLOGGER_CONFIRMED");

function TicketsTab() {
  const queryClient = useQueryClient();
  const [resolveTicket, setResolveTicket] = useState<SupportTicket | null>(null);

  const { data, isLoading } = useQuery<TicketsResponse>({
    queryKey: ["admin-marketplace-tickets"],
    queryFn: () => apiRequest<TicketsResponse>("/admin/marketplace/support/tickets", { auth: true }),
  });

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Открытые тикеты</h2>

        {data && data.items.length === 0 && (
          <p className={styles.emptyText}>Нет открытых тикетов.</p>
        )}

        {data && data.items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {data.items.map((ticket) => (
              <div key={ticket.id} className={styles.ticketItem}>
                <div className={styles.ticketInfo}>
                  <span>
                    <span className={styles.statusBadge}>
                      {TICKET_SUBJECT_LABELS[ticket.subject] ?? ticket.subject}
                    </span>
                  </span>
                  <span className={styles.ticketMessage}>{ticket.message}</span>
                  <span className={styles.ticketMeta}>
                    {ticket.submitter_name} ({TICKET_ROLE_LABELS[ticket.submitter_role] ?? ticket.submitter_role}) · {formatDateTime(ticket.created_at)}
                    {ticket.order_amount_kopeks != null && ` · сделка на ${formatRubles(ticket.order_amount_kopeks)}`}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.resolveBtn}
                  onClick={() => setResolveTicket(ticket)}
                >
                  {isDisputeResolvable(ticket) ? "Решить спор" : "Закрыть"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolveTicket && (
        <ResolveTicketModal
          ticket={resolveTicket}
          onClose={() => setResolveTicket(null)}
          onResolved={() => {
            setResolveTicket(null);
            queryClient.invalidateQueries({ queryKey: ["admin-marketplace-tickets"] });
          }}
        />
      )}
    </>
  );
}

/* ---------- Resolve Ticket Modal ---------- */

function ResolveTicketModal({
  ticket,
  onClose,
  onResolved,
}: {
  ticket: SupportTicket;
  onClose: () => void;
  onResolved: () => void;
}) {
  // Вердикт «в чью-то пользу» двигает деньги эскроу, поэтому доступен только
  // для спора по активной сделке. Остальные обращения просто закрываются с ответом.
  const withDecision = isDisputeResolvable(ticket);
  const [decision, setDecision] = useState<"favor_client" | "favor_blogger">("favor_client");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 1 || reason.trim().length > 1000) {
        throw new Error("Комментарий должен быть от 1 до 1000 символов");
      }
      return apiRequest(`/admin/marketplace/support/tickets/${ticket.id}/resolve`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(
          withDecision
            ? { decision, reason: reason.trim() }
            : { reason: reason.trim() },
        ),
      });
    },
    onSuccess: () => onResolved(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{withDecision ? "Решение спора" : "Закрытие тикета"}</h2>
        <p style={{ fontSize: "0.88rem", color: "var(--mp-text-muted)", margin: 0 }}>
          {TICKET_SUBJECT_LABELS[ticket.subject] ?? ticket.subject} · от {ticket.submitter_name} ({TICKET_ROLE_LABELS[ticket.submitter_role] ?? ticket.submitter_role})
          {withDecision && ticket.order_amount_kopeks != null && ` · сделка на ${formatRubles(ticket.order_amount_kopeks)}`}
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--mp-text)", margin: 0, fontStyle: "italic" }}>
          &ldquo;{ticket.message.slice(0, 200)}{ticket.message.length > 200 ? "…" : ""}&rdquo;
        </p>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.modalForm}>
          {withDecision && (
            <div className={styles.fieldGroup}>
              <span className={styles.label}>Решение (двигает деньги сделки)</span>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="ticket-decision"
                    value="favor_client"
                    checked={decision === "favor_client"}
                    onChange={() => setDecision("favor_client")}
                  />
                  В пользу заказчика (возврат)
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="ticket-decision"
                    value="favor_blogger"
                    checked={decision === "favor_blogger"}
                    onChange={() => setDecision("favor_blogger")}
                  />
                  В пользу автора (выплата)
                </label>
              </div>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="ticket-reason">
              {withDecision ? "Причина решения (1-1000 символов)" : "Комментарий (1-1000 символов)"}
            </label>
            <textarea
              id="ticket-reason"
              className={styles.textarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={withDecision ? "Укажите причину решения..." : "Ответ или итог по обращению..."}
              maxLength={1000}
            />
          </div>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
          >
            {resolveMutation.isPending ? "Сохраняем…" : withDecision ? "Подтвердить решение" : "Закрыть тикет"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Bloggers Tab ---------- */

function BloggerMetricEditor({ blogger }: { blogger: BloggerAdmin }) {
  const queryClient = useQueryClient();
  const [er, setEr] = useState(blogger.engagement_rate != null ? String(blogger.engagement_rate) : "");
  const [rating, setRating] = useState(blogger.rating != null ? String(blogger.rating) : "");

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/marketplace/bloggers/${blogger.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          engagement_rate: er.trim() === "" ? null : Number(er),
          rating: rating.trim() === "" ? null : Number(rating),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-marketplace-bloggers"] }),
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
      <input
        type="number"
        className={styles.settingsInput}
        style={{ width: 66 }}
        value={er}
        onChange={(e) => setEr(e.target.value)}
        placeholder="ER %"
        min={0}
        max={100}
        step={0.1}
        aria-label={`ER ${blogger.name}`}
      />
      <input
        type="number"
        className={styles.settingsInput}
        style={{ width: 58 }}
        value={rating}
        onChange={(e) => setRating(e.target.value)}
        placeholder="★"
        min={0}
        max={5}
        step={0.1}
        aria-label={`Рейтинг ${blogger.name}`}
      />
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        {save.isPending ? "…" : "OK"}
      </button>
    </div>
  );
}

function BloggersTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BloggersResponse>({
    queryKey: ["admin-marketplace-bloggers"],
    queryFn: () => apiRequest<BloggersResponse>("/admin/marketplace/bloggers", { auth: true }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ bloggerId, isActive }: { bloggerId: string; isActive: boolean }) =>
      apiRequest(`/admin/marketplace/bloggers/${bloggerId}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ is_active: isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-bloggers"] });
    },
  });

  if (isLoading) return <LoadingSpinner size="small" />;

  const CATEGORY_LABELS: Record<string, string> = {
    lifestyle: "Лайфстайл",
    tech: "Технологии",
    beauty: "Красота",
    food: "Еда",
    travel: "Путешествия",
    fitness: "Фитнес",
    gaming: "Игры",
    education: "Образование",
    business: "Бизнес",
    entertainment: "Развлечения",
    other: "Другое",
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Управление блогерами</h2>

      {data && data.items.length === 0 && (
        <p className={styles.emptyText}>Нет зарегистрированных блогеров.</p>
      )}

      {data && data.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {data.items.map((blogger) => (
            <div key={blogger.id} className={styles.bloggerItem}>
              <div className={styles.bloggerInfo}>
                <span className={styles.bloggerName}>{blogger.name}</span>
                <span className={styles.bloggerMeta}>
                  {CATEGORY_LABELS[blogger.category] || blogger.category} · {blogger.subscriber_count.toLocaleString("ru-RU")} подп. · {formatRubles(blogger.average_price_kopeks)}
                </span>
              </div>
              <div className={styles.bloggerActions}>
                <BloggerMetricEditor blogger={blogger} />
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${blogger.is_active ? styles.toggleBtnActive : ""}`}
                  onClick={() => toggleMutation.mutate({ bloggerId: blogger.id, isActive: !blogger.is_active })}
                >
                  {blogger.is_active ? "Активен" : "Неактивен"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Hero (витрина лендинга) Tab ---------- */

type HeroAuthor = {
  user_id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
};

type HeroCategory = { value: string; label: string };

type HeroConfigPublic = {
  categories: HeroCategory[];
  authors_all: HeroAuthor[];
  authors_by_category: Record<string, HeroAuthor[]>;
};

const heroChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.25rem 0.6rem",
  borderRadius: "999px",
  background: "var(--surface-hover)",
  border: "1px solid var(--border)",
  fontSize: "0.85rem",
  fontWeight: 600,
};

const heroChipRemoveStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: "1rem",
  lineHeight: 1,
  color: "inherit",
};

const heroDropdownStyle: CSSProperties = {
  marginTop: "0.35rem",
  border: "1px solid var(--border-strong)",
  borderRadius: "0.5rem",
  overflow: "hidden",
  maxWidth: 360,
};

const heroDropdownItemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "0.5rem 0.7rem",
  border: "none",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-raised)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: "0.85rem",
};

function HeroAuthorPicker({
  title,
  selected,
  onChange,
}: {
  title: string;
  selected: HeroAuthor[];
  onChange: (next: HeroAuthor[]) => void;
}) {
  const [term, setTerm] = useState("");
  const q = term.trim();

  const { data: results } = useQuery<{ items: HeroAuthor[] }>({
    queryKey: ["hero-author-search", q],
    queryFn: () =>
      apiRequest<{ items: HeroAuthor[] }>(
        `/marketplace/bloggers?page_size=8&q=${encodeURIComponent(q)}`,
      ),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });

  const add = (a: HeroAuthor) => {
    if (!selected.some((s) => s.user_id === a.user_id)) onChange([...selected, a]);
    setTerm("");
  };
  const remove = (id: string) => onChange(selected.filter((s) => s.user_id !== id));

  const candidates = (results?.items ?? []).filter(
    (a) => !selected.some((s) => s.user_id === a.user_id),
  );

  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div className={styles.settingsLabel} style={{ marginBottom: "0.4rem" }}>
        {title}
      </div>

      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {selected.map((a) => (
            <span key={a.user_id} style={heroChipStyle}>
              {a.name}
              <button
                type="button"
                onClick={() => remove(a.user_id)}
                style={heroChipRemoveStyle}
                aria-label={`Убрать ${a.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        className={styles.settingsInput}
        style={{ width: "100%", maxWidth: 360 }}
        placeholder="Поиск автора по имени…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {q.length >= 2 && candidates.length > 0 && (
        <div style={heroDropdownStyle}>
          {candidates.map((a) => (
            <button
              key={a.user_id}
              type="button"
              onClick={() => add(a)}
              style={heroDropdownItemStyle}
            >
              {a.name}
              {a.category ? ` · ${a.category}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Withdrawals Tab (выводы средств, ручное подтверждение) ---------- */

const WITHDRAWAL_STATUSES = [
  { value: "pending", label: "Ожидают подтверждения" },
  { value: "completed", label: "Выплаченные" },
  { value: "failed", label: "Отклонённые" },
  { value: "", label: "Все статусы" },
];

function formatWithdrawalStatus(status: string): string {
  switch (status) {
    case "pending": return "Ожидает";
    case "completed": return "Выплачен";
    case "failed": return "Отклонён";
    default: return status;
  }
}

function formatWithdrawalRole(role: string): string {
  switch (role) {
    case "Bloger": return "Автор";
    case "Worker": return "Воркер";
    default: return role;
  }
}

/* Суммы выводов показываем с копейками — админ переводит ровно столько. */
function formatRublesExact(kopeks: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: kopeks % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kopeks / 100);
}

function WithdrawalsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<AdminWithdrawalsResponse>({
    queryKey: ["admin-marketplace-withdrawals", statusFilter],
    queryFn: () => {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      return apiRequest<AdminWithdrawalsResponse>(`/admin/marketplace/withdrawals${qs}`, { auth: true });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "complete" | "reject"; reason?: string }) =>
      apiRequest(`/admin/marketplace/withdrawals/${id}/${action}`, {
        method: "PATCH",
        auth: true,
        body: action === "reject" ? JSON.stringify({ reason: reason || null }) : JSON.stringify({}),
      }),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-withdrawals"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleComplete = (w: AdminWithdrawal) => {
    const card = w.card_last4 ? `на карту •••• ${w.card_last4}` : "получателю";
    if (window.confirm(`Подтвердить выплату ${formatRublesExact(w.amount_kopeks)} ${card} — «${w.user_name}»? Отметьте только после реального перевода.`)) {
      actionMutation.mutate({ id: w.id, action: "complete" });
    }
  };

  const handleReject = (w: AdminWithdrawal) => {
    const reason = window.prompt("Причина отклонения (увидит получатель, сумма вернётся на баланс):");
    if (reason === null) return;
    actionMutation.mutate({ id: w.id, action: "reject", reason: reason.trim() || undefined });
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Запросы на вывод средств</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)", marginTop: 0 }}>
        Баланс уже списан при создании запроса. Переведите деньги на карту получателя и подтвердите
        выплату; при отклонении сумма вернётся на баланс.
      </p>

      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Фильтр выводов по статусу"
        >
          {WITHDRAWAL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
      {isLoading && <LoadingSpinner size="small" />}

      {data && data.items.length === 0 && (
        <p className={styles.emptyText}>Нет запросов с этим статусом.</p>
      )}

      {data && data.items.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Получатель</th>
                <th>Сумма</th>
                <th>Карта</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((w) => (
                <tr key={w.id}>
                  <td>{formatDateTime(w.created_at)}</td>
                  <td>
                    {w.user_name}
                    <span style={{ display: "block", fontSize: "0.8rem", color: "var(--mp-text-muted)" }}>
                      {formatWithdrawalRole(w.user_role)} · {w.user_email}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{formatRublesExact(w.amount_kopeks)}</td>
                  <td>
                    {w.card_last4 ? (
                      <>
                        •••• {w.card_last4}
                        <span style={{ display: "block", fontSize: "0.8rem", color: "var(--mp-text-muted)" }}>
                          {[w.card_bank, w.card_holder].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={styles.statusBadge}>{formatWithdrawalStatus(w.status)}</span>
                    {w.status === "failed" && w.error_message && (
                      <span style={{ display: "block", fontSize: "0.8rem", color: "var(--mp-text-muted)", maxWidth: 220 }}>
                        {w.error_message}
                      </span>
                    )}
                    {w.status === "completed" && w.completed_at && (
                      <span style={{ display: "block", fontSize: "0.8rem", color: "var(--mp-text-muted)" }}>
                        {formatDateTime(w.completed_at)}
                      </span>
                    )}
                  </td>
                  <td>
                    {w.status === "pending" ? (
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          onClick={() => handleComplete(w)}
                          disabled={actionMutation.isPending}
                        >
                          Выплачено
                        </button>
                        <button
                          type="button"
                          className={styles.resolveBtn}
                          onClick={() => handleReject(w)}
                          disabled={actionMutation.isPending}
                        >
                          Отклонить
                        </button>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HeroTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [authorsAll, setAuthorsAll] = useState<HeroAuthor[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, HeroAuthor[]>>({});

  const { data: allCategories } = useQuery<HeroCategory[]>({
    queryKey: ["hero-all-categories"],
    queryFn: () => apiRequest<HeroCategory[]>("/marketplace/categories"),
  });

  const { isLoading } = useQuery<HeroConfigPublic>({
    queryKey: ["hero-config-admin-load"],
    queryFn: async () => {
      const d = await apiRequest<HeroConfigPublic>("/marketplace/hero-config");
      setCategories(d.categories.map((c) => c.value));
      setAuthorsAll(d.authors_all ?? []);
      setByCategory(d.authors_by_category ?? {});
      return d;
    },
  });

  const toggleCategory = (value: string) => {
    setCategories((prev) => {
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      if (prev.length >= 3) return prev;
      return [...prev, value];
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        featured_categories: categories,
        featured_all: authorsAll.map((a) => a.user_id),
        featured_by_category: Object.fromEntries(
          categories.map((c) => [c, (byCategory[c] ?? []).map((a) => a.user_id)]),
        ),
      };
      return apiRequest("/admin/marketplace/hero-config", {
        method: "PUT",
        auth: true,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      setSuccess("Витрина сохранена!");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["hero-config"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess("");
    },
  });

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Витрина лендинга</h2>
      <p className={styles.emptyText} style={{ marginBottom: "1rem" }}>
        Выберите до 3 ниш-вкладок и авторов для показа на главной. Если ничего не выбрано —
        показываются демо-примеры.
      </p>

      {error && <p className={styles.errorMsg}>{error}</p>}
      {success && <p className={styles.successMsg}>{success}</p>}

      <div style={{ marginBottom: "1.5rem" }}>
        <div className={styles.settingsLabel} style={{ marginBottom: "0.5rem" }}>
          Ниши (до 3)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {(allCategories ?? []).map((c) => {
            const on = categories.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCategory(c.value)}
                className={`${styles.tab} ${on ? styles.tabActive : ""}`}
                disabled={!on && categories.length >= 3}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <HeroAuthorPicker
        title="Авторы для «Все ниши»"
        selected={authorsAll}
        onChange={setAuthorsAll}
      />

      {categories.map((cat) => {
        const label = (allCategories ?? []).find((c) => c.value === cat)?.label ?? cat;
        return (
          <HeroAuthorPicker
            key={cat}
            title={`Авторы для ниши «${label}»`}
            selected={byCategory[cat] ?? []}
            onChange={(next) => setByCategory((prev) => ({ ...prev, [cat]: next }))}
          />
        );
      })}

      <button
        type="button"
        className={styles.btnPrimary}
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? "Сохраняем…" : "Сохранить витрину"}
      </button>
    </div>
  );
}

/* ---------- Services Tab (реестр услуг) ---------- */

function ServiceTypeRow({
  service,
  onError,
}: {
  service: ServiceType;
  onError: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(service.sort_order));

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(`/admin/marketplace/service-types/${service.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      onError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-service-types"] });
    },
    onError: (err: Error) => onError(err.message),
  });

  const changed =
    name.trim() !== service.name ||
    description.trim() !== (service.description ?? "") ||
    Number(sortOrder) !== service.sort_order;

  const save = () => {
    if (!name.trim()) {
      onError("Название услуги не может быть пустым");
      return;
    }
    patchMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : service.sort_order,
    });
  };

  return (
    <tr>
      <td>
        <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}>
          {service.code}
        </code>
      </td>
      <td>
        <input
          className={styles.settingsInput}
          style={{ width: 180 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-label={`Название услуги ${service.code}`}
        />
      </td>
      <td>
        <input
          className={styles.settingsInput}
          style={{ width: 240 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          placeholder="—"
          aria-label={`Описание услуги ${service.code}`}
        />
      </td>
      <td>
        <input
          type="number"
          className={styles.settingsInput}
          style={{ width: 70 }}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          min={0}
          max={10000}
          aria-label={`Порядок услуги ${service.code}`}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={service.is_active}
          onChange={(e) => patchMutation.mutate({ is_active: e.target.checked })}
          disabled={patchMutation.isPending}
          aria-label={`Активность услуги ${service.code}`}
          style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
        />
      </td>
      <td>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={save}
          disabled={!changed || patchMutation.isPending}
        >
          {patchMutation.isPending ? "…" : "Сохранить"}
        </button>
      </td>
    </tr>
  );
}

function ServicesTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [form, setForm] = useState({ code: "", name: "", description: "", sort_order: "0" });

  const { data, isLoading } = useQuery<ServiceType[]>({
    queryKey: ["admin-marketplace-service-types"],
    queryFn: () => apiRequest<ServiceType[]>("/admin/marketplace/service-types", { auth: true }),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const code = form.code.trim().toLowerCase();
      if (!/^[a-z0-9_-]+$/.test(code)) {
        throw new Error("Код: только латиница в нижнем регистре, цифры, «_» и «-»");
      }
      if (!form.name.trim()) throw new Error("Укажите название услуги");
      return apiRequest("/admin/marketplace/service-types", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          code,
          name: form.name.trim(),
          description: form.description.trim() || null,
          sort_order: Number.isFinite(Number(form.sort_order)) ? Number(form.sort_order) : 0,
          is_active: true,
        }),
      });
    },
    onSuccess: () => {
      setError("");
      setForm({ code: "", name: "", description: "", sort_order: "0" });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-service-types"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) return <LoadingSpinner size="small" />;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Реестр услуг</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)", marginTop: 0 }}>
        Реестр услуг единый для всех авторов — авторы указывают свои цены на эти услуги в
        кабинете маркетплейса.
      </p>

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={styles.settingsForm} style={{ marginBottom: "1.2rem" }}>
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Код (a-z, 0-9, _-)</span>
          <input
            className={styles.settingsInput}
            style={{ width: 180, fontFamily: "ui-monospace, monospace" }}
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            placeholder="integration_story"
            maxLength={50}
            aria-label="Код новой услуги"
          />
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Название</span>
          <input
            className={styles.settingsInput}
            style={{ width: 220 }}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Интеграция в сторис"
            maxLength={100}
            aria-label="Название новой услуги"
          />
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Описание (опц.)</span>
          <input
            className={styles.settingsInput}
            style={{ width: 260 }}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            maxLength={300}
            aria-label="Описание новой услуги"
          />
        </div>
        <div className={styles.settingsRow}>
          <span className={styles.settingsLabel}>Порядок</span>
          <input
            type="number"
            className={styles.settingsInput}
            style={{ width: 90 }}
            value={form.sort_order}
            onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
            min={0}
            max={10000}
            aria-label="Порядок новой услуги"
          />
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Добавляем…" : "Добавить услугу"}
        </button>
      </div>

      {data && data.length === 0 && (
        <p className={styles.emptyText}>Реестр пуст — добавьте первую услугу.</p>
      )}

      {data && data.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>Описание</th>
                <th>Порядок</th>
                <th>Активна</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <ServiceTypeRow key={s.id} service={s} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Moderation Tab (заявки на аудиторию) ---------- */

const SUBMISSION_STATUSES = [
  { value: "pending", label: "На рассмотрении" },
  { value: "approved", label: "Подтверждённые" },
  { value: "rejected", label: "Отклонённые" },
];

const PAYLOAD_FIELD_LABELS: Record<string, string> = {
  audience_age: "Возраст аудитории",
  audience_gender: "Пол аудитории",
  audience_geo: "География",
  audience_devices: "Устройства",
  avg_views: "Средние просмотры",
  posting_frequency: "Частота постинга",
  response_time: "Время ответа",
  subscriber_count: "Подписчики",
};

function formatPayloadValue(key: string, value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    // Группы вида [{label, percent}]
    return value
      .map((item) => {
        if (item && typeof item === "object" && "label" in item) {
          const g = item as { label?: unknown; percent?: unknown };
          return `${String(g.label ?? "")} — ${String(g.percent ?? "")}%`;
        }
        return String(item);
      })
      .join(", ");
  }
  if (typeof value === "object") {
    // Пол аудитории: {female, male}
    const g = value as { female?: unknown; male?: unknown };
    if (g.female != null || g.male != null) {
      return `Ж — ${String(g.female ?? 0)}%, М — ${String(g.male ?? 0)}%`;
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") return value.toLocaleString("ru-RU");
  return String(value);
}

function screenshotUrl(path: string): string {
  return path.startsWith("/") ? `${appConfig.apiBaseUrl}${path}` : path;
}

function AudienceSubmissionCard({
  submission,
  onError,
}: {
  submission: AudienceSubmission;
  onError: (msg: string) => void;
}) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: ({ action, comment }: { action: "approve" | "reject"; comment?: string }) =>
      apiRequest(`/admin/marketplace/audience-submissions/${submission.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(comment ? { action, comment } : { action }),
      }),
    onSuccess: () => {
      onError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-audience-submissions"] });
    },
    onError: (err: Error) => onError(err.message),
  });

  const handleApprove = () => {
    if (window.confirm(`Подтвердить данные аудитории автора «${submission.blogger_name}»?`)) {
      resolveMutation.mutate({ action: "approve" });
    }
  };

  const handleReject = () => {
    const comment = window.prompt("Комментарий для автора (причина отклонения):");
    if (comment === null) return;
    resolveMutation.mutate({ action: "reject", comment: comment.trim() || undefined });
  };

  const payloadRows = Object.keys(PAYLOAD_FIELD_LABELS)
    .filter((key) => {
      const v = submission.payload?.[key];
      return v != null && !(Array.isArray(v) && v.length === 0);
    })
    .map((key) => ({ key, label: PAYLOAD_FIELD_LABELS[key], value: formatPayloadValue(key, submission.payload[key]) }));

  return (
    <div className={styles.section} style={{ marginTop: "0.8rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{submission.blogger_name}</h3>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.83rem", color: "var(--mp-text-muted)" }}>
            {submission.blogger_category ?? "без категории"}
            {submission.subscriber_count != null &&
              ` · ${submission.subscriber_count.toLocaleString("ru-RU")} подп.`}
            {` · заявка от ${formatDateTime(submission.created_at)}`}
          </p>
        </div>
        {submission.status === "pending" ? (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "flex-start" }}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleApprove}
              disabled={resolveMutation.isPending}
            >
              Подтвердить
            </button>
            <button
              type="button"
              className={styles.resolveBtn}
              onClick={handleReject}
              disabled={resolveMutation.isPending}
            >
              Отклонить
            </button>
          </span>
        ) : (
          <span className={styles.statusBadge}>
            {submission.status === "approved" ? "Подтверждена" : "Отклонена"}
            {submission.reviewed_at ? ` · ${formatDateTime(submission.reviewed_at)}` : ""}
          </span>
        )}
      </div>

      {payloadRows.length > 0 && (
        <dl style={{ margin: "0.8rem 0 0", display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.3rem 1rem", fontSize: "0.87rem" }}>
          {payloadRows.map((row) => (
            <div key={row.key} style={{ display: "contents" }}>
              <dt style={{ color: "var(--mp-text-muted)" }}>{row.label}</dt>
              <dd style={{ margin: 0 }}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {submission.screenshots.length > 0 && (
        <div style={{ marginTop: "0.8rem" }}>
          <span style={{ fontSize: "0.83rem", color: "var(--mp-text-muted)" }}>Скриншоты:</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.4rem" }}>
            {submission.screenshots.map((shot, i) => (
              <a
                key={`${shot}-${i}`}
                href={screenshotUrl(shot)}
                target="_blank"
                rel="noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={screenshotUrl(shot)}
                  alt={`Скриншот ${i + 1} — ${submission.blogger_name}`}
                  style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-strong)" }}
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {submission.review_comment && (
        <p style={{ marginTop: "0.7rem", fontSize: "0.85rem", fontStyle: "italic" }}>
          Комментарий модератора: {submission.review_comment}
        </p>
      )}
    </div>
  );
}

function ModerationTab() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<AudienceSubmission[]>({
    queryKey: ["admin-marketplace-audience-submissions", statusFilter],
    queryFn: () =>
      apiRequest<AudienceSubmission[]>(
        `/admin/marketplace/audience-submissions?status=${statusFilter}`,
        { auth: true },
      ),
  });

  return (
    <div>
      <div className={styles.filters} style={{ marginBottom: "0.4rem" }}>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Фильтр заявок по статусу"
        >
          {SUBMISSION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
      {isLoading && <LoadingSpinner size="small" />}

      {data && data.length === 0 && (
        <p className={styles.emptyText}>Нет заявок с этим статусом.</p>
      )}

      {data?.map((submission) => (
        <AudienceSubmissionCard
          key={submission.id}
          submission={submission}
          onError={setError}
        />
      ))}
    </div>
  );
}

/* ---------- Premium Tab (заявки на премиум-размещение) ---------- */

const PREMIUM_STATUSES = [
  { value: "", label: "Все статусы" },
  { value: "new", label: "Новые" },
  { value: "contacted", label: "Связались" },
  { value: "closed", label: "Закрытые" },
];

function formatPremiumStatus(status: string): string {
  switch (status) {
    case "new": return "Новая";
    case "contacted": return "Связались";
    case "closed": return "Закрыта";
    default: return status;
  }
}

function PremiumTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("new");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<PremiumRequest[]>({
    queryKey: ["admin-marketplace-premium-requests", statusFilter],
    queryFn: () => {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      return apiRequest<PremiumRequest[]>(`/admin/marketplace/premium-requests${qs}`, { auth: true });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "contacted" | "closed" }) =>
      apiRequest(`/admin/marketplace/premium-requests/${id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-premium-requests"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Заявки на премиум-размещение</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--mp-text-muted)", marginTop: 0 }}>
        После договорённости добавьте автора в витрину в разделе «Витрина».
      </p>

      <div className={styles.filters}>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Фильтр премиум-заявок по статусу"
        >
          {PREMIUM_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
      {isLoading && <LoadingSpinner size="small" />}

      {data && data.length === 0 && (
        <p className={styles.emptyText}>Нет заявок с этим статусом.</p>
      )}

      {data && data.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Автор</th>
                <th>Комментарий</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.map((req) => (
                <tr key={req.id}>
                  <td>
                    {req.blogger_name ?? "—"}
                    {req.blogger_email && (
                      <span style={{ display: "block", fontSize: "0.8rem", color: "var(--mp-text-muted)" }}>
                        {req.blogger_email}
                      </span>
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>{req.comment || "—"}</td>
                  <td>{formatDateTime(req.created_at)}</td>
                  <td>
                    <span className={styles.statusBadge}>{formatPremiumStatus(req.status)}</span>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                      {req.status === "new" && (
                        <button
                          type="button"
                          className={styles.resolveBtn}
                          onClick={() => resolveMutation.mutate({ id: req.id, status: "contacted" })}
                          disabled={resolveMutation.isPending}
                        >
                          Связались
                        </button>
                      )}
                      {req.status !== "closed" && (
                        <button
                          type="button"
                          className={styles.resolveBtn}
                          onClick={() => resolveMutation.mutate({ id: req.id, status: "closed" })}
                          disabled={resolveMutation.isPending}
                        >
                          Закрыть
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
