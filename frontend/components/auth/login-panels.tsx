"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSessionTarget } from "@/lib/use-session-target";
import {
  JourneyActions,
  JourneyEyebrow,
  JourneyFeedback,
  JourneyField,
  JourneyForm,
  JourneyHelper,
  JourneyInput,
  JourneyLead,
  JourneyList,
  JourneyMoon,
  JourneyPanel,
  JourneyShell,
  JourneySteps,
  JourneySubmit,
  JourneyTitle,
} from "@/components/common/journey";

const meta = {
  eyebrow: "Роль 03 · администратор",
  title: "Вход в административную панель",
  lead: "Только для основателя площадки. Управляет пользователями, сделками, выплатами, схемами распределения и скриптами для воркеров.",
  helper: "Учётная запись администратора создаётся утилитой create_admin и не доступна для самостоятельной регистрации.",
  facts: [
    "Доступ только администратору",
    "Полный контроль над сделками и выплатами",
    "Создание блогеров и выдача паролей",
  ],
  rightEyebrow: "Что внутри",
  rightTitle: "Командный центр площадки",
  rightLead:
    "Сводная статистика, операции по сделкам с обязательной причиной, ручное завершение выплат и настройка финансовых схем по каждому блогеру.",
  steps: [
    {
      id: "01",
      title: "Пользователи",
      text: "Просмотр, редактирование, создание блогера с автоматически выданным паролем под ник.",
    },
    {
      id: "02",
      title: "Сделки",
      text: "Подтверждение, отметка об оплате, завершение, отклонение — каждое действие фиксируется в журнале.",
    },
    {
      id: "03",
      title: "Финансы",
      text: "Леджер, ручное закрытие выплат и настройка распределения долей по каждому блогеру.",
    },
  ],
  headerLinks: [
    { href: "/", label: "К выбору ролей" },
    { href: "/blogger/login", label: "Вход блогера" },
    { href: "/register", label: "Вход воркера" },
  ],
  redirect: "/admin",
} as const;

export const AdminLoginPanels = () => {
  const router = useRouter();
  const { setSession } = useAuth();
  const session = useSessionTarget();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => api.adminLogin({ email: form.email, password: form.password }),
    onSuccess: (payload) => {
      setError("");
      setSession(payload.token, payload.refresh_token);
      router.push(meta.redirect);
    },
    onError: (nextError) => setError(nextError.message),
  });

  // Уже залогиненного админа сразу пускаем в админку (или его кабинет, если воркер/блогер).
  useEffect(() => {
    if (session.ready && session.isAuthenticated && session.href) {
      router.replace(session.href);
    }
  }, [router, session.ready, session.isAuthenticated, session.href]);

  if (session.ready && session.isAuthenticated) {
    return null;
  }

  return (
    <JourneyShell brandSub="админ-панель" links={[...meta.headerLinks]}>
      <JourneyPanel tone="light">
        <JourneyMoon />
        <JourneyEyebrow>{meta.eyebrow}</JourneyEyebrow>
        <JourneyTitle>{meta.title}</JourneyTitle>
        <JourneyLead>{meta.lead}</JourneyLead>

        <JourneyForm onSubmit={() => loginMutation.mutate()}>
          <JourneyField label="Email">
            <JourneyInput
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="you@example.com"
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
            {loginMutation.isPending ? "Входим…" : "Войти"}
          </JourneySubmit>
          <JourneyHelper>{meta.helper}</JourneyHelper>
        </JourneyForm>

        {error ? (
          <JourneyActions>
            <JourneyFeedback tone="error">{error}</JourneyFeedback>
          </JourneyActions>
        ) : null}

        <JourneyList items={[...meta.facts]} />
      </JourneyPanel>

      <JourneyPanel tone="dark">
        <JourneyEyebrow>{meta.rightEyebrow}</JourneyEyebrow>
        <JourneyTitle>{meta.rightTitle}</JourneyTitle>
        <JourneyLead>{meta.rightLead}</JourneyLead>
        <JourneySteps steps={[...meta.steps]} />
      </JourneyPanel>
    </JourneyShell>
  );
};
