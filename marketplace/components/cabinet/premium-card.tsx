"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock3, Eye, PhoneCall, Sparkles, TrendingUp } from "lucide-react";

import { Modal } from "@/components/ui/bits";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { PremiumRequest } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { PREMIUM_LATEST_KEY } from "./keys";
import s from "./cabinet.module.css";

/** Что даёт премиум — коротко, для плашки и модалки. */
const PERKS = [
  { icon: Eye, text: "Первый экран у каждого заказчика платформы" },
  { icon: TrendingUp, text: "Основной трафик — на вашу карточку" },
  { icon: BadgeCheck, text: "Читается как рекомендация площадки" },
];

/**
 * Премиум-размещение на главной.
 * `compact` — сдержанная строка-баннер для встраивания в кабинет (её видно
 * сразу при входе). Без пропа — крупная плашка для онбординга.
 * Если уже есть живая заявка (new/contacted) — показываем её статус.
 */
export function PremiumCard({ compact = false }: { compact?: boolean } = {}) {
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

  const modal = (
    <Modal open={open} onClose={() => setOpen(false)} title="Премиум-размещение" maxWidth={480}>
      <div className={s.pmIntro}>
        <span className={s.premiumBrow}>
          <Sparkles size={13} className={s.premiumSpark} /> Что это даёт
        </span>
        <ul className={s.premiumList} style={{ marginTop: 10 }}>
          {PERKS.map((perk) => (
            <li key={perk.text} className={s.premiumItem}>
              <span className={s.premiumItemIcon}>
                <perk.icon size={13} strokeWidth={2.2} />
              </span>
              {perk.text}
            </li>
          ))}
        </ul>
      </div>

      <p className={ui.muted} style={{ margin: "14px 0", fontSize: 13.5, lineHeight: 1.55 }}>
        Расскажите пару слов о себе — менеджер платформы вернётся с условиями и свободными слотами.
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
  );

  /* ── Компактная строка-баннер для кабинета ── */
  if (compact) {
    return (
      <section className={s.premiumBar}>
        <span className={s.premiumBarIcon} aria-hidden="true">
          <Sparkles size={17} strokeWidth={2} />
        </span>
        <div className={s.premiumBarText}>
          <span className={s.premiumBarTitle}>Премиум-размещение на главной</span>
          <span className={s.premiumBarSub}>
            {alive
              ? alive.status === "new"
                ? `Заявка от ${formatDate(alive.created_at)} отправлена — скоро свяжемся.`
                : `На связи по заявке от ${formatDate(alive.created_at)} — обсуждаем размещение.`
              : "Ваша карточка на первом экране у каждого заказчика платформы."}
          </span>
        </div>
        {alive ? (
          <span className={s.premiumBarBadge}>
            {alive.status === "new" ? <Clock3 size={14} /> : <PhoneCall size={14} />}
            {alive.status === "new" ? "Заявка отправлена" : "На связи"}
          </span>
        ) : (
          <button
            type="button"
            className={s.premiumBarBtn}
            onClick={() => setOpen(true)}
          >
            Подключить
          </button>
        )}
        {modal}
      </section>
    );
  }

  /* ── Крупная плашка (онбординг) ── */
  return (
    <section className={s.premium}>
      <span className={s.premiumTopline} aria-hidden="true" />
      <div className={s.premiumGlow} aria-hidden="true" />
      <span className={s.premiumBrow}>
        <Sparkles size={13} className={s.premiumSpark} /> Премиум
      </span>
      <h2 className={s.premiumTitle}>Ваша карточка — в витрине на главной</h2>
      <p className={s.premiumText}>Оставьте заявку — менеджер подберёт слот и вернётся с условиями.</p>

      <ul className={s.premiumList}>
        {PERKS.map((perk) => (
          <li key={perk.text} className={s.premiumItem}>
            <span className={s.premiumItemIcon}>
              <perk.icon size={13} strokeWidth={2.2} />
            </span>
            {perk.text}
          </li>
        ))}
      </ul>

      {alive ? (
        <div className={s.premiumStatus}>
          {alive.status === "new" ? <Clock3 size={15} /> : <PhoneCall size={15} />}
          <span>
            {alive.status === "new"
              ? `Заявка от ${formatDate(alive.created_at)} отправлена — мы скоро свяжемся с вами.`
              : `Мы на связи по заявке от ${formatDate(alive.created_at)} — обсуждаем размещение.`}
          </span>
        </div>
      ) : (
        <button type="button" className={s.premiumBtn} onClick={() => setOpen(true)}>
          Оставить заявку
        </button>
      )}

      {modal}
    </section>
  );
}
