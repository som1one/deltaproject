"use client";

import { useEffect, useState } from "react";
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
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

type OrdersResponse = {
  items: OrderItem[];
  total: number;
};

type WithdrawalItem = {
  id: string;
  amount_kopeks: number;
  status: string;
  created_at: string;
};

type WithdrawalsResponse = {
  items: WithdrawalItem[];
  total: number;
};

type ProfileResponse = {
  balance_kopeks?: number;
};

export default function BloggerMarketplacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated, isHydrated } = useAuth();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/marketplace/auth/login?next=/blogger/marketplace");
  }, [isAuthenticated, isHydrated, router]);

  const headers = { Authorization: `Bearer ${accessToken}` };

  const { data: profile } = useQuery<ProfileResponse>({
    queryKey: ["blogger-marketplace-profile-balance"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/blogger/profile`, { headers });
      if (!response.ok) throw new Error("Не удалось загрузить профиль");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: orders, isLoading } = useQuery<OrdersResponse>({
    queryKey: ["blogger-marketplace-orders"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/orders`, { headers });
      if (!response.ok) throw new Error("Не удалось загрузить заказы");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: withdrawals } = useQuery<WithdrawalsResponse>({
    queryKey: ["blogger-marketplace-withdrawals"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/withdrawals`, { headers });
      if (!response.ok) throw new Error("Не удалось загрузить выводы");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const completeMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/orders/${orderId}/complete`, {
        method: "PATCH",
        headers,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось отметить выполнение");
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blogger-marketplace-orders"] }),
    onError: (err: Error) => setMessage(err.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(withdrawAmount.replace(",", "."));
      if (!Number.isFinite(amount) || amount < 1) throw new Error("Минимальная сумма вывода — 1 ₽");
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/withdrawals`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ amount_kopeks: Math.round(amount * 100) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось создать вывод");
      }
      return response.json();
    },
    onSuccess: () => {
      setMessage("Запрос на вывод создан.");
      setWithdrawAmount("");
      queryClient.invalidateQueries({ queryKey: ["blogger-marketplace-profile-balance"] });
      queryClient.invalidateQueries({ queryKey: ["blogger-marketplace-withdrawals"] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <AdMarketplaceShell>
      <main className={styles.main}>
        <PageHeader
          eyebrow="Blogger cabinet"
          title="Заказы и выплаты"
          lead="Следите за проектами, отмечайте выполненные интеграции и выводите заработанные средства."
        />

        {message && <p className={message.includes("создан") ? styles.successText : styles.errorText}>{message}</p>}

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.metricLabel}>Доступный баланс</span>
            <span className={styles.statValue}>{formatMoney(profile?.balance_kopeks ?? 0)}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.metricLabel}>Активные заказы</span>
            <span className={styles.statValue}>{orders?.total ?? 0}</span>
          </div>
        </section>

        <div className={styles.dashboardGrid}>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Вывод средств</h2>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                setMessage("");
                withdrawMutation.mutate();
              }}
            >
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Сумма в рублях</span>
                <input
                  className={styles.lineInput}
                  inputMode="decimal"
                  placeholder="15000"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                />
              </label>
              <button className={styles.primaryButton} disabled={withdrawMutation.isPending} type="submit">
                {withdrawMutation.isPending ? "Отправляем..." : "Вывести"}
              </button>
            </form>

            <div className={styles.list} style={{ marginTop: "24px" }}>
              {withdrawals?.items.map((item) => (
                <div className={styles.rowItem} key={item.id}>
                  <span>{formatDateTime(item.created_at)}</span>
                  <strong>{formatMoney(item.amount_kopeks)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "16px" }}>Заказы</h2>
            {isLoading && <LoadingSpinner text="Загружаем заказы..." />}
            {!isLoading && orders?.items.length === 0 && (
              <p className={styles.emptyText}>Пока нет заказов на маркетплейсе.</p>
            )}
            <div className={styles.list}>
              {orders?.items.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  action={
                    order.status === "ESCROW_HELD" ? (
                      <button
                        className={styles.secondaryButton}
                        disabled={completeMutation.isPending}
                        onClick={() => completeMutation.mutate(order.id)}
                        type="button"
                      >
                        Выполнено
                      </button>
                    ) : null
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    </AdMarketplaceShell>
  );
}
