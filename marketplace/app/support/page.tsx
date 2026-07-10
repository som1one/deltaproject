"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";
import styles from "@/app/orders/orders.module.css";

const SUBJECTS = [
  { value: "dispute", label: "Спор по сделке" },
  { value: "payment", label: "Оплата и выплаты" },
  { value: "technical", label: "Технический вопрос" },
  { value: "general", label: "Общий вопрос" },
];
const SUBJECT_LABELS: Record<string, string> = Object.fromEntries(SUBJECTS.map((x) => [x.value, x.label]));
const SUBJECT_HINTS: Record<string, string> = {
  dispute:
    "Спор открывается по оплаченной сделке. Мы изучим детали и решим — вернуть средства заказчику или передать гонорар автору.",
  payment: "Вопрос по оплате, эскроу или выплате. Если он по конкретной сделке — укажите её ниже.",
  technical: "Что-то не работает или отображается неверно? Опишите, что произошло и что вы ожидали увидеть.",
  general: "Любой другой вопрос по площадке — ответим и поможем.",
};

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportContent />
    </Suspense>
  );
}

function SupportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isHydrated } = useAuth();

  const initialOrder = searchParams.get("order") ?? "";
  const [subject, setSubject] = useState(initialOrder ? "dispute" : "general");
  const [orderId, setOrderId] = useState(initialOrder);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const showOrderField = subject === "dispute" || subject === "payment";
  const orderRequired = subject === "dispute";

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/auth/login?next=/support");
  }, [isAuthenticated, isHydrated, router]);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["marketplace-support-tickets"],
    queryFn: () => api.getTickets("?page_size=50"),
    enabled: isHydrated && isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const trimmedOrder = orderId.trim();
      // Сделку шлём только для тем, где она уместна, и только если заполнена.
      const sendOrder = showOrderField && trimmedOrder ? trimmedOrder : undefined;
      return api.createTicket({
        subject,
        ...(sendOrder ? { order_id: sendOrder } : {}),
        message: message.trim(),
      });
    },
    onSuccess: () => {
      setNotice({ tone: "success", text: "Обращение создано. Поддержка ответит в ближайшее время." });
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["marketplace-support-tickets"] });
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.headTitle}>
              <span className={s.mark}>Поддержка</span>
            </h1>
          </div>
        </header>

        <div className={ui.grid2} style={{ alignItems: "start" }}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Новое обращение</h2>
            <p className={ui.muted} style={{ margin: "0 0 20px", fontSize: 14.5 }}>
              {SUBJECT_HINTS[subject]}
            </p>
            {notice && (
              <div
                className={notice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
                style={{ marginBottom: 18 }}
              >
                {notice.text}
              </div>
            )}
            <form
              className={ui.form}
              onSubmit={(e) => {
                e.preventDefault();
                setNotice(null);
                createMutation.mutate();
              }}
            >
              <div className={ui.field}>
                <span className={ui.fieldLabel}>Тема обращения</span>
                <Select
                  value={subject}
                  onChange={setSubject}
                  options={SUBJECTS}
                  ariaLabel="Тема обращения"
                  className={ui.selectField}
                />
              </div>
              {showOrderField && (
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>
                    {orderRequired ? "Идентификатор сделки" : "Сделка (необязательно)"}
                  </span>
                  <input
                    className={`${ui.input} ${ui.mono}`}
                    required={orderRequired}
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="3f1c9b2e-…"
                  />
                </label>
              )}
              <label className={ui.field}>
                <span className={ui.fieldLabel}>Опишите ситуацию</span>
                <textarea
                  className={ui.textarea}
                  maxLength={2000}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Что произошло и какого решения вы ожидаете"
                />
              </label>
              <button className={`${ui.btnPrimary} ${ui.btnBlock}`} type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Отправляем…" : "Отправить обращение"}
              </button>
            </form>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Мои обращения</h2>
            {isLoading ? (
              <div className={ui.skeleton} style={{ height: 140 }} />
            ) : !tickets || tickets.items.length === 0 ? (
              <p className={ui.muted} style={{ margin: 0, fontSize: 14.5 }}>
                Обращений пока нет — надеемся, так и останется.
              </p>
            ) : (
              <div className={ui.defList}>
                {tickets.items.map((ticket) => (
                  <div key={ticket.id} className={ui.defRow} style={{ alignItems: "flex-start" }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className={ui.tag}>{SUBJECT_LABELS[ticket.subject] ?? "Обращение"}</span>
                        {ticket.order_id && (
                          <Link
                            href={`/orders/${ticket.order_id}`}
                            className={`${ui.mono} ${ui.link}`}
                            style={{ fontSize: 12.5 }}
                          >
                            Сделка {ticket.order_id.slice(0, 8)}
                          </Link>
                        )}
                      </span>
                      <p className={ui.muted} style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                        {ticket.message}
                      </p>
                      <span className={ui.fine}>{formatDateTime(ticket.created_at)}</span>
                    </span>
                    <span className={ticket.status === "open" ? ui.stampActive : ui.stampDone}>
                      {ticket.status === "open" ? "Открыт" : "Решён"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </MarketShell>
  );
}
