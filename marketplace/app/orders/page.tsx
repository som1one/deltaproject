"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { StampBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { dealNo } from "@/lib/registry";
import type { Order, OrderStatus, OrdersResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";
import styles from "./orders.module.css";

import { Countdown } from "./countdown";

type FilterKey = "all" | "offer" | "payment" | "work" | "review" | "done" | "closed";

const FILTERS: { key: FilterKey; label: string; statuses: OrderStatus[] | null }[] = [
  { key: "all", label: "Все", statuses: null },
  { key: "offer", label: "Ждут ответа", statuses: ["OFFER_PENDING"] },
  { key: "payment", label: "Ожидают оплату", statuses: ["PENDING_PAYMENT"] },
  { key: "work", label: "В работе", statuses: ["ESCROW_HELD"] },
  { key: "review", label: "На проверке", statuses: ["BLOGGER_CONFIRMED"] },
  { key: "done", label: "Завершены", statuses: ["COMPLETED"] },
  {
    key: "closed",
    label: "Отменённые",
    statuses: ["CANCELLED", "OFFER_DECLINED", "REFUNDED", "PAYMENT_FAILED"],
  },
];

/** Компактный индикатор срока для активной сделки в реестре. */
const RowDeadline = ({ order }: { order: Order }) => {
  if (order.status === "ESCROW_HELD" && order.deadline_at) {
    return <Countdown deadline={order.deadline_at} mode="work" compact />;
  }
  if (order.status === "BLOGGER_CONFIRMED" && order.review_deadline_at) {
    return <Countdown deadline={order.review_deadline_at} mode="review" compact />;
  }
  return <span className={styles.orderDate}>{formatDateTime(order.created_at)}</span>;
};

export default function OrdersPage() {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/auth/login?next=/orders");
    }
  }, [isAuthenticated, isHydrated, router]);

  const { data, isLoading, error } = useQuery<OrdersResponse>({
    queryKey: ["marketplace-orders"],
    queryFn: () => api.getOrders("?page_size=50"),
    enabled: isHydrated && isAuthenticated,
  });

  const orders = useMemo(() => data?.items ?? [], [data]);

  const counts = useMemo(() => {
    const map = new Map<FilterKey, number>();
    for (const f of FILTERS) {
      map.set(
        f.key,
        f.statuses == null
          ? orders.length
          : orders.filter((o) => f.statuses!.includes(o.status)).length,
      );
    }
    return map;
  }, [orders]);

  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const visible =
    activeFilter.statuses == null
      ? orders
      : orders.filter((o) => activeFilter.statuses!.includes(o.status));

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.headTitle}>
              <span className={s.mark}>Реестр сделок</span>
            </h1>
            <p className={styles.headSub}>
              Статусы, суммы и сроки по всем вашим сделкам — в одном месте.
            </p>
          </div>
          {!isBlogger && (
            <Link href="/catalog" className={ui.btnLine}>
              Новая сделка
            </Link>
          )}
        </header>

        <div className={styles.filters} role="tablist" aria-label="Фильтр по статусу">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={filter === f.key ? styles.chipActive : styles.chip}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {(counts.get(f.key) ?? 0) > 0 && (
                <span className={styles.chipCount}>{counts.get(f.key)}</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className={styles.list}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={styles.orderRow} aria-hidden="true">
                <span className={ui.skeleton} style={{ height: 16, width: 110 }} />
                <span className={ui.skeleton} style={{ height: 20, width: "50%" }} />
                <span />
                <span className={ui.skeleton} style={{ height: 16, width: 90 }} />
                <span className={ui.skeleton} style={{ height: 26, width: 120 }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={ui.noticeDanger}>Не удалось загрузить сделки. Обновите страницу.</div>
        ) : visible.length === 0 ? (
          <div className={ui.empty}>
            <h3 className={ui.emptyTitle}>
              {orders.length > 0
                ? "В этом статусе сделок нет"
                : isBlogger
                  ? "Входящих сделок пока нет"
                  : "Реестр пока пуст"}
            </h3>
            <p className={ui.emptyText}>
              {orders.length > 0
                ? "Выберите другой фильтр — или посмотрите весь список."
                : isBlogger
                  ? "Новые сделки появятся здесь после предложения от заказчика или оффера из чата."
                  : "Выберите автора в каталоге и оформите первую сделку."}
            </p>
            {orders.length === 0 && !isBlogger && (
              <Link href="/catalog" className={ui.btnPrimary}>
                Открыть каталог
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderRow}>
                <span className={styles.orderNum}>№&nbsp;{dealNo(order.id, order.created_at)}</span>
                <span className={styles.orderWho}>
                  <span className={styles.orderName}>
                    {isBlogger ? order.client_name ?? "Заказчик" : order.blogger_name ?? "Автор"}
                  </span>
                  <span className={styles.orderBrief}>
                    {order.service_type_name ?? "Индивидуальные условия"}
                  </span>
                </span>
                <span className={styles.orderMetaCell}>
                  <RowDeadline order={order} />
                </span>
                <span className={styles.orderAmount}>{formatMoney(order.amount_kopeks)}</span>
                <span className={styles.orderStampCell}>
                  <StampBadge status={order.status} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MarketShell>
  );
}
