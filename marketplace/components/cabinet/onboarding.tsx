"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { MarketplaceCategory } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { SELF_PROFILE_KEY } from "./keys";
import { LinkListEditor } from "./link-list";
import s from "./cabinet.module.css";

const cleanLinks = (links: string[]) => links.map((l) => l.trim()).filter(Boolean);

/**
 * Онбординг автора: у аккаунта ещё нет карточки в каталоге —
 * собираем минимум (категория, аудитория, описание, соцсети, цена «от»)
 * и создаём профиль одним запросом.
 */
export function Onboarding() {
  const queryClient = useQueryClient();

  const [category, setCategory] = useState("");
  const [subscribers, setSubscribers] = useState("");
  const [priceRub, setPriceRub] = useState("");
  const [description, setDescription] = useState("");
  const [socials, setSocials] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery<MarketplaceCategory[]>({
    queryKey: ["marketplace-categories"],
    queryFn: api.getCategories,
    staleTime: 5 * 60_000,
  });

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Выберите категорию" },
      ...(categories ?? []).map((c) => ({ value: c.value, label: c.label })),
    ],
    [categories],
  );

  const create = useMutation({
    mutationFn: () =>
      api.createSelfProfile({
        category,
        subscriber_count: Number(subscribers.replace(/\s/g, "")),
        average_price_kopeks: Math.round(Number(priceRub.replace(",", ".")) * 100),
        description: description.trim(),
        social_links: cleanLinks(socials),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SELF_PROFILE_KEY }),
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось создать профиль"),
  });

  const handleSubmit = () => {
    setError(null);
    if (!category) return setError("Выберите категорию — по ней заказчики находят авторов.");
    const subs = Number(subscribers.replace(/\s/g, ""));
    if (!subscribers.trim() || !Number.isFinite(subs) || subs <= 0)
      return setError("Укажите число подписчиков.");
    const rub = Number(priceRub.replace(",", "."));
    if (!priceRub.trim() || !Number.isFinite(rub) || rub <= 0)
      return setError("Укажите цену «от» — её всегда можно уточнить в прайс-листе.");
    if (!description.trim()) return setError("Пара предложений о себе — это лицо вашей карточки.");
    if (cleanLinks(socials).length === 0)
      return setError("Добавьте хотя бы одну ссылку на соцсеть.");
    create.mutate();
  };

  return (
    <section className={`${ui.card} ${s.panel} ${s.onboarding}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Создайте карточку автора</h2>
      </div>
      <p className={s.onboardingLead}>
        У вашего аккаунта ещё нет карточки в каталоге. Заполните основу — прайс-лист, портфолио и статистику
        аудитории добавите после, прямо здесь, в кабинете.
      </p>

      <div className={ui.form}>
        <div className={ui.field}>
          <span className={ui.fieldLabel}>Категория</span>
          <Select
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            ariaLabel="Категория контента"
          />
        </div>

        <div className={ui.grid2}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Подписчики</span>
            <input
              className={ui.input}
              inputMode="numeric"
              value={subscribers}
              placeholder="120000"
              onChange={(e) => setSubscribers(e.target.value.replace(/[^\d]/g, ""))}
            />
          </label>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Цена «от», ₽</span>
            <input
              className={ui.input}
              inputMode="numeric"
              value={priceRub}
              placeholder="15000"
              onChange={(e) => setPriceRub(e.target.value.replace(/[^\d.,]/g, ""))}
            />
          </label>
        </div>

        <label className={ui.field}>
          <span className={ui.fieldLabel}>О себе</span>
          <textarea
            className={ui.textarea}
            rows={4}
            maxLength={500}
            value={description}
            placeholder="Тематика, форматы, чем вы полезны бренду."
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div>
          <span className={ui.fieldLabel}>Соцсети</span>
          <LinkListEditor
            items={socials}
            onChange={setSocials}
            max={10}
            placeholder="https://t.me/ваш_канал"
            addLabel="Добавить соцсеть"
            ariaLabel="Соцсети"
          />
        </div>
      </div>

      {error && <p className={ui.inputError}>{error}</p>}

      <div className={s.saveRow}>
        <button type="button" className={ui.btnPrimary} disabled={create.isPending} onClick={handleSubmit}>
          {create.isPending ? "Создаём…" : "Создать карточку"}
        </button>
      </div>
    </section>
  );
}
