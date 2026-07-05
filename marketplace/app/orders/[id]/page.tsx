"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { CopyButton, StatusBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCardNumber, formatDateTime, formatMoney } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/app/orders/orders.module.css";

const CardIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const BankIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);

type TimelineStep = {
  key: string;
  label: string;
  hint: string;
  state: "done" | "active" | "todo";
};

const buildTimeline = (order: OrderDetail): TimelineStep[] => {
  const terminalNegative = ["CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status);
  const stageIndex: Record<string, number> = {
    PENDING_PAYMENT: 0,
    ESCROW_HELD: 1,
    BLOGGER_CONFIRMED: 2,
    COMPLETED: 3,
  };
  const current = stageIndex[order.status] ?? 0;

  const steps = [
    {
      key: "created",
      label: "Заказ создан",
      hint: formatDateTime(order.created_at),
    },
    {
      key: "paid",
      label: "Оплата получена",
      hint:
        order.paid_at != null
          ? formatDateTime(order.paid_at)
          : order.payment_reported_at != null
            ? "Вы сообщили об оплате — ждём подтверждения платформы"
            : "Переведите оплату по реквизитам",
    },
    {
      key: "work",
      label: "Автор выполняет заказ",
      hint: order.blogger_confirmed_at != null ? "Автор отметил выполнение" : "Интеграция готовится и публикуется",
    },
    {
      key: "done",
      label: "Заказ завершён",
      hint: order.completed_at != null ? formatDateTime(order.completed_at) : "Вы подтверждаете результат — автор получает гонорар",
    },
  ];

  return steps.map((step, index) => ({
    ...step,
    state:
      terminalNegative && index > current
        ? "todo"
        : index < current || order.status === "COMPLETED"
          ? "done"
          : index === current
            ? "active"
            : "todo",
  })) as TimelineStep[];
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const orderId = params.id;

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(`/auth/login?next=/orders/${orderId}`);
    }
  }, [isAuthenticated, isHydrated, orderId, router]);

  const { data: order, isLoading, error } = useQuery<OrderDetail>({
    queryKey: ["marketplace-order", orderId],
    queryFn: () => api.getOrder(orderId),
    enabled: isHydrated && isAuthenticated && Boolean(orderId),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING_PAYMENT" ? 15_000 : false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["marketplace-order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
  };

  const markPaidMutation = useMutation({
    mutationFn: () => api.markOrderPaid(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Спасибо! Мы уведомили платформу — оплату подтвердят в ближайшее время." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.confirmOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Заказ завершён. Гонорар передан автору — спасибо за сделку!" });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Заказ отменён." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Отмечено! Заказчик получил уведомление и подтвердит результат." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const payOnlineMutation = useMutation({
    mutationFn: () => api.createPayment(orderId),
    onSuccess: (data) => {
      window.location.href = data.payment_url;
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const actions = order?.available_actions ?? [];
  const canMarkPaid = actions.includes("mark_paid");
  const canConfirm = actions.includes("confirm");
  const canCancel = actions.includes("cancel");
  const canComplete = actions.includes("complete");

  const showPayment =
    order != null &&
    order.status === "PENDING_PAYMENT" &&
    !isBlogger &&
    (order.card_requisites != null || order.settlement_account != null || order.yookassa_available);

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <div className={styles.detailWrap}>
          <Link href={isBlogger ? "/blogger" : "/orders"} className={styles.backLink}>
            ← Ко всем заказам
          </Link>

          {isLoading || !isHydrated ? (
            <div className={styles.detailLayout}>
              <div className={ui.skeleton} style={{ height: 380, borderRadius: 28 }} />
              <div className={ui.skeleton} style={{ height: 300, borderRadius: 28 }} />
            </div>
          ) : error || !order ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Заказ не найден</h3>
              <p className={ui.muted}>Проверьте ссылку или вернитесь к списку заказов.</p>
            </div>
          ) : (
            <>
              <header className={styles.detailHead}>
                <div>
                  <StatusBadge status={order.status} />
                  <h1 className={styles.detailTitle}>
                    {isBlogger
                      ? `Заказ от ${order.client_name ?? "заказчика"}`
                      : `Интеграция у ${order.blogger_name ?? "автора"}`}
                  </h1>
                </div>
                <div className={styles.detailAmount}>
                  <span className={ui.statLabel}>Сумма сделки</span>
                  <div className={styles.detailAmountValue}>{formatMoney(order.amount_kopeks)}</div>
                </div>
              </header>

              {notice && (
                <div
                  className={notice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
                  style={{ marginBottom: 22 }}
                >
                  {notice.text}
                </div>
              )}

              {order.payment_reported_at && order.status === "PENDING_PAYMENT" && (
                <div className={ui.noticeWarning} style={{ marginBottom: 22 }}>
                  Вы сообщили об оплате {formatDateTime(order.payment_reported_at)}. Платформа проверит
                  поступление и переведёт заказ в работу.
                </div>
              )}

              <div className={styles.detailLayout}>
                <div className={styles.mainCol}>
                  {/* ── Payment ── */}
                  {showPayment && (
                    <section className={ui.panel}>
                      <h2 className={styles.panelTitle}>Оплата заказа</h2>
                      <div className={styles.payAmountLine}>
                        <span className={styles.payAmountLabel}>Сумма к переводу</span>
                        <span className={styles.payAmountValue}>{formatMoney(order.amount_kopeks)}</span>
                      </div>

                      {order.card_requisites && (
                        <div className={styles.payMethod}>
                          <div className={styles.payMethodHead}>
                            <CardIcon />
                            <span className={styles.payMethodTitle}>Перевод на карту</span>
                          </div>
                          <div className={ui.defList}>
                            <div className={ui.defRow}>
                              <span className={ui.defKey}>Номер карты</span>
                              <span className={`${ui.defValue} ${ui.mono}`}>
                                {formatCardNumber(order.card_requisites.card_number)}{" "}
                                <CopyButton value={order.card_requisites.card_number} />
                              </span>
                            </div>
                            {order.card_requisites.card_holder && (
                              <div className={ui.defRow}>
                                <span className={ui.defKey}>Получатель</span>
                                <span className={ui.defValue}>{order.card_requisites.card_holder}</span>
                              </div>
                            )}
                            {order.card_requisites.card_bank && (
                              <div className={ui.defRow}>
                                <span className={ui.defKey}>Банк</span>
                                <span className={ui.defValue}>{order.card_requisites.card_bank}</span>
                              </div>
                            )}
                            {order.card_requisites.sbp_phone && (
                              <div className={ui.defRow}>
                                <span className={ui.defKey}>СБП / телефон</span>
                                <span className={`${ui.defValue} ${ui.mono}`}>
                                  {order.card_requisites.sbp_phone}{" "}
                                  <CopyButton value={order.card_requisites.sbp_phone} />
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {order.settlement_account && (
                        <div className={styles.payMethod}>
                          <div className={styles.payMethodHead}>
                            <BankIcon />
                            <span className={styles.payMethodTitle}>Банковский перевод (р/с)</span>
                          </div>
                          <div className={ui.defList}>
                            <div className={ui.defRow}>
                              <span className={ui.defKey}>Расчётный счёт</span>
                              <span className={`${ui.defValue} ${ui.mono}`}>
                                {order.settlement_account.account_number}{" "}
                                <CopyButton value={order.settlement_account.account_number} />
                              </span>
                            </div>
                            <div className={ui.defRow}>
                              <span className={ui.defKey}>БИК</span>
                              <span className={`${ui.defValue} ${ui.mono}`}>{order.settlement_account.bic}</span>
                            </div>
                            <div className={ui.defRow}>
                              <span className={ui.defKey}>Банк</span>
                              <span className={ui.defValue}>{order.settlement_account.bank_name}</span>
                            </div>
                            <div className={ui.defRow}>
                              <span className={ui.defKey}>Получатель</span>
                              <span className={ui.defValue}>{order.settlement_account.recipient_name}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {!order.card_requisites && !order.settlement_account && !order.yookassa_available && (
                        <div className={ui.notice}>
                          Реквизиты оплаты пока не настроены. Свяжитесь с поддержкой платформы.
                        </div>
                      )}

                      <div className={styles.actionsCol} style={{ marginTop: 20 }}>
                        {order.yookassa_available && (
                          <button
                            type="button"
                            className={ui.btnBronze}
                            onClick={() => payOnlineMutation.mutate()}
                            disabled={payOnlineMutation.isPending}
                          >
                            {payOnlineMutation.isPending ? "Готовим оплату…" : "Оплатить онлайн"}
                          </button>
                        )}
                        {canMarkPaid && (
                          <button
                            type="button"
                            className={ui.btnPrimary}
                            onClick={() => markPaidMutation.mutate()}
                            disabled={markPaidMutation.isPending}
                          >
                            {markPaidMutation.isPending ? "Отправляем…" : "Я перевёл(а) оплату"}
                          </button>
                        )}
                        <p className={ui.fine}>
                          После перевода нажмите «Я перевёл(а) оплату» — платформа проверит поступление
                          и переведёт заказ в работу. Деньги остаются под защитой до подтверждения результата.
                        </p>
                      </div>
                    </section>
                  )}

                  {/* ── Brief ── */}
                  <section className={ui.panel}>
                    <h2 className={styles.panelTitle}>Бриф</h2>
                    <p className={styles.brief}>{order.message}</p>
                    <hr className={ui.divider} />
                    <div className={styles.metaGrid}>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Создан</span>
                        <span className={ui.defValue}>{formatDateTime(order.created_at)}</span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Номер заказа</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{order.id.slice(0, 8)}</span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>{isBlogger ? "Заказчик" : "Автор"}</span>
                        <span className={ui.defValue}>
                          {isBlogger ? order.client_name ?? "—" : order.blogger_name ?? "—"}
                        </span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Оплачен</span>
                        <span className={ui.defValue}>{formatDateTime(order.paid_at)}</span>
                      </div>
                    </div>
                  </section>
                </div>

                <aside className={styles.sideCol}>
                  {/* ── Timeline ── */}
                  <section className={ui.panel}>
                    <h2 className={styles.panelTitle}>Ход сделки</h2>
                    {["CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status) ? (
                      <div className={ui.noticeDanger}>
                        {order.status === "CANCELLED" && "Заказ отменён."}
                        {order.status === "REFUNDED" && "По заказу оформлен возврат средств."}
                        {order.status === "PAYMENT_FAILED" && "Оплата не прошла. Создайте заказ заново или обратитесь в поддержку."}
                      </div>
                    ) : (
                      <div className={ui.timeline}>
                        {buildTimeline(order).map((step) => (
                          <div key={step.key} className={ui.timelineItem}>
                            <span
                              className={
                                step.state === "done"
                                  ? ui.timelineDotDone
                                  : step.state === "active"
                                    ? ui.timelineDotActive
                                    : ui.timelineDot
                              }
                            />
                            <div>
                              <div className={ui.timelineLabel}>{step.label}</div>
                              <div className={ui.timelineHint}>{step.hint}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* ── Actions ── */}
                  {(canConfirm || canCancel || canComplete) && (
                    <section className={ui.panel}>
                      <h2 className={styles.panelTitle}>Действия</h2>
                      <div className={styles.actionsCol}>
                        {canComplete && (
                          <>
                            <button
                              type="button"
                              className={ui.btnPrimary}
                              onClick={() => completeMutation.mutate()}
                              disabled={completeMutation.isPending}
                            >
                              {completeMutation.isPending ? "Сохраняем…" : "Работа выполнена"}
                            </button>
                            <p className={ui.fine}>
                              Отмечайте после публикации интеграции — заказчик получит уведомление.
                            </p>
                          </>
                        )}
                        {canConfirm && (
                          <>
                            <button
                              type="button"
                              className={ui.btnPrimary}
                              onClick={() => confirmMutation.mutate()}
                              disabled={confirmMutation.isPending}
                            >
                              {confirmMutation.isPending ? "Подтверждаем…" : "Подтвердить результат"}
                            </button>
                            <p className={ui.fine}>
                              Подтверждение завершает сделку и передаёт гонорар автору.
                            </p>
                          </>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            className={ui.btnDanger}
                            onClick={() => {
                              if (window.confirm("Отменить заказ? Действие необратимо.")) {
                                cancelMutation.mutate();
                              }
                            }}
                            disabled={cancelMutation.isPending}
                          >
                            {cancelMutation.isPending ? "Отменяем…" : "Отменить заказ"}
                          </button>
                        )}
                      </div>
                    </section>
                  )}

                  {/* ── Support ── */}
                  {["ESCROW_HELD", "BLOGGER_CONFIRMED"].includes(order.status) && (
                    <section className={ui.panel}>
                      <h2 className={styles.panelTitle}>Возникла проблема?</h2>
                      <p className={ui.muted} style={{ margin: "0 0 16px" }}>
                        Служба поддержки разберёт спорную ситуацию и примет решение по сделке.
                      </p>
                      <Link href={`/support?order=${order.id}`} className={ui.btnSecondary} style={{ width: "100%" }}>
                        Открыть спор
                      </Link>
                    </section>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </MarketShell>
  );
}
