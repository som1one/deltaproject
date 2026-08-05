"use client";

import { useEffect, useState } from "react";

import { appConfig } from "@/lib/config";

/* =========================================================
   Живые тарифы платформы — публичный GET /marketplace/tariffs.
   Используются везде, где показывается ставка воркера: обзор
   кабинета, лендинг, FAQ. Пока не загрузились (или API
   недоступен) — null: вызывающий код показывает текст без цифры.
   ========================================================= */

export type PlatformTariffs = {
  platform_commission_pct: number;
  worker_referral_commission_pct: number;
  blogger_referral_commission_pct: number;
};

export const usePlatformTariffs = (): PlatformTariffs | null => {
  const [tariffs, setTariffs] = useState<PlatformTariffs | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${appConfig.apiBaseUrl}/marketplace/tariffs`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: PlatformTariffs | null) => {
        if (!cancelled && data) setTariffs(data);
      })
      .catch(() => {
        // Сеть недоступна — показываем текст без числа.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return tariffs;
};

/** «5», «7,5» — процент без хвостовых нулей и без знака %. */
export const formatPctBare = (value: number | string): string => {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);
  const rounded = Math.round(num * 100) / 100;
  return String(rounded).replace(".", ",");
};

/** Комиссия с примера «заказ на 10 000 ₽», в копейках. */
export const exampleCommissionKopeks = (pct: number): number =>
  Math.round(pct * 10_000);
