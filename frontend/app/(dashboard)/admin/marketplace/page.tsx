"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";

import styles from "./admin-marketplace.module.css";

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
  order_id: string;
  submitter_name: string;
  submitter_role: string;
  message: string;
  status: string;
  created_at: string;
  order_status: string;
  order_amount_kopeks: number;
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
  is_active: boolean;
};

type BloggersResponse = {
  items: BloggerAdmin[];
  total: number;
};

type TabId = "dashboard" | "orders" | "settings" | "tickets" | "bloggers";

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
];

/* ---------- Main Component ---------- */

export default function AdminMarketplacePage() {
  const { isAuthenticated, accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Маркетплейс — Управление</h1>
        <p className={styles.subtitle}>Панель администратора биржи блогеров</p>
      </div>

      <div className={styles.tabs}>
        {([
          ["dashboard", "Дашборд"],
          ["orders", "Заказы"],
          ["settings", "Комиссии"],
          ["tickets", "Тикеты"],
          ["bloggers", "Блогеры"],
        ] as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <DashboardTab accessToken={accessToken} />}
      {activeTab === "orders" && <OrdersTab accessToken={accessToken} />}
      {activeTab === "settings" && <SettingsTab accessToken={accessToken} />}
      {activeTab === "tickets" && <TicketsTab accessToken={accessToken} />}
      {activeTab === "bloggers" && <BloggersTab accessToken={accessToken} />}
    </div>
  );
}

/* ---------- Dashboard Tab ---------- */

function DashboardTab({ accessToken }: { accessToken: string }) {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ["admin-marketplace-dashboard"],
    queryFn: async () => {
      const res = await fetch(`${appConfig.apiBaseUrl}/admin/marketplace/dashboard`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
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

function OrdersTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [resolveOrder, setResolveOrder] = useState<AdminOrder | null>(null);

  const { data, isLoading } = useQuery<AdminOrdersResponse>({
    queryKey: ["admin-marketplace-orders", page, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(
        `${appConfig.apiBaseUrl}/admin/marketplace/orders?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
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
                    </td>
                    <td>
                      {order.status === "ESCROW_HELD" && (
                        <button
                          type="button"
                          className={styles.resolveBtn}
                          onClick={() => setResolveOrder(order)}
                        >
                          Решить
                        </button>
                      )}
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
          accessToken={accessToken}
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
  accessToken,
  onClose,
  onResolved,
}: {
  order: AdminOrder;
  accessToken: string;
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
      const res = await fetch(
        `${appConfig.apiBaseUrl}/admin/marketplace/orders/${order.id}/resolve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ decision, reason: reason.trim() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "Ошибка");
      }
      return res.json();
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

/* ---------- Settings Tab ---------- */

function SettingsTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const [platformPct, setPlatformPct] = useState("");
  const [workerPct, setWorkerPct] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data, isLoading } = useQuery<CommissionSettings>({
    queryKey: ["admin-marketplace-settings"],
    queryFn: async () => {
      const res = await fetch(`${appConfig.apiBaseUrl}/admin/marketplace/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Ошибка");
      const d = await res.json();
      setPlatformPct(d.platform_commission_pct);
      setWorkerPct(d.worker_referral_commission_pct);
      return d;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${appConfig.apiBaseUrl}/admin/marketplace/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          platform_commission_pct: platformPct,
          worker_referral_commission_pct: workerPct,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Ошибка сохранения");
      }
      return res.json();
    },
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

function TicketsTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const [resolveTicket, setResolveTicket] = useState<SupportTicket | null>(null);

  const { data, isLoading } = useQuery<TicketsResponse>({
    queryKey: ["admin-marketplace-tickets"],
    queryFn: async () => {
      const res = await fetch(`${appConfig.apiBaseUrl}/admin/marketplace/support/tickets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
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
                  <span className={styles.ticketMessage}>{ticket.message}</span>
                  <span className={styles.ticketMeta}>
                    {ticket.submitter_name} ({ticket.submitter_role}) · {formatDateTime(ticket.created_at)} · Заказ: {formatRubles(ticket.order_amount_kopeks)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.resolveBtn}
                  onClick={() => setResolveTicket(ticket)}
                >
                  Решить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolveTicket && (
        <ResolveTicketModal
          ticket={resolveTicket}
          accessToken={accessToken}
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
  accessToken,
  onClose,
  onResolved,
}: {
  ticket: SupportTicket;
  accessToken: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<"favor_client" | "favor_blogger">("favor_client");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 1 || reason.trim().length > 1000) {
        throw new Error("Причина должна быть от 1 до 1000 символов");
      }
      const res = await fetch(
        `${appConfig.apiBaseUrl}/admin/marketplace/support/tickets/${ticket.id}/resolve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ decision, reason: reason.trim() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "Ошибка");
      }
      return res.json();
    },
    onSuccess: () => onResolved(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Решение тикета</h2>
        <p style={{ fontSize: "0.88rem", color: "var(--mp-text-muted)", margin: 0 }}>
          От: {ticket.submitter_name} ({ticket.submitter_role})
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--mp-text)", margin: 0, fontStyle: "italic" }}>
          &ldquo;{ticket.message.slice(0, 200)}{ticket.message.length > 200 ? "…" : ""}&rdquo;
        </p>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.modalForm}>
          <div className={styles.fieldGroup}>
            <span className={styles.label}>Решение</span>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="ticket-decision"
                  value="favor_client"
                  checked={decision === "favor_client"}
                  onChange={() => setDecision("favor_client")}
                />
                В пользу клиента
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="ticket-decision"
                  value="favor_blogger"
                  checked={decision === "favor_blogger"}
                  onChange={() => setDecision("favor_blogger")}
                />
                В пользу блогера
              </label>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="ticket-reason">Причина (1-1000 символов)</label>
            <textarea
              id="ticket-reason"
              className={styles.textarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Укажите причину решения..."
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
            {resolveMutation.isPending ? "Сохраняем…" : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Bloggers Tab ---------- */

function BloggersTab({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BloggersResponse>({
    queryKey: ["admin-marketplace-bloggers"],
    queryFn: async () => {
      const res = await fetch(`${appConfig.apiBaseUrl}/admin/marketplace/bloggers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ bloggerId, isActive }: { bloggerId: string; isActive: boolean }) => {
      const res = await fetch(
        `${appConfig.apiBaseUrl}/admin/marketplace/bloggers/${bloggerId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ is_active: isActive }),
        }
      );
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
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
