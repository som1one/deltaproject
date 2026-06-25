"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AdMarketplaceShell,
  OrderCard,
  PageHeader,
  stitchStyles as styles,
  type OrderItem,
} from "@/components/marketplace/stitch-marketplace";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";

type OrdersResponse = {
  items: OrderItem[];
  total: number;
};

export default function MarketplaceOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated, isHydrated } = useAuth();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/auth/login?next=/orders");
  }, [isAuthenticated, isHydrated, router]);

  const { data, isLoading, error } = useQuery<OrdersResponse>({
    queryKey: ["marketplace-orders"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/orders`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Не удалось загрузить заказы");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const confirmMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/orders/${orderId}/confirm`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось подтвердить заказ");
      }
      return response.json();
    },
    onSuccess: () => {
      setMessage("Заказ подтверждён, средства распределены.");
      queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <AdMarketplaceShell>
      <main className={styles.main}>
        <PageHeader
          eyebrow="Client cabinet"
          title="Мои заказы"
          lead="Контролируйте оплату, статусы и финальное подтверждение рекламных интеграций."
        />

        {message && <p className={message.includes("подтверждён") ? styles.successText : styles.errorText}>{message}</p>}
        {isLoading && <LoadingSpinner text="Загружаем заказы..." />}
        {error && <p className={styles.errorText}>{error instanceof Error ? error.message : "Ошибка"}</p>}
        {!isLoading && data?.items.length === 0 && (
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Пока пусто</h2>
            <p className={styles.muted}>Выберите блогера в каталоге и отправьте первый проект.</p>
            <Link className={styles.primaryButton} href="/">
              Перейти в каталог
            </Link>
          </section>
        )}
        <div className={styles.list}>
          {data?.items.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              action={
                order.status === "BLOGGER_CONFIRMED" ? (
                  <button
                    className={styles.primaryButton}
                    disabled={confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate(order.id)}
                    type="button"
                  >
                    Подтвердить
                  </button>
                ) : (
                  <Link className={styles.secondaryButton} href={`/support?order=${order.id}`}>
                    Поддержка
                  </Link>
                )
              }
            />
          ))}
        </div>
      </main>
    </AdMarketplaceShell>
  );
}
