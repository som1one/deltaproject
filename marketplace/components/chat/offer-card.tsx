"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";

import { Modal, StampBadge } from "@/components/ui/bits";
import { timeShort } from "@/components/chat/chat-utils";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { ChatMessage, OrderDetail } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import st from "@/components/chat/chat.module.css";

const errText = (err: unknown, fallback: string): string =>
  err instanceof ApiError && err.message ? err.message : fallback;

/**
 * Карточка-оффер в ленте чата: условия из payload-снапшота,
 * актуальный статус — отдельным запросом по order_id.
 */
export function OfferCard({ msg, partnerId }: { msg: ChatMessage; partnerId: string }) {
  const queryClient = useQueryClient();
  const payload = msg.payload ?? {};
  const orderId = payload.order_id ?? msg.order_id;
  const mine = msg.sender_id !== partnerId;

  const [expanded, setExpanded] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Статус из payload — исходный; актуальный тянем по order_id и
  // поллим, пока сделка живая: контрагент мог принять/отозвать оффер
  // в другом окне, а refetchOnWindowFocus глобально выключен.
  const TERMINAL = new Set(["COMPLETED", "REFUNDED", "CANCELLED", "OFFER_DECLINED", "PAYMENT_FAILED"]);
  const { data: order } = useQuery<OrderDetail>({
    queryKey: ["chat-offer-order", orderId],
    queryFn: () => api.getOrder(orderId as string),
    enabled: Boolean(orderId),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.status) ? false : 12_000,
  });
  const status = order?.status ?? payload.status ?? "OFFER_PENDING";

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["chat-conversation", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
    if (orderId) queryClient.invalidateQueries({ queryKey: ["chat-offer-order", orderId] });
  };

  // 409 = статус успел измениться (приняли/отозвали в другом окне);
  // показываем дружелюбный текст и подтягиваем актуальное состояние.
  const staleText = (err: unknown, fallback: string): string =>
    err instanceof ApiError && err.status === 409
      ? "Предложение уже недействительно — статус обновлён."
      : errText(err, fallback);

  const acceptMutation = useMutation({
    mutationFn: () => api.acceptOffer(orderId as string),
    onSuccess: () => setActionError(null),
    onError: (err: Error) => setActionError(staleText(err, "Не удалось принять предложение.")),
    onSettled: invalidateAll,
  });

  const declineMutation = useMutation({
    mutationFn: (reason: string) => api.declineOffer(orderId as string, reason || undefined),
    onSuccess: () => {
      setActionError(null);
      setDeclineOpen(false);
      setDeclineReason("");
    },
    onError: (err: Error) => setActionError(staleText(err, "Не удалось отклонить предложение.")),
    onSettled: invalidateAll,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelOrder(orderId as string),
    onSuccess: () => setActionError(null),
    onError: (err: Error) => setActionError(staleText(err, "Не удалось отозвать предложение.")),
    onSettled: invalidateAll,
  });

  const brief = payload.message ?? msg.text;
  const briefLong = brief.length > 180 || brief.split("\n").length > 4;
  const busy = acceptMutation.isPending || declineMutation.isPending || cancelMutation.isPending;

  return (
    <div className={`${st.msgRow} ${mine ? st.msgRowOut : ""}`.trim()}>
      <div className={`${st.offerWrap} ${mine ? st.offerWrapOut : st.offerWrapIn}`}>
        <div className={st.offerCard}>
          <span className={st.offerBrow}>
            <PackagePlus size={13} strokeWidth={2.2} />
            Предложение услуги
          </span>
          <span className={st.offerService}>
            {payload.service_type_name || "Индивидуальные условия"}
          </span>
          <span className={st.offerPrice}>{formatMoney(payload.amount_kopeks)}</span>
          {(payload.deadline_days != null || payload.publish_at) && (
            <span className={st.offerMeta}>
              {payload.deadline_days != null && <span>Срок: {payload.deadline_days} дн.</span>}
              {payload.publish_at && <span>Публикация: {formatDate(payload.publish_at)}</span>}
            </span>
          )}
          {brief && (
            <>
              <p className={`${st.offerBrief} ${expanded ? st.offerBriefOpen : ""}`.trim()}>{brief}</p>
              {briefLong && (
                <button type="button" className={st.offerMore} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Свернуть" : "Показать полностью"}
                </button>
              )}
            </>
          )}

          <div className={st.offerActions}>
            {status === "OFFER_PENDING" && orderId ? (
              mine ? (
                <>
                  <span className={st.offerWait}>Ждёт ответа</span>
                  <button
                    type="button"
                    className={`${ui.btnLine} ${ui.btnSmall}`}
                    onClick={() => cancelMutation.mutate()}
                    disabled={busy}
                  >
                    {cancelMutation.isPending ? "Отзываем…" : "Отозвать"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`${ui.btnPrimary} ${ui.btnSmall}`}
                    onClick={() => acceptMutation.mutate()}
                    disabled={busy}
                  >
                    {acceptMutation.isPending ? "Принимаем…" : "Принять"}
                  </button>
                  <button
                    type="button"
                    className={`${ui.btnLine} ${ui.btnSmall}`}
                    onClick={() => setDeclineOpen(true)}
                    disabled={busy}
                  >
                    Отказать
                  </button>
                </>
              )
            ) : (
              <>
                <StampBadge status={status} />
                {orderId && (
                  <Link href={`/orders/${orderId}`} className={st.offerLink}>
                    Открыть сделку
                  </Link>
                )}
              </>
            )}
          </div>
          {actionError && <span className={st.offerErr}>{actionError}</span>}
        </div>
        <span className={st.offerTime}>{timeShort(msg.created_at)}</span>
      </div>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Отказать в предложении"
        maxWidth={420}
      >
        <div className={ui.form}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Причина (необязательно)</span>
            <textarea
              className={ui.textarea}
              rows={3}
              maxLength={1000}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Коротко объясните, почему условия не подходят"
            />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`${ui.btnDanger} ${ui.btnSmall}`}
              onClick={() => declineMutation.mutate(declineReason.trim())}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending ? "Отправляем…" : "Отказать"}
            </button>
            <button
              type="button"
              className={`${ui.btnLine} ${ui.btnSmall}`}
              onClick={() => setDeclineOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
