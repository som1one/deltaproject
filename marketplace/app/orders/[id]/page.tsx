"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Clock3, Hourglass, RotateCcw, Undo2, Wallet, XCircle } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { CopyButton, Modal, Portrait, StampBadge, StarRating } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatCardNumber, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { orderMoneyLocation } from "@/lib/order-status";
import { dealNo } from "@/lib/registry";
import type { OrderDetail, Review } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/app/orders/orders.module.css";

import { Countdown, pluralRu } from "../countdown";

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

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

/* ── Таймлайн ──────────────────────────────────────────────── */

type StepState = "done" | "active" | "todo" | "alert";

const STEP_NAMES = ["Предложение", "Принятие", "Оплата", "Работа", "Сдача", "Завершение"];

const buildSteps = (order: OrderDetail): { name: string; state: StepState; hint: string }[] => {
  const negative = ["OFFER_DECLINED", "CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status);
  const stageIndex: Record<string, number> = {
    OFFER_PENDING: 1,
    PENDING_PAYMENT: 2,
    ESCROW_HELD: 3,
    BLOGGER_CONFIRMED: 4,
    COMPLETED: 6,
  };
  const current = stageIndex[order.status] ?? 0;

  const hints = [
    formatDateTime(order.created_at),
    order.accepted_at != null ? formatDateTime(order.accepted_at) : "Ждём решения",
    order.paid_at != null
      ? formatDateTime(order.paid_at)
      : order.payment_reported_at != null
        ? "Ждём подтверждения"
        : "По реквизитам ниже",
    order.work_submitted_at != null
      ? "Выполнена"
      : order.deadline_at != null
        ? `до ${formatDate(order.deadline_at)}`
        : "После оплаты",
    order.work_submitted_at != null ? formatDateTime(order.work_submitted_at) : "Ссылка и комментарий",
    order.completed_at != null ? formatDateTime(order.completed_at) : "Приёмка заказчиком",
  ];

  return STEP_NAMES.map((name, i) => {
    let state: StepState;
    if (negative) {
      state = i === 0 ? "done" : i === 2 && order.status === "PAYMENT_FAILED" ? "alert" : "todo";
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

/* ── Автолинковка URL в тексте результата ──────────────────── */

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

const linkify = (text: string): ReactNode[] =>
  text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={styles.workLink}>
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

/* ── Карточка отзыва ───────────────────────────────────────── */

const ReviewCard = ({ title, review, privateNote }: { title: string; review: Review; privateNote?: string }) => (
  <section className={styles.panel}>
    <h2 className={styles.panelTitle}>{title}</h2>
    <StarRating value={review.rating} readOnly />
    {review.text && <p className={styles.brief} style={{ marginTop: 12 }}>{review.text}</p>}
    <p className={ui.fine} style={{ marginTop: 12 }}>
      {formatDateTime(review.created_at)}
      {privateNote ? ` · ${privateNote}` : ""}
    </p>
  </section>
);

/* ── Статус-баннер: иконка-плитка + заголовок + пояснение ──── */

type BannerTone = "neutral" | "warning" | "danger";

const BANNER_TONE_CLASS: Record<BannerTone, string> = {
  neutral: styles.bannerNeutral,
  warning: styles.bannerWarning,
  danger: styles.bannerDanger,
};

const StateBanner = ({
  tone,
  icon,
  title,
  children,
}: {
  tone: BannerTone;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) => (
  <div className={`${styles.banner} ${BANNER_TONE_CLASS[tone]}`} role="status">
    <span className={styles.bannerIcon}>{icon}</span>
    <div className={styles.bannerBody}>
      <div className={styles.bannerTitle}>{title}</div>
      <div className={styles.bannerText}>{children}</div>
    </div>
  </div>
);

type ModalKind = "accept" | "decline" | "submit" | "changes" | null;

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [workResult, setWorkResult] = useState("");
  const [changesReason, setChangesReason] = useState("");
  const [formError, setFormError] = useState("");

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewError, setReviewError] = useState("");

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
    // Ждём внешнего события: решения по офферу, оплаты, сдачи работы,
    // приёмки — поллим раз в 15 секунд, пока сделка живая.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "OFFER_PENDING" ||
        status === "PENDING_PAYMENT" ||
        status === "ESCROW_HELD" ||
        status === "BLOGGER_CONFIRMED"
        ? 15_000
        : false;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["marketplace-order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
  };

  const closeModal = () => {
    setModal(null);
    setFormError("");
  };

  const acceptMutation = useMutation({
    mutationFn: () => api.acceptOffer(orderId),
    onSuccess: () => {
      closeModal();
      setNotice({ tone: "success", text: "Предложение принято. Сроки зафиксированы — дальше оплата." });
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const declineMutation = useMutation({
    mutationFn: () => api.declineOffer(orderId, declineReason.trim() || undefined),
    onSuccess: () => {
      closeModal();
      setNotice({ tone: "success", text: "Предложение отклонено." });
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: () => api.markOrderPaid(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Мы уведомили платформу — оплату подтвердят в ближайшее время." });
      invalidate();
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const submitWorkMutation = useMutation({
    mutationFn: () => api.submitWork(orderId, workResult.trim()),
    onSuccess: () => {
      closeModal();
      setWorkResult("");
      setNotice({ tone: "success", text: "Работа сдана. У заказчика 3 дня на проверку, дальше — автоприёмка." });
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const requestChangesMutation = useMutation({
    mutationFn: () => api.requestChanges(orderId, changesReason.trim()),
    onSuccess: () => {
      closeModal();
      setChangesReason("");
      setNotice({ tone: "success", text: "Сделка возвращена на доработку — автор получил вашу причину." });
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.confirmOrder(orderId),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Работа принята. Сделка завершена, гонорар передан автору." });
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

  const payOnlineMutation = useMutation({
    mutationFn: () => api.createPayment(orderId),
    onSuccess: (data) => {
      window.location.href = data.payment_url;
    },
    onError: (err: Error) => setNotice({ tone: "danger", text: err.message }),
  });

  const reviewMutation = useMutation({
    mutationFn: () => api.createReview(orderId, { rating: reviewRating, text: reviewText.trim() || null }),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Спасибо! Оценка появится в профиле, текст увидит только контрагент." });
      setReviewRating(0);
      setReviewText("");
      setReviewError("");
      invalidate();
    },
    onError: (err: Error) => setReviewError(err.message),
  });

  const actions = order?.available_actions ?? [];
  const canAcceptOffer = actions.includes("accept_offer");
  const canDeclineOffer = actions.includes("decline_offer");
  const canCancel = actions.includes("cancel");
  const canMarkPaid = actions.includes("mark_paid");
  const canSubmitWork = actions.includes("submit_work");
  const canRequestChanges = actions.includes("request_changes");
  const canConfirm = actions.includes("confirm");
  const canReview = actions.includes("review");

  const hasSideActions = canAcceptOffer || canDeclineOffer || canCancel || canSubmitWork || canRequestChanges || canConfirm;

  const showPayment =
    order != null &&
    order.status === "PENDING_PAYMENT" &&
    !isBlogger &&
    (order.card_requisites != null || order.settlement_account != null || order.yookassa_available);

  const negative =
    order != null && ["OFFER_DECLINED", "CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status);

  const counterpartId = order == null ? null : isBlogger ? order.client_id : order.blogger_id;
  const serviceName = order?.service_type_name ?? "Индивидуальные условия";

  const handleSubmitWork = () => {
    if (!workResult.trim()) {
      setFormError("Добавьте ссылку на публикацию и комментарий — без этого работу не сдать.");
      return;
    }
    setFormError("");
    submitWorkMutation.mutate();
  };

  const handleRequestChanges = () => {
    if (!changesReason.trim()) {
      setFormError("Опишите, что нужно доработать, — автор увидит эту причину.");
      return;
    }
    setFormError("");
    requestChangesMutation.mutate();
  };

  const handleReview = () => {
    if (reviewRating < 1) {
      setReviewError("Поставьте оценку — от одной до пяти звёзд.");
      return;
    }
    setReviewError("");
    reviewMutation.mutate();
  };

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
                  <div className={styles.statusWho}>
                    <Portrait
                      name={(isBlogger ? order.client_name : order.blogger_name) ?? "?"}
                      className={styles.statusAvatar}
                      monoSize={22}
                    />
                    <div>
                      <div className={styles.statusDealNo}>
                        №&nbsp;{dealNo(order.id, order.created_at)}
                        {/* Номер понадобится при обращении в поддержку */}
                        <CopyButton value={dealNo(order.id, order.created_at)} />
                      </div>
                      <h1 className={styles.statusParty}>
                        <span className={styles.statusRole}>
                          {isBlogger ? "Заказчик" : "Автор"}
                        </span>
                        {(isBlogger ? order.client_name : order.blogger_name) ?? "—"}
                      </h1>
                      <div style={{ marginTop: 12 }}>
                        <StampBadge status={order.status} />
                      </div>
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

                {order.status === "ESCROW_HELD" && order.deadline_at && (
                  <div className={styles.countRow}>
                    <Countdown deadline={order.deadline_at} mode="work" />
                  </div>
                )}
                {order.status === "BLOGGER_CONFIRMED" && order.review_deadline_at && (
                  <div className={styles.countRow}>
                    <Countdown deadline={order.review_deadline_at} mode="review" />
                  </div>
                )}

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

              {order.status === "OFFER_DECLINED" && (
                <StateBanner tone="danger" icon={<XCircle size={18} />} title="Предложение отклонено">
                  {order.decline_reason
                    ? `Причина: ${order.decline_reason}`
                    : "Контрагент не принял условия. Обсудите детали в чате и предложите новые."}
                </StateBanner>
              )}
              {order.status === "CANCELLED" && (
                <StateBanner tone="danger" icon={<XCircle size={18} />} title="Сделка отменена">
                  Отмена произошла до оплаты — деньги не переводились.
                </StateBanner>
              )}
              {order.status === "REFUNDED" && (
                <StateBanner tone="danger" icon={<Undo2 size={18} />} title="Оформлен возврат">
                  {order.decline_reason
                    ? `Деньги возвращаются заказчику. Причина: ${order.decline_reason}`
                    : "Деньги возвращаются заказчику. Вопросы по возврату — в поддержку."}
                </StateBanner>
              )}
              {order.status === "PAYMENT_FAILED" && (
                <StateBanner tone="danger" icon={<XCircle size={18} />} title="Оплата не прошла">
                  Создайте сделку заново или обратитесь в поддержку — номер сделки выше.
                </StateBanner>
              )}

              {order.status === "ESCROW_HELD" && order.decline_reason && (
                <StateBanner tone="warning" icon={<RotateCcw size={18} />} title="Возвращена на доработку">
                  {order.decline_reason}
                </StateBanner>
              )}

              {order.status === "OFFER_PENDING" && !canAcceptOffer && (
                <StateBanner tone="neutral" icon={<Hourglass size={18} />} title="Ждём решения контрагента">
                  Предложение отправлено. Чат по сделке уже открыт — можно обсудить детали, пока
                  контрагент думает.
                </StateBanner>
              )}

              {order.payment_reported_at && order.status === "PENDING_PAYMENT" && (
                <StateBanner tone="warning" icon={<Clock3 size={18} />} title="Оплата на проверке">
                  Вы сообщили об оплате {formatDateTime(order.payment_reported_at)}. Платформа сверит
                  поступление и переведёт сделку в работу.
                </StateBanner>
              )}

              {order.status === "PENDING_PAYMENT" && isBlogger && (
                <StateBanner tone="neutral" icon={<Wallet size={18} />} title="Заказчик оплачивает сделку">
                  Реквизиты для оплаты уже у заказчика. Как только платформа подтвердит поступление
                  денег, сделка перейдёт в работу — вам придёт уведомление, ничего делать не нужно.
                </StateBanner>
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
                          и переведёт сделку в работу. Деньги удерживаются до приёмки работы.
                        </p>
                      </div>
                    </section>
                  )}

                  {/* ── Результат работы ── */}
                  {order.work_result && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Результат работы</h2>
                      <p className={styles.brief}>{linkify(order.work_result)}</p>
                      {order.work_submitted_at && (
                        <p className={ui.fine} style={{ marginTop: 14 }}>
                          Сдано {formatDateTime(order.work_submitted_at)}
                        </p>
                      )}
                    </section>
                  )}

                  {/* ── Условия сделки ── */}
                  <section className={styles.panel}>
                    <h2 className={styles.panelTitle}>Условия сделки</h2>
                    <div className={ui.defList}>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Услуга</span>
                        <span className={ui.defValue}>{serviceName}</span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Сумма</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{formatMoney(order.amount_kopeks)}</span>
                      </div>
                      {/* До принятия дедлайна ещё нет — показываем срок в днях;
                          после принятия дата фиксируется и срок дублирует её */}
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Дедлайн работы</span>
                        {order.deadline_at ? (
                          <span className={`${ui.defValue} ${ui.mono}`}>{formatDateTime(order.deadline_at)}</span>
                        ) : (
                          <span className={ui.defValue}>
                            {order.deadline_days != null
                              ? `${order.deadline_days} ${pluralRu(order.deadline_days, "день", "дня", "дней")} после принятия`
                              : "Не зафиксирован"}
                          </span>
                        )}
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Дата публикации</span>
                        <span className={ui.defValue}>
                          {order.publish_at ? formatDate(order.publish_at) : "По готовности"}
                        </span>
                      </div>
                    </div>

                    <hr className={ui.hr} style={{ margin: "22px 0" }} />
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

                  {/* ── Отзыв: форма ── */}
                  {canReview && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Оставить отзыв</h2>
                      <p className={ui.muted} style={{ margin: "0 0 14px", fontSize: 14 }}>
                        Звёзды видны всем в профиле, текст увидит только контрагент.
                      </p>
                      <StarRating value={reviewRating} onChange={setReviewRating} size={24} />
                      <div className={ui.field} style={{ marginTop: 16 }}>
                        <label className={ui.fieldLabel} htmlFor="review-text">
                          Комментарий (необязательно)
                        </label>
                        <textarea
                          id="review-text"
                          className={ui.textarea}
                          rows={4}
                          placeholder="Как прошла сделка? Текст увидит только контрагент."
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                        />
                      </div>
                      {reviewError && (
                        <div className={ui.noticeDanger} style={{ marginTop: 12 }}>
                          {reviewError}
                        </div>
                      )}
                      <button
                        type="button"
                        className={ui.btnPrimary}
                        style={{ marginTop: 14 }}
                        onClick={handleReview}
                        disabled={reviewMutation.isPending}
                      >
                        {reviewMutation.isPending ? "Сохраняем…" : "Отправить отзыв"}
                      </button>
                    </section>
                  )}

                  {/* ── Отзывы по завершённой сделке ── */}
                  {order.my_review && <ReviewCard title="Ваш отзыв" review={order.my_review} />}
                  {order.review_of_me && (
                    <ReviewCard title="Отзыв о вас" review={order.review_of_me} privateNote="Текст виден только вам" />
                  )}
                </div>

                <aside className={styles.sideCol}>
                  {hasSideActions && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Действия по сделке</h2>
                      <div className={styles.actionsCol}>
                        {canAcceptOffer && (
                          <>
                            <button type="button" className={ui.btnPrimary} onClick={() => setModal("accept")}>
                              Принять предложение
                            </button>
                            <p className={ui.fine}>
                              После принятия условия и сроки фиксируются, сделка перейдёт к оплате.
                            </p>
                          </>
                        )}
                        {canDeclineOffer && (
                          <button type="button" className={ui.btnLine} onClick={() => setModal("decline")}>
                            Отказаться
                          </button>
                        )}
                        {canSubmitWork && (
                          <>
                            <button type="button" className={ui.btnPrimary} onClick={() => setModal("submit")}>
                              Сдать работу
                            </button>
                            <p className={ui.fine}>
                              {order.publish_at
                                ? `Сдайте работу в день публикации ролика — ${formatDate(order.publish_at)}.`
                                : "Приложите ссылку на публикацию и короткий комментарий."}
                            </p>
                          </>
                        )}
                        {canConfirm && (
                          <>
                            <button
                              type="button"
                              className={ui.btnPrimary}
                              onClick={() => {
                                if (window.confirm("Принять работу? Сделка завершится, гонорар будет передан автору.")) {
                                  confirmMutation.mutate();
                                }
                              }}
                              disabled={confirmMutation.isPending}
                            >
                              {confirmMutation.isPending ? "Подтверждаем…" : "Принять работу"}
                            </button>
                            <p className={ui.fine}>
                              Приёмка завершает сделку и передаёт гонорар автору.
                            </p>
                          </>
                        )}
                        {canRequestChanges && (
                          <>
                            <button type="button" className={ui.btnLine} onClick={() => setModal("changes")}>
                              Вернуть на доработку
                            </button>
                            <p className={ui.fine}>
                              Просто отменить оплаченный заказ нельзя — спорные случаи решает{" "}
                              <Link href={`/support?order=${order.id}`} className={ui.link}>
                                поддержка
                              </Link>
                              .
                            </p>
                          </>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            className={ui.btnDanger}
                            onClick={() => {
                              if (window.confirm(
                                order.status === "OFFER_PENDING"
                                  ? "Отозвать предложение? Действие необратимо."
                                  : "Отменить сделку? Действие необратимо.",
                              )) {
                                cancelMutation.mutate();
                              }
                            }}
                            disabled={cancelMutation.isPending}
                          >
                            {cancelMutation.isPending
                              ? "Отменяем…"
                              : order.status === "OFFER_PENDING"
                                ? "Отозвать предложение"
                                : "Отменить сделку"}
                          </button>
                        )}
                      </div>
                    </section>
                  )}

                  {counterpartId && (
                    <section className={styles.panel}>
                      <h2 className={styles.panelTitle}>Связь</h2>
                      <p className={ui.muted} style={{ margin: "0 0 16px", fontSize: 14 }}>
                        Вопросы по условиям, срокам и материалам удобнее решать в чате — переписка
                        останется при сделке.
                      </p>
                      <Link href={`/chats/${counterpartId}`} className={`${ui.btnLine} ${ui.btnBlock}`}>
                        <span className={styles.chatBtnInner}>
                          <ChatIcon />
                          Открыть чат по сделке
                        </span>
                      </Link>
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

              {/* ── Модалка: принять предложение ── */}
              <Modal open={modal === "accept"} onClose={closeModal} title="Принять предложение" maxWidth={520}>
                <div className={ui.defList}>
                  <div className={ui.defRow}>
                    <span className={ui.defKey}>Услуга</span>
                    <span className={ui.defValue}>{serviceName}</span>
                  </div>
                  <div className={ui.defRow}>
                    <span className={ui.defKey}>Сумма</span>
                    <span className={`${ui.defValue} ${ui.mono}`}>{formatMoney(order.amount_kopeks)}</span>
                  </div>
                  <div className={ui.defRow}>
                    <span className={ui.defKey}>Срок работы</span>
                    <span className={ui.defValue}>
                      {order.deadline_days != null
                        ? `${order.deadline_days} ${pluralRu(order.deadline_days, "день", "дня", "дней")} после принятия`
                        : "Не зафиксирован"}
                    </span>
                  </div>
                  <div className={ui.defRow}>
                    <span className={ui.defKey}>Дата публикации</span>
                    <span className={ui.defValue}>
                      {order.publish_at ? formatDate(order.publish_at) : "По готовности"}
                    </span>
                  </div>
                </div>
                <p className={ui.fine} style={{ marginTop: 16 }}>
                  После принятия сроки фиксируются: заказчик оплачивает на счёт платформы, деньги
                  удерживаются до приёмки работы.
                </p>
                {formError && (
                  <div className={ui.noticeDanger} style={{ marginTop: 12 }}>{formError}</div>
                )}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    onClick={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                  >
                    {acceptMutation.isPending ? "Принимаем…" : "Принимаю условия"}
                  </button>
                  <button type="button" className={ui.btnLine} onClick={closeModal}>
                    Отмена
                  </button>
                </div>
              </Modal>

              {/* ── Модалка: отказаться от предложения ── */}
              <Modal open={modal === "decline"} onClose={closeModal} title="Отказаться от предложения" maxWidth={520}>
                <div className={ui.field}>
                  <label className={ui.fieldLabel} htmlFor="decline-reason">
                    Причина (необязательно)
                  </label>
                  <textarea
                    id="decline-reason"
                    className={ui.textarea}
                    rows={4}
                    placeholder="Например: не подходит бюджет или сроки"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                  />
                </div>
                <p className={ui.fine} style={{ marginTop: 10 }}>
                  Причину увидит контрагент — так проще договориться о новых условиях в чате.
                </p>
                {formError && (
                  <div className={ui.noticeDanger} style={{ marginTop: 12 }}>{formError}</div>
                )}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={ui.btnDanger}
                    onClick={() => declineMutation.mutate()}
                    disabled={declineMutation.isPending}
                  >
                    {declineMutation.isPending ? "Отправляем…" : "Отказаться"}
                  </button>
                  <button type="button" className={ui.btnLine} onClick={closeModal}>
                    Отмена
                  </button>
                </div>
              </Modal>

              {/* ── Модалка: сдать работу ── */}
              <Modal open={modal === "submit"} onClose={closeModal} title="Сдать работу" maxWidth={560}>
                {order.publish_at && (
                  <div className={ui.notice} style={{ marginBottom: 16 }}>
                    Сдайте работу в день публикации ролика — {formatDate(order.publish_at)}.
                  </div>
                )}
                <div className={ui.field}>
                  <label className={ui.fieldLabel} htmlFor="work-result">
                    Ссылка на публикацию и комментарий
                  </label>
                  <textarea
                    id="work-result"
                    className={ui.textarea}
                    rows={5}
                    placeholder={"https://…\nКоротко: что сделано и на что обратить внимание"}
                    value={workResult}
                    onChange={(e) => setWorkResult(e.target.value)}
                  />
                </div>
                <p className={ui.fine} style={{ marginTop: 10 }}>
                  После сдачи у заказчика будет 3 дня на проверку — дальше работа принимается
                  автоматически.
                </p>
                {formError && (
                  <div className={ui.noticeDanger} style={{ marginTop: 12 }}>{formError}</div>
                )}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    onClick={handleSubmitWork}
                    disabled={submitWorkMutation.isPending}
                  >
                    {submitWorkMutation.isPending ? "Отправляем…" : "Сдать работу"}
                  </button>
                  <button type="button" className={ui.btnLine} onClick={closeModal}>
                    Отмена
                  </button>
                </div>
              </Modal>

              {/* ── Модалка: вернуть на доработку ── */}
              <Modal open={modal === "changes"} onClose={closeModal} title="Вернуть на доработку" maxWidth={560}>
                <div className={ui.field}>
                  <label className={ui.fieldLabel} htmlFor="changes-reason">
                    Что нужно доработать
                  </label>
                  <textarea
                    id="changes-reason"
                    className={ui.textarea}
                    rows={5}
                    placeholder="Опишите конкретно: что не так и каким должен быть результат"
                    value={changesReason}
                    onChange={(e) => setChangesReason(e.target.value)}
                  />
                </div>
                <p className={ui.fine} style={{ marginTop: 10 }}>
                  Просто отменить оплаченный заказ нельзя — спорные случаи решает{" "}
                  <Link href={`/support?order=${order.id}`} className={ui.link}>
                    поддержка
                  </Link>
                  .
                </p>
                {formError && (
                  <div className={ui.noticeDanger} style={{ marginTop: 12 }}>{formError}</div>
                )}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    onClick={handleRequestChanges}
                    disabled={requestChangesMutation.isPending}
                  >
                    {requestChangesMutation.isPending ? "Отправляем…" : "Вернуть на доработку"}
                  </button>
                  <button type="button" className={ui.btnLine} onClick={closeModal}>
                    Отмена
                  </button>
                </div>
              </Modal>
            </>
          )}
        </div>
      </div>
    </MarketShell>
  );
}
