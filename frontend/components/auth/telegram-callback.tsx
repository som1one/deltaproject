"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { telegramStorage } from "@/lib/storage";
import {
  JourneyCash,
  JourneyChannelGate,
  JourneyEyebrow,
  JourneyFeedback,
  JourneyLead,
  JourneyPanel,
  JourneyShell,
  JourneyTitle,
} from "@/components/common/journey";

/**
 * Принимает результат Telegram OIDC-flow:
 *   /tg/callback?exchange=<ticket>   — успешно
 *   /tg/callback?error=<message>     — ошибка
 *
 * Меняет ticket на JWT-пары через POST /auth/telegram/exchange.
 *
 * Tickets are single-use on the backend. React 19 StrictMode in dev mounts
 * the component twice in rapid succession, so we deduplicate exchange calls
 * across remounts via a module-level set keyed by ticket.
 */

const ticketResults = new Map<string, "ok" | "error">();
// Module-level cache of in-flight exchange promises. If a second mount
// arrives while the first is still running, both await the same Promise
// instead of firing a duplicate POST that would 404 once the backend
// invalidates the ticket.
const pendingExchanges = new Map<string, Promise<{ token: string; refresh_token: string } | null>>();
const ERROR_MESSAGES: Record<string, string> = {
  state_expired: "Сессия авторизации истекла. Попробуйте войти ещё раз.",
  user_disabled: "Ваш аккаунт деактивирован. Обратитесь в поддержку.",
  not_worker: "Этот Telegram-аккаунт привязан к другой роли.",
  not_client: "Этот Telegram-аккаунт привязан к другой роли.",
  account_error: "Не удалось создать или найти аккаунт. Попробуйте ещё раз.",
  missing_code_or_state: "Telegram не вернул код авторизации. Попробуйте ещё раз.",
  server_misconfigured: "Сервер временно недоступен. Попробуйте позже.",
  channel_not_subscribed: "Для регистрации необходимо подписаться на Telegram-канал.",
};

function humanizeError(raw: string): string {
  return ERROR_MESSAGES[raw] || raw;
}

export const TelegramCallback = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();

  const ticket = params.get("exchange");
  const errorParam = params.get("error");
  const channelUrl = params.get("channel_url");
  const channelTitle = params.get("channel_title");
  const recheckToken = params.get("recheck");

  const isChannelGate = errorParam === "channel_not_subscribed";

  const [error, setError] = useState<string>(errorParam ? humanizeError(errorParam) : "");
  const [retrying, setRetrying] = useState(false);
  const [gateNotice, setGateNotice] = useState("");

  useEffect(() => {
    // Подписка на канал — терминальное состояние без авторедиректов:
    // пользователь уходит в канал и возвращается по кнопке «Я подписался».
    if (isChannelGate) return;
    if (errorParam) {
      const timer = window.setTimeout(() => router.replace("/register"), 2500);
      return () => window.clearTimeout(timer);
    }
    if (!ticket) {
      const timer = window.setTimeout(() => router.replace("/register"), 1500);
      return () => window.clearTimeout(timer);
    }
    // React 19 StrictMode mounts effects twice in dev — and even in prod the
    // route can be re-entered by back/forward. The backend invalidates the
    // ticket on first successful POST, so a duplicate call would 404.
    // We share the in-flight Promise across mounts via a module-level map,
    // so any concurrent mount awaits the same exchange instead of firing
    // its own duplicate POST.
    let cancelled = false;

    let exchange = pendingExchanges.get(ticket);
    if (!exchange) {
      exchange = (async () => {
        try {
          const tokens = await api.exchangeTelegramTicket(ticket);
          ticketResults.set(ticket, "ok");
          return tokens;
        } catch (err) {
          // 404 here means the ticket was already consumed in a parallel
          // mount that we somehow didn't dedup. Treat as "no result"
          // rather than as an error so the original mount still wins.
          if (err instanceof ApiError && err.status === 404) {
            return null;
          }
          ticketResults.set(ticket, "error");
          throw err;
        } finally {
          // Keep the entry so subsequent mounts read the cached result
          // rather than refire the request, but allow GC of the closure
          // by replacing the Promise with a resolved snapshot.
        }
      })();
      pendingExchanges.set(ticket, exchange);
    }

    (async () => {
      try {
        const tokens = await exchange;
        if (cancelled) return;
        if (!tokens) {
          // Exchange resolved with no tokens (404 dedup case). If a sibling
          // mount succeeded we'll already be navigating; if not, fall back
          // to an error message instead of hanging forever.
          if (ticketResults.get(ticket) !== "ok") {
            setError("Не удалось завершить вход. Попробуйте заново.");
          }
          return;
        }
        setSession(tokens.token, tokens.refresh_token);
        telegramStorage.clearLinkedTo();
        // Hard navigation: forces a fresh app render so AuthProvider
        // re-hydrates from localStorage with the new session, instead of
        // racing with the router cache from the auth-callback page.
        window.location.replace("/cabinet");
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Не удалось завершить вход");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [errorParam, isChannelGate, router, setSession, ticket]);

  // Fallback: полный заход через Telegram OAuth (когда recheck-токена нет
  // или он истёк). linked_to переживает round-trip в sessionStorage.
  const restartTelegramLogin = () => {
    setRetrying(true);
    const linkedTo = telegramStorage.getLinkedTo();
    const search = linkedTo ? `?linked_to=${encodeURIComponent(linkedTo)}` : "";
    window.location.href = `${appConfig.apiBaseUrl}/auth/telegram/start${search}`;
  };

  // «Я подписался»: проверяем подписку по recheck-токену — бэкенд дёргает
  // getChatMember и сразу выдаёт JWT-пары, без нового прохода Telegram OAuth.
  const handleSubscriptionConfirm = async () => {
    if (!recheckToken) {
      restartTelegramLogin();
      return;
    }
    setRetrying(true);
    setGateNotice("");
    try {
      const tokens = await api.recheckTelegramSubscription(recheckToken);
      setSession(tokens.token, tokens.refresh_token);
      telegramStorage.clearLinkedTo();
      window.location.replace("/cabinet");
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 409) {
        setGateNotice(
          "Пока не видим подписку. Проверьте, что подписались на канал, подождите пару секунд и попробуйте ещё раз.",
        );
        setRetrying(false);
        return;
      }
      if (nextError instanceof ApiError && nextError.status === 410) {
        // Токен истёк — единственный путь дальше: заново через Telegram.
        restartTelegramLogin();
        return;
      }
      setGateNotice(
        nextError instanceof ApiError
          ? humanizeError(nextError.message)
          : "Не удалось проверить подписку. Попробуйте ещё раз.",
      );
      setRetrying(false);
    }
  };

  return (
    <JourneyShell
      brandSub="вход через Telegram"
      links={[
        { href: "/", label: "К выбору ролей" },
        { href: "/register", label: "Назад к регистрации" },
      ]}
    >
      <JourneyPanel tone="light">
        <JourneyCash />
        <JourneyEyebrow>Telegram</JourneyEyebrow>
        <JourneyTitle>
          {isChannelGate ? "Остался один шаг" : error ? "Не получилось войти" : "Завершаем вход"}
        </JourneyTitle>
        <JourneyLead>
          {isChannelGate
            ? `Вход открыт подписчикам нашего Telegram-канала${channelTitle ? ` «${channelTitle}»` : ""}. Подпишитесь и нажмите «Я подписался» — проверим подписку и сразу продолжим вход.`
            : error
              ? "Сейчас вернём вас на страницу регистрации. Попробуйте ещё раз — если ошибка повторится, напишите в поддержку."
              : "Обмениваем результат Telegram на сессию. Это занимает пару секунд."}
        </JourneyLead>
        {isChannelGate ? (
          <>
            <JourneyChannelGate
              channelUrl={channelUrl}
              confirming={retrying}
              onConfirm={() => void handleSubscriptionConfirm()}
            />
            {gateNotice ? <JourneyFeedback tone="error">{gateNotice}</JourneyFeedback> : null}
          </>
        ) : error ? (
          <JourneyFeedback tone="error">{error}</JourneyFeedback>
        ) : (
          <JourneyFeedback tone="info">Подождите…</JourneyFeedback>
        )}
      </JourneyPanel>
    </JourneyShell>
  );
};
