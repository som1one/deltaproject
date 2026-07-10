"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { StampBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { dealNo } from "@/lib/registry";
import type { OrdersResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";
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
            <h1 className={styles.headTitle}>
              Реестр <span className={s.mark}>сделок</span>
            </h1>
          </div>
          {!isBlogger && (
            <Link href="/catalog" className={ui.btnLine}>
              Новая сделка
            </Link>
          )}
        </header>

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
        ) : orders.length === 0 ? (
          <div className={ui.empty}>
            <h3 className={ui.emptyTitle}>{isBlogger ? "Входящих сделок пока нет" : "Реестр пока пуст"}</h3>
            <p className={ui.emptyText}>
              {isBlogger
                ? "Новые сделки появятся здесь после того, как заказчик оплатит заказ."
                : "Выберите автора в указателе и оформите первую сделку."}
            </p>
            {!isBlogger && (
              <Link href="/catalog" className={ui.btnPrimary}>
                Открыть каталог
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.list}>
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderRow}>
                <span className={styles.orderNum}>№&nbsp;{dealNo(order.id, order.created_at)}</span>
                <span className={styles.orderWho}>
                  <span className={styles.orderName}>
                    {isBlogger ? order.client_name ?? "Заказчик" : order.blogger_name ?? "Автор"}
                  </span>
                  <span className={styles.orderBrief}>{order.message}</span>
                </span>
                <span className={styles.orderDate}>{formatDateTime(order.created_at)}</span>
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
