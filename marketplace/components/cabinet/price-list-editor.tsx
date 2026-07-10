"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Megaphone, Mic, PenLine, Repeat2, Sparkles, Video, type LucideIcon } from "lucide-react";

import { Switch } from "@/components/ui/bits";
import { api, type PriceListItemBody } from "@/lib/api";
import type { PriceItemFull, ServiceType } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { SELF_PROFILE_KEY } from "./keys";
import s from "./cabinet.module.css";

const CONDITION_MAX = 300;

/* Иконка и цвет плитки подбираются по коду услуги, с фолбэком по индексу. */
const ICON_BY_CODE: Record<string, LucideIcon> = {
  integration: Video,
  post: PenLine,
  story: Clapperboard,
  stories: Clapperboard,
  repost: Repeat2,
  mention: Megaphone,
  voice: Mic,
};

const FALLBACK_ICONS: LucideIcon[] = [Video, Megaphone, Clapperboard, PenLine, Repeat2, Mic, Sparkles];
const TILE_COLORS = ["var(--violet)", "var(--green)", "var(--amber)", "var(--pink)"];

type RowState = {
  enabled: boolean;
  /** Цена в рублях, как строка из инпута. */
  priceRub: string;
  condition: string;
};

const initRows = (serviceTypes: ServiceType[], priceList: PriceItemFull[]): Record<string, RowState> => {
  const byType = new Map(priceList.map((item) => [item.service_type_id, item]));
  return Object.fromEntries(
    serviceTypes.map((type) => {
      const existing = byType.get(type.id);
      return [
        type.id,
        {
          enabled: existing?.is_enabled ?? false,
          priceRub: existing ? String(Math.round(existing.price_kopeks / 100)) : "",
          condition: existing?.description ?? "",
        },
      ];
    }),
  );
};

/**
 * «Прайс-лист»: строки по всем типам услуг из реестра — вкл/выкл,
 * цена в рублях (хранится в копейках) и короткое условие.
 * Сохранение — полная замена списка через api.updatePriceList.
 */
export function PriceListEditor({
  serviceTypes,
  priceList,
}: {
  serviceTypes: ServiceType[];
  priceList: PriceItemFull[];
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, RowState>>(() => initRows(serviceTypes, priceList));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sortedTypes = useMemo(
    () => [...serviceTypes].filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [serviceTypes],
  );

  const patchRow = (id: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { enabled: false, priceRub: "", condition: "" }), ...patch },
    }));
    setSaved(false);
  };

  const save = useMutation({
    mutationFn: (items: PriceListItemBody[]) => api.updatePriceList(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SELF_PROFILE_KEY });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить прайс-лист"),
  });

  const handleSave = () => {
    setError(null);
    const items: PriceListItemBody[] = [];
    for (const type of sortedTypes) {
      const row = rows[type.id];
      if (!row) continue;
      const rub = Number(row.priceRub.replace(",", "."));
      // Бэкенд принимает цены от 1 ₽ (100 копеек) — валидируем так же
      if (row.enabled && (!row.priceRub.trim() || !Number.isFinite(rub) || rub < 1)) {
        setError(`Укажите цену для услуги «${type.name}» (не меньше 1 ₽) или выключите её.`);
        return;
      }
      if (!row.priceRub.trim()) continue; // выключено и без цены — не отправляем
      // Выключенную строку с некорректной ценой тихо пропускаем,
      // иначе она валит сохранение всего списка с 422
      if (!row.enabled && (!Number.isFinite(rub) || rub < 1)) continue;
      items.push({
        service_type_id: type.id,
        price_kopeks: Math.round(rub * 100),
        description: row.condition.trim() || null,
        is_enabled: row.enabled,
      });
    }
    save.mutate(items);
  };

  return (
    <section className={`${ui.card} ${s.panel}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Прайс-лист</h2>
      </div>
      <p className={s.panelSub}>
        Минимальная включённая цена станет ценой «от» в каталоге. Выключенные услуги заказчики не видят.
      </p>

      <div className={s.priceRows}>
        {sortedTypes.map((type, index) => {
          const row = rows[type.id] ?? { enabled: false, priceRub: "", condition: "" };
          const Icon = ICON_BY_CODE[type.code.toLowerCase()] ?? FALLBACK_ICONS[index % FALLBACK_ICONS.length];
          return (
            <div key={type.id} className={row.enabled ? s.priceRow : s.priceRowOff}>
              <span className={s.priceIcon} style={{ background: TILE_COLORS[index % TILE_COLORS.length] }}>
                <Icon size={19} />
              </span>
              <span className={s.priceInfo}>
                <span className={s.priceName}>{type.name}</span>
                {type.description && <span className={s.priceDesc}>{type.description}</span>}
              </span>
              <span className={s.priceControls}>
                <span className={s.priceInputWrap}>
                  <input
                    className={ui.input}
                    inputMode="numeric"
                    placeholder="0"
                    value={row.priceRub}
                    aria-label={`Цена услуги «${type.name}», рублей`}
                    onChange={(e) => patchRow(type.id, { priceRub: e.target.value.replace(/[^\d.,]/g, "") })}
                  />
                  <span className={s.priceCurrency}>₽</span>
                </span>
                <Switch
                  checked={row.enabled}
                  ariaLabel={`Услуга «${type.name}» включена`}
                  onChange={(next) => patchRow(type.id, { enabled: next })}
                />
              </span>
              {row.enabled && (
                <span className={s.priceCondRow}>
                  <input
                    className={ui.input}
                    maxLength={CONDITION_MAX}
                    placeholder="Короткое условие: хронометраж, что входит, сроки…"
                    value={row.condition}
                    aria-label={`Условие для услуги «${type.name}»`}
                    onChange={(e) => patchRow(type.id, { condition: e.target.value })}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className={ui.inputError}>{error}</p>}

      <div className={s.saveRow}>
        <button type="button" className={ui.btnPrimary} disabled={save.isPending} onClick={handleSave}>
          {save.isPending ? "Сохраняем…" : "Сохранить прайс-лист"}
        </button>
        {saved && <span className={s.savedMsg}>Сохранено</span>}
      </div>
    </section>
  );
}
