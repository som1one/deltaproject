"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { StampBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatMoney } from "@/lib/format";
import { dealNo } from "@/lib/registry";
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
      setNotice({
        tone: "success",
        text: "Сделка отмечена выполненной. Заказчик подтвердит публикацию — и гонорар зачислится.",
      });
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
            <h3 className={ui.emptyTitle}>Раздел для авторов</h3>
            <p className={ui.emptyText}>Вы вошли как заказчик. Ваши сделки — в разделе «Мои сделки».</p>
            <Link href="/orders" className={ui.btnPrimary}>
              К моим сделкам
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
            <span className={ui.brow}>Кабинет автора</span>
            <h1 className={styles.headTitle}>
              {userName ? `Здравствуйте, ${userName.split(" ")[0]}` : "Входящие сделки"}
            </h1>
          </div>
          <a href={`${appConfig.mainAppUrl}/blogger/profile`} target="_blank" rel="noreferrer" className={ui.btnLine}>
            Редактировать профиль ↗
          </a>
        </header>

        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <div className={styles.statValue}>{String(inWork.length).padStart(2, "0")}</div>
            <div className={styles.statLabel}>сделок в работе</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>{String(orders.length).padStart(2, "0")}</div>
            <div className={styles.statLabel}>всего сделок</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>{formatMoney(totalEarnedKopeks)}</div>
            <div className={styles.statLabel}>завершено на сумму</div>
          </div>
        </div>

        <div className={ui.notice} style={{ marginBottom: 28 }}>
          Профиль в каталоге, цены и портфолио редактируются в кабинете платформы looney moon.
          Здесь — входящие сделки и отметка о публикации. Выплаты — также через кабинет платформы.
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
            <h3 className={ui.emptyTitle}>Входящих сделок пока нет</h3>
            <p className={ui.emptyText}>
              Проверьте, что профиль активен и цены актуальны — сделки появятся здесь после оплаты.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {orders.map((order) => (
              <div key={order.id} className={styles.orderRow}>
                <Link href={`/orders/${order.id}`} className={styles.orderNum}>
                  №&nbsp;{dealNo(order.id, order.created_at)}
                </Link>
                <Link href={`/orders/${order.id}`} className={styles.orderWho}>
                  <span className={styles.orderName}>{order.client_name ?? "Заказчик"}</span>
                  <span className={styles.orderBrief}>{order.message}</span>
                </Link>
                <span className={styles.orderDate}>{formatDateTime(order.created_at)}</span>
                <span className={styles.orderAmount}>{formatMoney(order.amount_kopeks)}</span>
                <span className={styles.orderStampCell}>
                  {order.status === "ESCROW_HELD" ? (
                    <button
                      type="button"
                      className={`${ui.btnPrimary} ${ui.btnSmall}`}
                      onClick={() => completeMutation.mutate(order.id)}
                      disabled={completeMutation.isPending}
                    >
                      Отметить публикацию
                    </button>
                  ) : (
                    <StampBadge status={order.status} />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </MarketShell>
  );
}
