"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { StatusBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { OrdersResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/app/orders/orders.module.css";

export default function BloggerCabinetPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, isBlogger, userName } = useAuth();
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated) {
      router.replace("/auth/login?role=blogger&next=/blogger");
    }
  }, [isAuthenticated, isHydrated, router]);

  const { data, isLoading, error } = useQuery<OrdersResponse>({
    queryKey: ["marketplace-orders", "blogger"],
    queryFn: () => api.getOrders("?page_size=50"),
    enabled: isHydrated && isAuthenticated && isBlogger,
  });

  const completeMutation = useMutation({
    mutationFn: (orderId: string) => api.completeOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Заказ отмечен выполненным. Заказчик подтвердит результат — и гонорар зачислится." });
      queryClient.invalidateQueries({ queryKey: ["marketplace-orders", "blogger"] });
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const orders = data?.items ?? [];
  const inWork = orders.filter((o) => o.status === "ESCROW_HELD");
  const totalEarnedKopeks = orders
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + o.amount_kopeks, 0);

  if (isHydrated && isAuthenticated && !isBlogger) {
    return (
      <MarketShell>
        <div className={shell.pageContainer}>
          <div className={ui.empty} style={{ marginTop: 60 }}>
            <h3 className={ui.emptyTitle}>Раздел для блогеров</h3>
            <p className={ui.muted}>Вы вошли как заказчик. Ваши заказы — в разделе «Мои заказы».</p>
            <Link href="/orders" className={ui.btnPrimary} style={{ marginTop: 18 }}>
              К моим заказам
            </Link>
          </div>
        </div>
      </MarketShell>
    );
  }

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <div>
            <span className={ui.eyebrow}>Кабинет блогера</span>
            <h1 className={ui.displayTitle} style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>
              {userName ? `Здравствуйте, ${userName.split(" ")[0]}` : "Ваши заказы"}
            </h1>
          </div>
          <a
            href={`${appConfig.mainAppUrl}/blogger/profile`}
            target="_blank"
            rel="noreferrer"
            className={ui.btnSecondary}
          >
            Редактировать профиль ↗
          </a>
        </header>

        <div className={ui.grid3} style={{ marginBottom: 32 }}>
          <div className={ui.card}>
            <div className={ui.statValue}>{inWork.length}</div>
            <div className={ui.statLabel}>заказов в работе</div>
          </div>
          <div className={ui.card}>
            <div className={ui.statValue}>{orders.length}</div>
            <div className={ui.statLabel}>всего заказов</div>
          </div>
          <div className={ui.card}>
            <div className={ui.statValue}>{formatMoney(totalEarnedKopeks)}</div>
            <div className={ui.statLabel}>завершено на сумму</div>
          </div>
        </div>

        <div className={ui.notice} style={{ marginBottom: 28 }}>
          Профиль в каталоге, цены и портфолио редактируются в кабинете платформы looney moon.
          Здесь — входящие заказы и отметка о выполнении. Выплаты — также через кабинет платформы.
        </div>

        {notice && (
          <div
            className={notice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
            style={{ marginBottom: 22 }}
          >
            {notice.text}
          </div>
        )}

        {isLoading ? (
          <div className={styles.list}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={ui.skeleton} style={{ height: 84, borderRadius: 20 }} />
            ))}
          </div>
        ) : error ? (
          <div className={ui.noticeDanger}>Не удалось загрузить заказы. Обновите страницу.</div>
        ) : orders.length === 0 ? (
          <div className={ui.empty}>
            <h3 className={ui.emptyTitle}>Заказов пока нет</h3>
            <p className={ui.muted}>
              Проверьте, что профиль активен и цены актуальны — заказы появятся здесь после оплаты.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {orders.map((order) => (
              <div key={order.id} className={styles.orderRow}>
                <Link href={`/orders/${order.id}`} className={styles.orderWho}>
                  <span className={styles.orderName}>{order.client_name ?? "Заказчик"}</span>
                  <span className={styles.orderBrief}>{order.message}</span>
                </Link>
                <span className={styles.orderDate}>{formatDateTime(order.created_at)}</span>
                <span className={styles.orderAmount}>{formatMoney(order.amount_kopeks)}</span>
                {order.status === "ESCROW_HELD" ? (
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    style={{ height: 40 }}
                    onClick={() => completeMutation.mutate(order.id)}
                    disabled={completeMutation.isPending}
                  >
                    Выполнено
                  </button>
                ) : (
                  <StatusBadge status={order.status} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MarketShell>
  );
}
