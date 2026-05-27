"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { telegramStorage } from "@/lib/storage";
import { JourneyFeedback, JourneySubmit } from "@/components/common/journey";

/**
 * Telegram OIDC redirect-flow.
 *
 * 1. Жмём кнопку → переходим (top-level navigation) на бэк
 *    ``GET /auth/telegram/start?linked_to=...``.
 * 2. Бэк создаёт state/nonce и редиректит на
 *    ``https://oauth.telegram.org/auth?...``.
 * 3. Telegram редиректит на ``/auth/telegram/callback?code=&state=`` (бэк),
 *    тот меняет code на id_token, валидирует подпись по JWKS, создаёт/находит
 *    воркера и редиректит фронт на ``/tg/callback?exchange=<ticket>``.
 * 4. Страница ``/tg/callback`` обменивает ticket через
 *    ``POST /auth/telegram/exchange`` на пару JWT.
 */
export const TelegramButton = ({
  linkedTo,
  label = "Войти через Telegram",
}: {
  linkedTo?: string | null;
  label?: string;
}) => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  const configQuery = useQuery({
    queryKey: ["telegramConfig"],
    queryFn: api.getTelegramConfig,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const ready = Boolean(configQuery.data?.enabled);

  const handleClick = () => {
    if (!ready) return;
    setError("");
    setIsPending(true);
    try {
      if (linkedTo) {
        telegramStorage.setLinkedTo(linkedTo);
      } else {
        telegramStorage.clearLinkedTo();
      }
      const search = linkedTo ? `?linked_to=${encodeURIComponent(linkedTo)}` : "";
      window.location.href = `${appConfig.apiBaseUrl}/auth/telegram/start${search}`;
    } catch (nextError) {
      setIsPending(false);
      setError(nextError instanceof Error ? nextError.message : "Не удалось начать вход через Telegram");
    }
  };

  if (configQuery.isLoading) {
    return (
      <JourneySubmit type="button" disabled>
        Подключаем Telegram…
      </JourneySubmit>
    );
  }

  if (!ready) {
    return (
      <>
        <JourneySubmit type="button" disabled>
          Telegram-вход скоро откроется
        </JourneySubmit>
        <JourneyFeedback tone="info">
          Telegram-вход появится, как только администратор подключит OIDC-приложение в BotFather.
        </JourneyFeedback>
      </>
    );
  }

  return (
    <>
      <JourneySubmit type="button" disabled={isPending} onClick={handleClick}>
        {isPending ? "Переходим в Telegram…" : label}
      </JourneySubmit>
      {error ? <JourneyFeedback tone="error">{error}</JourneyFeedback> : null}
    </>
  );
};
