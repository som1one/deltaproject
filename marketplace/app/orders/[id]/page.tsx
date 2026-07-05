"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { CopyButton, StampBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCardNumber, formatDateTime, formatMoney } from "@/lib/format";
import { orderMoneyLocation } from "@/lib/order-status";
import { dealNo } from "@/lib/registry";
import type { OrderDetail } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/app/orders/orders.module.css";

const CardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

const BankIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);

type StepState = "done" | "active" | "todo" | "alert";

const STEP_NAMES = ["Бриф", "Оплата", "Публикация", "Подтверждение", "Выплата"];

const buildSteps = (order: OrderDetail): { name: string; state: StepState; hint: string }[] => {
  const negative = ["CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status);
  const stageIndex: Record<string, number> = {
    PENDING_PAYMENT: 1,
    ESCROW_HELD: 2,
    BLOGGER_CONFIRMED: 3,
    COMPLETED: 5,
  };
  const current = stageIndex[order.status] ?? 0;

  const hints = [
    formatDateTime(order.created_at),
    order.paid_at != null
      ? formatDateTime(order.paid_at)
      : order.payment_reported_at != null
        ? "Ждём подтверждения"
        : "По реквизитам ниже",
    order.blogger_confirmed_at != null ? "Отмечено автором" : "Готовится",
    order.completed_at != null ? formatDateTime(order.completed_at) : "Ждёт подтверждения",
    order.completed_at != null ? "Гонорар передан" : "—",
  ];

  return STEP_NAMES.map((name, i) => {
    let state: StepState;
    if (negative) {
      state = i === 0 ? "done" : i === 1 && order.status === "PAYMENT_FAILED" ? "alert" : "todo";
    } else {
      state = i < current ? "done" : i === current ? "active" : "todo";
    }
    return { name, state, hint: hints[i] };
  });
};

const stepClass = (state: StepState): string => {
  if (state === "done") return styles.stepDone;
  if (state === "active") return styles.stepActive;
  if (state === "alert") return styles.stepAlert;
  return styles.stepTodo;
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
      setNotice({ tone: "success", text: "Мы уведомили платформу — оплату подтвердят в ближайшее время." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.confirmOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Сделка завершена. Гонорар передан автору." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Сделка отменена." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Отмечено. Заказчик получил уведомление и подтвердит публикацию." });
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

  const negative = order != null && ["CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status);

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <div className={styles.detailWrap}>
          <Link href={isBlogger ? "/blogger" : "/orders"} className={styles.backLink}>
            ← Ко всем сделкам
          </Link>

          {isLoading || !isHydrated ? (
            <>
              <div className={ui.skeleton} style={{ height: 260, marginBottom: 22 }} />
              <div className={styles.detailLayout}>
                <div className={ui.skeleton} style={{ height: 300 }} />
                <div className={ui.skeleton} style={{ height: 240 }} />
              </div>
            </>
          ) : error || !order ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Сделка не найдена</h3>
              <p className={ui.emptyText}>Проверьте ссылку или вернитесь к реестру сделок.</p>
              <Link href="/orders" className={ui.btnLine}>
                К реестру сделок
              </Link>
            </div>
          ) : (
            <>
              {/* ── Постоянная панель статуса ── */}
              <section className={styles.statusPanel}>
                <div className={styles.statusTop}>
                  <div>
                    <div className={styles.statusDealNo}>№&nbsp;{dealNo(order.id, order.created_at)}</div>
                    <h1 className={styles.statusParty}>
                      {isBlogger
                        ? `Заказчик · ${order.client_name ?? "—"}`
                        : `Автор · ${order.blogger_name ?? "—"}`}
                    </h1>
                    <div style={{ marginTop: 14 }}>
                      <StampBadge status={order.status} />
                    </div>
                  </div>
                  <div>
                    <div className={styles.statusAmountLabel}>Сумма сделки</div>
                    <div className={styles.statusAmountValue}>{formatMoney(order.amount_kopeks)}</div>
                  </div>
                </div>

                <div className={styles.money}>
                  <span className={styles.moneyLabel}>Деньги</span>
                  <span className={styles.moneyValue}>{orderMoneyLocation(order.status)}</span>
                </div>

                <div className={styles.steps}>
                  {buildSteps(order).map((step, i) => (
                    <div key={step.name} className={`${styles.step} ${stepClass(step.state)}`}>
                      <span className={styles.stepNo}>{String(i + 1).padStart(2, "0")}</span>
                      <span className={styles.stepName}>{step.name}</span>
                      <span className={styles.stepHint}>{step.hint}</span>
                    </div>
                  ))}
                </div>
              </section>

              {notice && (
                <div
                  className={notice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
                  style={{ marginBottom: 22 }}
                >
                  {notice.text}
                </div>
              )}

              {negative && (
                <div className={ui.noticeDanger} style={{ marginBottom: 22 }}>
                  {order.status === "CANCELLED" && "Сделка отменена."}
                  {order.status === "REFUNDED" && "По сделке оформлен возврат средств заказчику."}
                  {order.status === "PAYMENT_FAILED" &&
                    "Оплата не прошла. Создайте сделку заново или обратитесь в поддержку."}
                </div>
              )}

              {order.payment_reported_at && order.status === "PENDING_PAYMENT" && (
                <div className={ui.noticeWarning} style={{ marginBottom: 22 }}>
                  Вы сообщили об оплате {formatDateTime(order.payment_reported_at)}. Платформа проверит
                  поступление и переведёт сделку в работу.
                </div>
              )}

              <div className={styles.detailLayout}>
                <div className={styles.mainCol}>
                  {/* ── Оплата ── */}
                  {showPayment && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Оплата по реквизитам</h2>
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
                                <span className={ui.defKey}>СБП · телефон</span>
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
                            className={ui.btnLine}
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
                            {markPaidMutation.isPending ? "Отправляем…" : "Я перевёл оплату"}
                          </button>
                        )}
                        <p className={ui.fine}>
                          После перевода нажмите «Я перевёл оплату» — платформа проверит поступление
                          и переведёт сделку в работу. Деньги удерживаются до подтверждения публикации.
                        </p>
                      </div>
                    </section>
                  )}

                  {/* ── Бриф ── */}
                  <section className={styles.panel}>
                    <h2 className={styles.panelTitle}>Бриф</h2>
                    <p className={styles.brief}>{order.message}</p>
                    <hr className={ui.hr} style={{ margin: "22px 0" }} />
                    <div className={styles.metaGrid}>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Создана</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{formatDateTime(order.created_at)}</span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>№ сделки</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{dealNo(order.id, order.created_at)}</span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>{isBlogger ? "Заказчик" : "Автор"}</span>
                        <span className={ui.defValue}>
                          {isBlogger ? order.client_name ?? "—" : order.blogger_name ?? "—"}
                        </span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Оплачена</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{formatDateTime(order.paid_at)}</span>
                      </div>
                    </div>
                  </section>
                </div>

                <aside className={styles.sideCol}>
                  {(canConfirm || canCancel || canComplete) && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Действия по сделке</h2>
                      <div className={styles.actionsCol}>
                        {canComplete && (
                          <>
                            <button
                              type="button"
                              className={ui.btnPrimary}
                              onClick={() => completeMutation.mutate()}
                              disabled={completeMutation.isPending}
                            >
                              {completeMutation.isPending ? "Сохраняем…" : "Отметить публикацию"}
                            </button>
                            <p className={ui.fine}>
                              Отмечайте после выхода интеграции — заказчик получит уведомление.
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
                              {confirmMutation.isPending ? "Подтверждаем…" : "Подтвердить публикацию"}
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
                              if (window.confirm("Отменить сделку? Действие необратимо.")) {
                                cancelMutation.mutate();
                              }
                            }}
                            disabled={cancelMutation.isPending}
                          >
                            {cancelMutation.isPending ? "Отменяем…" : "Отменить сделку"}
                          </button>
                        )}
                      </div>
                    </section>
                  )}

                  {["ESCROW_HELD", "BLOGGER_CONFIRMED"].includes(order.status) && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Спорная ситуация</h2>
                      <p className={ui.muted} style={{ margin: "0 0 16px", fontSize: 14 }}>
                        Служба поддержки разберёт спор и примет решение по сделке — вернуть
                        средства или передать гонорар.
                      </p>
                      <Link href={`/support?order=${order.id}`} className={`${ui.btnLine} ${ui.btnBlock}`}>
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
