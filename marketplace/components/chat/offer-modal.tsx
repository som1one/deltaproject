"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Modal } from "@/components/ui/bits";
import { Select, type SelectOption } from "@/components/ui/select";
import { ApiError, api, type OfferCreateBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";
import type { BloggerProfileFull, BloggerSelfProfile } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import st from "@/components/chat/chat.module.css";

const CUSTOM = "custom";

type PriceOption = { service_type_id: string; name: string; price_kopeks: number };

/**
 * Модалка «Предложить услугу» из чата. Прайс берём у автора:
 * если автор — я, то мой (включённые позиции), иначе — собеседника.
 * Пункт «Свои условия» — оффер без привязки к типу услуги.
 */
export function OfferModal({
  open,
  onClose,
  partnerId,
  partnerIsBlogger,
}: {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  partnerIsBlogger: boolean;
}) {
  const { isBlogger } = useAuth();
  const queryClient = useQueryClient();

  const selfProfileQuery = useQuery<BloggerSelfProfile>({
    queryKey: ["chat-offer-self-profile"],
    queryFn: api.getSelfProfile,
    enabled: open && isBlogger,
    staleTime: 60_000,
  });

  const partnerProfileQuery = useQuery<BloggerProfileFull>({
    queryKey: ["chat-offer-partner-profile", partnerId],
    queryFn: () => api.getBlogger(partnerId),
    enabled: open && !isBlogger && partnerIsBlogger,
    staleTime: 60_000,
  });

  const priceItems: PriceOption[] = isBlogger
    ? (selfProfileQuery.data?.price_list_full ?? []).filter((item) => item.is_enabled)
    : partnerProfileQuery.data?.price_list ?? [];

  const options: SelectOption[] = [
    { value: CUSTOM, label: "Свои условия" },
    ...priceItems.map((item) => ({
      value: item.service_type_id,
      label: `${item.name} — ${formatMoney(item.price_kopeks)}`,
    })),
  ];

  const [service, setService] = useState(CUSTOM);
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setService(CUSTOM);
    setPrice("");
    setDays("");
    setPublishAt("");
    setBrief("");
    setError(null);
  };

  const chooseService = (value: string) => {
    setService(value);
    const item = priceItems.find((i) => i.service_type_id === value);
    if (item) setPrice(String(Math.round(item.price_kopeks / 100)));
  };

  const createMutation = useMutation({
    mutationFn: (body: OfferCreateBody) => api.createOfferFromChat(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversation", partnerId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
      reset();
      onClose();
    },
    onError: (err: Error) =>
      setError(err instanceof ApiError && err.message ? err.message : "Не удалось отправить предложение."),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const rub = Number(price.replace(",", "."));
    if (!Number.isFinite(rub) || rub < 1) {
      setError("Укажите цену — не меньше 1 ₽.");
      return;
    }
    const message = brief.trim();
    if (!message) {
      setError("Опишите задачу: что и в каком формате нужно сделать.");
      return;
    }
    let deadlineDays: number | null = null;
    if (days.trim() !== "") {
      deadlineDays = Number(days);
      if (!Number.isInteger(deadlineDays) || deadlineDays < 1 || deadlineDays > 90) {
        setError("Срок — целое число дней от 1 до 90.");
        return;
      }
    }

    createMutation.mutate({
      counterpart_id: partnerId,
      message,
      amount_kopeks: Math.round(rub * 100),
      service_type_id: service === CUSTOM ? null : service,
      deadline_days: deadlineDays,
      // Полдень локального дня: дата не «съедет» на сутки в других поясах
      publish_at: publishAt ? new Date(`${publishAt}T12:00:00`).toISOString() : null,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Предложить услугу" maxWidth={480}>
      <form className={ui.form} onSubmit={submit}>
        <div className={ui.field}>
          <span className={ui.fieldLabel}>Услуга</span>
          <Select value={service} onChange={chooseService} options={options} ariaLabel="Услуга" />
        </div>

        <div className={st.formRow}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Цена, ₽</span>
            <input
              className={ui.input}
              type="number"
              min={1}
              step="any"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="15 000"
              required
            />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Срок, дней</span>
            <input
              className={ui.input}
              type="number"
              min={1}
              max={90}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="Не задан"
            />
          </label>
        </div>

        <label className={ui.field}>
          <span className={ui.fieldLabel}>Дата публикации (необязательно)</span>
          <input
            className={ui.input}
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
        </label>

        <label className={ui.field}>
          <span className={ui.fieldLabel}>ТЗ / описание задачи</span>
          <textarea
            className={ui.textarea}
            rows={4}
            maxLength={1000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Что нужно сделать, в каком формате и что важно упомянуть"
            required
          />
        </label>

        {error && <div className={ui.noticeDanger}>{error}</div>}

        <button type="submit" className={ui.btnPrimary} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Отправляем…" : "Отправить предложение"}
        </button>
      </form>
    </Modal>
  );
}
