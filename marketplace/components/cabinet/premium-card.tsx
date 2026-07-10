"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, PhoneCall, Sparkles } from "lucide-react";

import { Modal } from "@/components/ui/bits";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { PremiumRequest } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { PREMIUM_LATEST_KEY } from "./keys";
import s from "./cabinet.module.css";

/**
 * Тёмная CTA-плашка «Премиум-размещение на главной».
 * Если уже есть живая заявка (new/contacted) — показываем её статус.
 */
export function PremiumCard() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: latest } = useQuery<PremiumRequest | null>({
    queryKey: PREMIUM_LATEST_KEY,
    queryFn: async () => {
      try {
        return await api.getLatestPremiumRequest();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null; // заявок ещё не было
        throw e;
      }
    },
  });

  const create = useMutation({
    mutationFn: () => api.createPremiumRequest(comment.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PREMIUM_LATEST_KEY });
      setOpen(false);
      setComment("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось отправить заявку"),
  });

  const alive = latest && (latest.status === "new" || latest.status === "contacted") ? latest : null;

  return (
    <section className={s.premium}>
      <div className={s.premiumGlow} aria-hidden="true" />
      <span className={s.premiumBrow}>
        <Sparkles size={13} /> Премиум
      </span>
      <h2 className={s.premiumTitle}>Ваша карточка — в витрине на главной</h2>
      <p className={s.premiumText}>
        Первым экраном для всех заказчиков платформы. Оставьте заявку — обсудим условия и подберём слот.
      </p>

      {alive ? (
        <div className={s.premiumStatus}>
          {alive.status === "new" ? <Clock3 size={15} /> : <PhoneCall size={15} />}
          <span>
            {alive.status === "new"
              ? `Заявка от ${formatDate(alive.created_at)} принята — мы скоро свяжемся с вами.`
              : `Мы на связи по заявке от ${formatDate(alive.created_at)} — обсуждаем размещение.`}
          </span>
        </div>
      ) : (
        <button type="button" className={s.premiumBtn} onClick={() => setOpen(true)}>
          Оставить заявку
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Премиум-размещение" maxWidth={480}>
        <p className={ui.muted} style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55 }}>
          Расскажите пару слов о себе и удобном способе связи — менеджер платформы вернётся с условиями.
        </p>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Комментарий</span>
          <textarea
            className={ui.textarea}
            rows={4}
            maxLength={500}
            value={comment}
            placeholder="Например: канал про технику, 200К подписчиков, интересует месяц на главной."
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        {error && <p className={ui.inputError}>{error}</p>}
        <div className={s.modalActions}>
          <button type="button" className={ui.btnLine} onClick={() => setOpen(false)}>
            Отмена
          </button>
          <button type="button" className={ui.btnPrimary} disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Отправляем…" : "Отправить заявку"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
