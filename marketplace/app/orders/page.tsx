"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { StatusBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { OrdersResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./orders.module.css";

export default function OrdersPage() {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();

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

  const orders = data?.items ?? [];

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <div>
            <span className={ui.eyebrow}>{isBlogger ? "Кабинет блогера" : "Кабинет заказчика"}</span>
            <h1 className={ui.displayTitle} style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>
              Мои заказы
            </h1>
          </div>
          {!isBlogger && (
            <Link href="/catalog" className={ui.btnSecondary}>
              + Новый заказ
            </Link>
          )}
        </header>

        {isLoading ? (
          <div className={styles.list}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={ui.skeleton} style={{ height: 84, borderRadius: 20 }} />
            ))}
          </div>
        ) : error ? (
          <div className={ui.noticeDanger}>Не удалось загрузить заказы. Обновите страницу.</div>
        ) : orders.length === 0 ? (
          <div className={ui.empty}>
            <h3 className={ui.emptyTitle}>Пока пусто</h3>
            <p className={ui.muted}>
              {isBlogger
                ? "Новые заказы появятся здесь после оплаты заказчиком."
                : "Выберите автора в каталоге и оформите первый заказ."}
            </p>
            {!isBlogger && (
              <Link href="/catalog" className={ui.btnPrimary} style={{ marginTop: 18 }}>
                Открыть каталог
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.list}>
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderRow}>
                <span className={styles.orderWho}>
                  <span className={styles.orderName}>
                    {isBlogger ? order.client_name ?? "Заказчик" : order.blogger_name ?? "Автор"}
                  </span>
                  <span className={styles.orderBrief}>{order.message}</span>
                </span>
                <span className={styles.orderDate}>{formatDateTime(order.created_at)}</span>
                <span className={styles.orderAmount}>{formatMoney(order.amount_kopeks)}</span>
                <StatusBadge status={order.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </MarketShell>
  );
}
