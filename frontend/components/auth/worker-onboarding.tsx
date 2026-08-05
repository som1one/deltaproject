"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { telegramStorage } from "@/lib/storage";
import { useSessionTarget } from "@/lib/use-session-target";
import {
  JourneyActions,
  JourneyClipboardIcon,
  JourneyEyebrow,
  JourneyFeedback,
  JourneyLead,
  JourneyList,
  JourneyPanel,
  JourneyReferralBadge,
  JourneyShell,
  JourneySteps,
  JourneyTitle,
} from "@/components/common/journey";
import { TelegramButton } from "@/components/auth/telegram-button";

const facts = [
  "Персональная реферальная ссылка и готовые скрипты сообщений",
  "Процент с каждого оплаченного заказа приведённого заказчика",
  "Telegram-бот сообщит о новых рефералах и комиссиях",
  "Вывод заработанного на карту из кабинета",
] as const;

const steps = [
  {
    id: "01",
    title: "Получаете ссылку",
    text: "Регистрируетесь через Telegram — в кабинете уже ждут персональная реферальная ссылка и скрипты сообщений.",
  },
  {
    id: "02",
    title: "Приводите заказчика",
    text: "Пишете тем, кому нужна реклама у блогеров, по готовым скриптам и отправляете ссылку на маркетплейс. Заказчик привязывается к вам навсегда.",
  },
  {
    id: "03",
    title: "Получаете процент",
    text: "С каждого оплаченного заказа приведённого заказчика вам начисляется процент — после приёмки работы он появляется на балансе.",
  },
] as const;

export const WorkerOnboarding = ({ username }: { username?: string }) => {
  const router = useRouter();
  const session = useSessionTarget();

  const referralQuery = useQuery({
    queryKey: ["referral", username],
    queryFn: () => api.resolveReferral(username as string),
    enabled: Boolean(username),
  });

  useEffect(() => {
    if (referralQuery.data?.user_id) {
      telegramStorage.setLinkedTo(referralQuery.data.user_id);
    }
  }, [referralQuery.data?.user_id]);

  // Если пользователь уже залогинен — не показываем экран регистрации,
  // а сразу уходим в его кабинет (или админку).
  useEffect(() => {
    if (session.ready && session.isAuthenticated && session.href) {
      router.replace(session.href);
    }
  }, [router, session.ready, session.isAuthenticated, session.href]);

  if (session.ready && session.isAuthenticated) {
    return null;
  }

  const lead = username
    ? "Вас пригласил блогер. Один клик через Telegram — и кабинет уже привязан к нему. Дальше вы делитесь своей реферальной ссылкой с заказчиками, а процент с их заказов считает платформа."
    : "moneymaxxxing — площадка, где воркеры приводят заказчиков на маркетплейс рекламы у блогеров. Вы получаете персональную ссылку и процент с каждого оплаченного заказа приведённого заказчика — расчёты и выплаты берёт на себя платформа.";

  return (
    <JourneyShell
      brandSub="кабинет воркера"
      links={[
        { href: "/", label: "К выбору ролей" },
        { href: "/blogger/login", label: "Я блогер" },
      ]}
    >
      <JourneyPanel tone="light">
        <JourneyClipboardIcon />
        <JourneyEyebrow>Роль 01 · воркер</JourneyEyebrow>
        <JourneyTitle>Приводите заказчиков и зарабатывайте на их заказах</JourneyTitle>
        <JourneyLead>{lead}</JourneyLead>

        {username ? <JourneyReferralBadge username={username} /> : null}

        <JourneyActions>
          <TelegramButton linkedTo={referralQuery.data?.user_id || null} />
        </JourneyActions>

        <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--text-soft)", textAlign: "center", lineHeight: 1.5 }}>
          Регистрируясь, вы соглашаетесь с{" "}
          <a href="/terms" style={{ color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
            правилами платформы
          </a>.
        </p>

        {username && referralQuery.isError ? (
          <JourneyFeedback tone="error">{referralQuery.error.message}</JourneyFeedback>
        ) : null}
        {username && referralQuery.data ? (
          <JourneyFeedback tone="success">
            Приглашение найдено. После входа кабинет автоматически привяжется к блогеру.
          </JourneyFeedback>
        ) : null}

        <JourneyList items={facts} />
      </JourneyPanel>

      <JourneyPanel tone="dark">
        <JourneyEyebrow>Что это</JourneyEyebrow>
        <JourneyTitle>Готовая инфраструктура для заработка на рекламе</JourneyTitle>
        <JourneyLead>
          Никаких таблиц и ручных расчётов. Ссылка, скрипты, начисления и выплаты живут
          в одном кабинете — вы концентрируетесь только на общении с заказчиками.
        </JourneyLead>
        <JourneySteps steps={steps} />
      </JourneyPanel>
    </JourneyShell>
  );
};
