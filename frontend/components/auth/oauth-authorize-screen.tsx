"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  JourneyActions,
  JourneyCameraIcon,
  JourneyEyebrow,
  JourneyFeedback,
  JourneyField,
  JourneyForm,
  JourneyHelper,
  JourneyInput,
  JourneyLead,
  JourneyPanel,
  JourneyShell,
  JourneySteps,
  JourneySubmit,
  JourneyTitle,
} from "@/components/common/journey";

const steps = [
  {
    id: "01",
    title: "Подтверждаем аккаунт",
    text: "Маркетплейс не видит ваш пароль — платформа передаёт только одноразовый код входа.",
  },
  {
    id: "02",
    title: "Возвращаем на маркет",
    text: "После входа вы окажетесь в кабинете блогера на маркетплейсе со своими заказами.",
  },
  {
    id: "03",
    title: "Профиль — здесь",
    text: "Карточка в каталоге, цены и портфолио редактируются в кабинете платформы.",
  },
] as const;

/**
 * SSO-мост «платформа → маркетплейс».
 * Если блогер уже залогинен — сразу выдаём код и уходим на redirect_uri.
 * Иначе показываем вход блогера, после успеха — код и редирект.
 */
export const OAuthAuthorizeScreen = () => {
  const searchParams = useSearchParams();
  const { isHydrated, isAuthenticated, setSession } = useAuth();

  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const nextPath = searchParams.get("next") ?? "/blogger";

  const [form, setForm] = useState({ nickname: "", password: "" });
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "authorizing" | "redirecting">("idle");
  const autoTriedRef = useRef(false);

  const performAuthorize = useCallback(async () => {
    setPhase("authorizing");
    try {
      const result = await api.platformAuthorize(redirectUri);
      const target = new URL(result.redirect_uri);
      target.searchParams.set("code", result.code);
      target.searchParams.set("next", nextPath);
      setPhase("redirecting");
      window.location.href = target.toString();
    } catch (err) {
      setPhase("idle");
      if (err instanceof ApiError && err.status === 403) {
        setError("Этот вход доступен только блогерам. Войдите в аккаунт блогера.");
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        // Токен протух — покажем форму входа
        setError("");
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось выдать код входа");
    }
  }, [nextPath, redirectUri]);

  // Уже залогинен → пробуем выдать код сразу (один раз)
  useEffect(() => {
    if (!isHydrated || !redirectUri || autoTriedRef.current) return;
    if (isAuthenticated) {
      autoTriedRef.current = true;
      void performAuthorize();
    }
  }, [isHydrated, isAuthenticated, performAuthorize, redirectUri]);

  const loginMutation = useMutation({
    mutationFn: () =>
      api.bloggerLogin({
        nickname: form.nickname,
        password: form.password,
      }),
    onSuccess: async (payload) => {
      setError("");
      setSession(payload.token, payload.refresh_token);
      await performAuthorize();
    },
    onError: (nextError: Error) => setError(nextError.message),
  });

  if (!redirectUri) {
    return (
      <JourneyShell brandSub="вход в маркетплейс" links={[{ href: "/", label: "На главную" }]}>
        <JourneyPanel tone="light">
          <JourneyEyebrow>Ошибка запроса</JourneyEyebrow>
          <JourneyTitle>Не указан адрес возврата</JourneyTitle>
          <JourneyLead>
            Откройте страницу входа на маркетплейсе и нажмите «Войти через платформу» ещё раз.
          </JourneyLead>
        </JourneyPanel>
      </JourneyShell>
    );
  }

  const busy = phase !== "idle" || loginMutation.isPending;

  return (
    <JourneyShell
      brandSub="вход в маркетплейс"
      links={[
        { href: "/", label: "На главную" },
        { href: "/blogger/login", label: "Кабинет блогера" },
      ]}
    >
      <JourneyPanel tone="light">
        <JourneyCameraIcon />
        <JourneyEyebrow>Единый вход · SSO</JourneyEyebrow>
        <JourneyTitle>Вход в маркетплейс через платформу</JourneyTitle>
        <JourneyLead>
          {phase === "redirecting"
            ? "Код выдан — возвращаем вас на маркетплейс…"
            : phase === "authorizing"
              ? "Проверяем аккаунт и выдаём одноразовый код…"
              : "Подтвердите аккаунт блогера looney moon, и мы вернём вас на маркетплейс уже авторизованным."}
        </JourneyLead>

        {phase === "idle" && (
          <JourneyForm onSubmit={() => loginMutation.mutate()}>
            <JourneyField label="Никнейм блогера">
              <JourneyInput
                autoComplete="username"
                value={form.nickname}
                onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))}
                placeholder="nickname"
              />
            </JourneyField>
            <JourneyField label="Пароль">
              <JourneyInput
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="••••••••"
              />
            </JourneyField>
            <JourneySubmit disabled={busy}>
              {busy ? "Входим…" : "Войти и вернуться на маркет"}
            </JourneySubmit>
            <JourneyHelper>
              Маркетплейс не получает ваш пароль — только одноразовый код входа, действующий 2 минуты.
            </JourneyHelper>
          </JourneyForm>
        )}

        {error ? (
          <JourneyActions>
            <JourneyFeedback tone="error">{error}</JourneyFeedback>
          </JourneyActions>
        ) : null}
      </JourneyPanel>

      <JourneyPanel tone="dark">
        <JourneyEyebrow>Как это работает</JourneyEyebrow>
        <JourneyTitle>Один аккаунт — платформа и маркетплейс</JourneyTitle>
        <JourneySteps steps={steps} />
      </JourneyPanel>
    </JourneyShell>
  );
};
