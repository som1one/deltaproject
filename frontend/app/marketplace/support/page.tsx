"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdMarketplaceShell, PageHeader, statusClass, stitchStyles as styles } from "@/components/marketplace/stitch-marketplace";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";
import { appConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

type Ticket = {
  id: string;
  order_id: string;
  message: string;
  status: string;
  created_at: string;
};

type TicketsResponse = {
  items: Ticket[];
  total: number;
};

export default function SupportPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Загрузка поддержки..." />}>
      <SupportContent />
    </Suspense>
  );
}

function SupportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated, isHydrated } = useAuth();
  const orderId = searchParams.get("order") || "";

  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/marketplace/auth/login?next=/marketplace/support");
  }, [isAuthenticated, isHydrated, router]);

  const { data: tickets, isLoading } = useQuery<TicketsResponse>({
    queryKey: ["marketplace-support-tickets"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/support/tickets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Не удалось загрузить обращения");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Откройте поддержку из карточки заказа, чтобы привязать обращение.");
      if (!message.trim()) throw new Error("Введите сообщение");
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/support/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ order_id: orderId, message: message.trim() }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось создать обращение");
      }
      return response.json();
    },
    onSuccess: () => {
      setNotice("Обращение отправлено. Мы свяжемся с вами в ближайшее время.");
      setError("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["marketplace-support-tickets"] });
    },
    onError: (err: Error) => {
      setNotice("");
      setError(err.message);
    },
  });

  return (
    <AdMarketplaceShell>
      <main className={styles.main}>
        <PageHeader
          eyebrow="Support desk"
          title="Поддержка"
          lead="Создайте обращение по заказу или посмотрите историю диалогов с командой платформы."
        />

        <div className={styles.dashboardGrid}>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Новое обращение</h2>
            <p className={styles.muted}>
              {orderId ? `Заказ #${orderId.slice(0, 8)}` : "Для нового обращения нужен номер заказа."}
            </p>
            {notice && <p className={styles.successText}>{notice}</p>}
            {error && <p className={styles.errorText}>{error}</p>}
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                createTicketMutation.mutate();
              }}
            >
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Сообщение</span>
                <textarea
                  className={styles.lineTextarea}
                  maxLength={2000}
                  placeholder="Опишите вопрос или проблему..."
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>
              <button className={styles.primaryButton} disabled={createTicketMutation.isPending} type="submit">
                {createTicketMutation.isPending ? "Отправляем..." : "Отправить обращение"}
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>Мои обращения</h2>
            {isLoading && <LoadingSpinner size="small" text="Загрузка..." />}
            {!isLoading && tickets?.items.length === 0 && (
              <p className={styles.emptyText}>У вас пока нет обращений в поддержку.</p>
            )}
            <div className={styles.list} style={{ marginTop: "18px" }}>
              {tickets?.items.map((ticket) => (
                <div className={styles.rowItem} key={ticket.id}>
                  <div>
                    <strong>{ticket.message}</strong>
                    <p className={styles.muted}>{formatDateTime(ticket.created_at)}</p>
                  </div>
                  <span className={statusClass(ticket.status)}>
                    {ticket.status === "open" ? "Открыт" : "Решён"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AdMarketplaceShell>
  );
}
