"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { appConfig } from "@/lib/config";
import type { UserRole } from "@/lib/types";

/**
 * Куда направить уже залогиненного пользователя.
 * - Admin → "/admin"
 * - Worker / Bloger → "/cabinet"
 *
 * Хук безопасен для SSR: пока `auth-context` не гидратирован, возвращает
 * `ready=false` и не дёргает API. Если access-токен оказался невалидным
 * и refresh не сработал, сессия чистится — пользователь видит как
 * незалогиненного.
 */
export type SessionTarget = {
  ready: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  href: string | null;
  label: string | null;
  /** Одно слово — для тесных мест вроде верхней навигации на телефоне. */
  shortLabel: string | null;
};

const HOME_BY_ROLE: Record<UserRole, { href: string; label: string; shortLabel: string }> = {
  Admin: { href: "/admin", label: "Открыть админку", shortLabel: "Админка" },
  Tech_Admin: { href: "/admin", label: "Открыть админку", shortLabel: "Админка" },
  Worker: { href: "/cabinet", label: "Открыть кабинет", shortLabel: "Кабинет" },
  Bloger: { href: "/cabinet", label: "Открыть кабинет", shortLabel: "Кабинет" },
  // Заказчики живут на маркетплейсе — на основном сайте кабинета у них нет.
  Client: { href: appConfig.marketplaceUrl, label: "Открыть маркетплейс", shortLabel: "Маркетплейс" },
};

export const useSessionTarget = (): SessionTarget => {
  const { isHydrated, isAuthenticated, clearSession } = useAuth();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: isHydrated && isAuthenticated,
    retry: false,
    staleTime: 60_000,
  });

  // Если токен фронт сохранил, а бэк его не принимает (401/403) — сбрасываем
  // сессию, чтобы UI не зацикливался в «привет, ты вошёл, но не совсем».
  useEffect(() => {
    if (!isAuthenticated || !meQuery.error) return;
    if (meQuery.error instanceof ApiError && (meQuery.error.status === 401 || meQuery.error.status === 403)) {
      clearSession();
    }
  }, [isAuthenticated, meQuery.error, clearSession]);

  if (!isHydrated) {
    return { ready: false, isAuthenticated: false, role: null, href: null, label: null, shortLabel: null };
  }

  if (!isAuthenticated) {
    return { ready: true, isAuthenticated: false, role: null, href: null, label: null, shortLabel: null };
  }

  if (!meQuery.data) {
    // Запрос ещё в полёте — нельзя ни редиректить, ни показывать guest-CTA.
    return { ready: false, isAuthenticated: true, role: null, href: null, label: null, shortLabel: null };
  }

  const target = HOME_BY_ROLE[meQuery.data.role];
  return {
    ready: true,
    isAuthenticated: true,
    role: meQuery.data.role,
    href: target.href,
    label: target.label,
    shortLabel: target.shortLabel,
  };
};
