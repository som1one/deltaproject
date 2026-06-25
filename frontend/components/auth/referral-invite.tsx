"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect } from "react";

import { api } from "@/lib/api";
import { telegramStorage } from "@/lib/storage";
import { TelegramButton } from "@/components/auth/telegram-button";
import {
  JourneyEyebrow,
  JourneyFeatureGrid,
  JourneyFeedback,
  JourneyLead,
  JourneyList,
  JourneyPanel,
  JourneyShell,
  JourneyTitle,
} from "@/components/common/journey";
import styles from "@/components/auth/referral-invite.module.css";

const facts = [
  "Регистрация через Telegram, без анкет",
  "Ваш кабинет автоматически привяжется к этому блогеру",
  "Вы видите свои сделки, статусы и баланс с первого дня",
] as const;

const features = [
  {
    icon: "⚡",
    title: "Мгновенная регистрация",
    text: "Вход через Telegram за один клик. Без email, паролей и анкет — ник и аватар подтягиваются из профиля.",
  },
  {
    icon: "🔗",
    title: "Связь блогер — воркер",
    text: "Платформа связывает блогеров и их представителей. Каждый видит свои задачи, статусы и баланс.",
  },
  {
    icon: "📋",
    title: "Готовые скрипты",
    text: "Шаблоны сообщений для продавцов. Не нужно придумывать — берёте и пишете по сценарию.",
  },
  {
    icon: "💰",
    title: "Автоматический расчёт",
    text: "Доли блогера и воркера считаются системой. Вся бухгалтерия прозрачна и доступна в кабинете.",
  },
  {
    icon: "📊",
    title: "Прозрачные статусы",
    text: "Каждая сделка проходит чёткие этапы — от заявки до выплаты. Всё видно обеим сторонам.",
  },
  {
    icon: "🏦",
    title: "Вывод на карту",
    text: "Накопленный баланс можно вывести прямо из личного кабинета. Без ручных переводов и согласований.",
  },
] as const;

export const ReferralInvite = ({ username }: { username: string }) => {
  const referralQuery = useQuery({
    queryKey: ["referral", username],
    queryFn: () => api.resolveReferral(username),
    enabled: Boolean(username),
  });

  useEffect(() => {
    if (referralQuery.data?.user_id) {
      telegramStorage.setLinkedTo(referralQuery.data.user_id);
    }
  }, [referralQuery.data?.user_id]);

  return (
    <JourneyShell
      brandSub={`приглашение от @${username}`}
      links={[
        { href: "/", label: "К выбору ролей" },
        { href: "/blogger/login", label: "Я блогер" },
      ]}
    >
      <JourneyPanel tone="light">
        <motion.section
          className={styles.inviteCard}
          initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: [0.16, 0.84, 0.3, 1] }}
        >
          <div className={styles.inviteCardGlow} aria-hidden />
          <p className={styles.inviteEyebrow}>Приглашение</p>
          <p className={styles.inviteScript}>Вы регистрируетесь по приглашению блогера</p>
          <p className={styles.inviteUsername}>@{username}</p>
          {referralQuery.data ? (
            <p className={styles.inviteState}>Приглашение подтверждено · привязка появится автоматически</p>
          ) : referralQuery.isLoading ? (
            <p className={styles.inviteState}>Проверяем приглашение…</p>
          ) : referralQuery.isError ? (
            <p className={`${styles.inviteState} ${styles.inviteStateError}`}>
              {referralQuery.error.message}
            </p>
          ) : null}
        </motion.section>

        <JourneyEyebrow>Роль · Работник</JourneyEyebrow>
        <JourneyTitle>Один клик — и вы в системе</JourneyTitle>
        <JourneyLead>
          Здесь ничего не нужно заполнять. Нажимаете кнопку, проходите Telegram-вход, и кабинет
          собирается автоматически. Привязка к блогеру выставится сама.
        </JourneyLead>

        <div className={styles.inviteActions}>
          <TelegramButton linkedTo={referralQuery.data?.user_id || null} />
        </div>

        {referralQuery.isError ? (
          <JourneyFeedback tone="error">
            Ссылка устарела или неверна. Попросите блогера прислать актуальный адрес.
          </JourneyFeedback>
        ) : null}

        <JourneyList items={facts} />
      </JourneyPanel>

      <JourneyPanel tone="dark">
        <JourneyEyebrow>Что это</JourneyEyebrow>
        <JourneyTitle>Платформа для блогеров и их команд</JourneyTitle>
        <JourneyLead>
          looney moon — закрытая система, где блогеры получают рекламодателей через проверенных
          воркеров, а воркеры зарабатывают долю с каждой закрытой сделки. Всё автоматизировано:
          от поиска продавцов до расчёта выплат.
        </JourneyLead>
        <JourneyFeatureGrid features={features} />
      </JourneyPanel>
    </JourneyShell>
  );
};
