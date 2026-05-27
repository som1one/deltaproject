"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSessionTarget } from "@/lib/use-session-target";
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
  JourneyList,
  JourneyPanel,
  JourneyShell,
  JourneySteps,
  JourneySubmit,
  JourneyTitle,
} from "@/components/common/journey";

const bloggerFacts = [
  "Стабильный поток заявок от проверенных воркеров",
  "Каждая сделка проходит модерацию администратором",
  "Реферальная сеть приносит долю с каждой сделки воркеров",
  "Никаких чатов и ручных подсчётов — только кабинет",
] as const;

const steps = [
  {
    id: "01",
    title: "Получаете заявки",
    text: "Воркеры приводят рекламодателей и оформляют сделку — вам остаётся принять или отклонить.",
  },
  {
    id: "02",
    title: "Делаете рекламу",
    text: "Согласуете формат с рекламодателем, выходите в эфир. Платформа фиксирует факт оплаты.",
  },
  {
    id: "03",
    title: "Получаете выплату",
    text: "После «Оплачено» сумма делится по вашей схеме. Запросить вывод можно прямо из кабинета.",
  },
] as const;

export const BloggerLoginScreen = () => {
  const router = useRouter();
  const { setSession } = useAuth();
  const session = useSessionTarget();
  const [form, setForm] = useState({ nickname: "", password: "" });
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: () =>
      api.bloggerLogin({
        nickname: form.nickname,
        password: form.password,
      }),
    onSuccess: (payload) => {
      setError("");
      setSession(payload.token, payload.refresh_token);
      router.push("/cabinet");
    },
    onError: (nextError) => setError(nextError.message),
  });

  // Если пользователь уже залогинен — редиректим в кабинет, не показывая форму.
  useEffect(() => {
    if (session.ready && session.isAuthenticated && session.href) {
      router.replace(session.href);
    }
  }, [router, session.ready, session.isAuthenticated, session.href]);

  if (session.ready && session.isAuthenticated) {
    return null;
  }

  return (
    <JourneyShell
      brandSub="кабинет блогера"
      links={[
        { href: "/", label: "К выбору ролей" },
        { href: "/register", label: "Я воркер" },
      ]}
    >
      <JourneyPanel tone="light">
        <JourneyCameraIcon />
        <JourneyEyebrow>Роль 02 · блогер</JourneyEyebrow>
        <JourneyTitle>Принимайте интеграции и стройте свою сеть</JourneyTitle>
        <JourneyLead>
          looney moon приводит вам рекламодателей через сеть проверенных воркеров. Вы выпускаете рекламу,
          платформа считает доли и переводит выплаты. Логин выдаёт администратор под ваш ник.
        </JourneyLead>

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
          <JourneySubmit disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Входим…" : "Войти в кабинет"}
          </JourneySubmit>
          <JourneyHelper>Если забыли пароль — администратор перевыдаст его в админ-панели.</JourneyHelper>
        </JourneyForm>

        {error ? (
          <JourneyActions>
            <JourneyFeedback tone="error">{error}</JourneyFeedback>
          </JourneyActions>
        ) : null}

        <JourneyList items={bloggerFacts} />
      </JourneyPanel>

      <JourneyPanel tone="dark">
        <JourneyEyebrow>Что внутри кабинета</JourneyEyebrow>
        <JourneyTitle>Сделки, реферальная сеть и выплаты в одном окне</JourneyTitle>
        <JourneyLead>
          Принимайте заявки от воркеров, делитесь персональной реферальной ссылкой и забирайте долю с каждой сделки в их сети.
          Выплата — несколько кликов после статуса «Оплачено».
        </JourneyLead>
        <JourneySteps steps={steps} />
      </JourneyPanel>
    </JourneyShell>
  );
};
