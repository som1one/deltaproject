"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { telegramStorage } from "@/lib/storage";
import {
  JourneyEyebrow,
  JourneyFeedback,
  JourneyLead,
  JourneyMoon,
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
export const TelegramCallback = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useAuth();

  const ticket = params.get("exchange");
  const errorParam = params.get("error");

  const [error, setError] = useState<string>(errorParam ?? "");

  useEffect(() => {
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
  }, [errorParam, router, setSession, ticket]);

  return (
    <JourneyShell
      brandSub="вход через Telegram"
      links={[
        { href: "/", label: "К выбору ролей" },
        { href: "/register", label: "Назад к регистрации" },
      ]}
    >
      <JourneyPanel tone="light">
        <JourneyMoon />
        <JourneyEyebrow>Telegram</JourneyEyebrow>
        <JourneyTitle>{error ? "Не получилось войти" : "Завершаем вход"}</JourneyTitle>
        <JourneyLead>
          {error
            ? "Сейчас вернём вас на страницу регистрации. Попробуйте ещё раз — если ошибка повторится, напишите в поддержку."
            : "Обмениваем результат Telegram на сессию. Это занимает пару секунд."}
        </JourneyLead>
        {error ? (
          <JourneyFeedback tone="error">{error}</JourneyFeedback>
        ) : (
          <JourneyFeedback tone="info">Подождите…</JourneyFeedback>
        )}
      </JourneyPanel>
    </JourneyShell>
  );
};
