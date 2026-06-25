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
  "Готовая база рекламодателей и скрипты переписки",
  "Сделки и статистика обновляются в реальном времени",
  "Доля воркера фиксируется до старта и капает на баланс",
  "Реферальные ссылки — пассивный доход с приведённых воркеров",
] as const;

const steps = [
  {
    id: "01",
    title: "Находите рекламодателя",
    text: "Берёте маркетплейс или магазин, пишете владельцу по готовому скрипту и согласовываете рекламу.",
  },
  {
    id: "02",
    title: "Заводите сделку",
    text: "В кабинете указываете магазин, товар, цену и блогера. Заявка уходит блогеру и администратору.",
  },
  {
    id: "03",
    title: "Получаете долю",
    text: "После статуса «Оплачена» система делит сумму по схеме блогера — ваша часть появляется на балансе.",
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
    ? "Вас пригласил блогер. Один клик через Telegram — и кабинет уже привязан к нему. Дальше вы только ищете рекламодателей и закрываете сделки, остальное считает платформа."
    : "looney moon — это закрытая площадка, где воркеры приводят рекламодателей блогерам. Вы зарабатываете с каждой согласованной интеграции, мы берём на себя контракты, расчёты и выплаты.";

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
        <JourneyTitle>Закрывайте сделки и зарабатывайте на интеграциях</JourneyTitle>
        <JourneyLead>{lead}</JourneyLead>

        {username ? <JourneyReferralBadge username={username} /> : null}

        <JourneyActions>
          <TelegramButton linkedTo={referralQuery.data?.user_id || null} />
        </JourneyActions>

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
        <JourneyTitle>Готовая инфраструктура для рекламных сделок</JourneyTitle>
        <JourneyLead>
          Никаких таблиц, чатов и ручных расчётов. Скрипты, статусы, проценты и выплаты живут в одном кабинете —
          вы концентрируетесь только на переговорах с рекламодателем.
        </JourneyLead>
        <JourneySteps steps={steps} />
      </JourneyPanel>
    </JourneyShell>
  );
};
