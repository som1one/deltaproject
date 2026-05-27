"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect } from "react";

import { api } from "@/lib/api";
import { telegramStorage } from "@/lib/storage";
import { TelegramButton } from "@/components/auth/telegram-button";
import {
  JourneyEyebrow,
  JourneyFeedback,
  JourneyLead,
  JourneyLinkRow,
  JourneyList,
  JourneyPanel,
  JourneyShell,
  JourneySteps,
  JourneyTitle,
} from "@/components/common/journey";
import styles from "@/components/auth/referral-invite.module.css";

const facts = [
  "Регистрация через Telegram, без анкет",
  "Ваш кабинет автоматически привяжется к этому блогеру",
  "Вы видите свои сделки, статусы и баланс с первого дня",
] as const;

const steps = [
  {
    id: "01",
    title: "Один клик в Telegram",
    text: "Подтверждение учётной записи без email и пароля. Ник и имя — из вашего профиля.",
  },
  {
    id: "02",
    title: "Кабинет собирается сам",
    text: "Привязка к блогеру выставляется автоматически. Скрипты и список блогеров — внутри.",
  },
  {
    id: "03",
    title: "Первая сделка",
    text: "Пишете продавцам по готовым шаблонам, заводите заявку, блогер принимает её в кабинете.",
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
          <JourneyLinkRow>
            <Link href="/blogger/login">Я блогер</Link>
          </JourneyLinkRow>
        </div>

        {referralQuery.isError ? (
          <JourneyFeedback tone="error">
            Ссылка устарела или неверна. Попросите блогера прислать актуальный адрес.
          </JourneyFeedback>
        ) : null}

        <JourneyList items={facts} />
      </JourneyPanel>

      <JourneyPanel tone="dark">
        <JourneyEyebrow>Что вы получите</JourneyEyebrow>
        <JourneyTitle>Тихая система. Никакой возни.</JourneyTitle>
        <JourneyLead>
          Регистрация занимает минуту. Дальше — поиск продавцов, готовые скрипты, автоматический
          расчёт долей и прозрачные статусы по каждой сделке.
        </JourneyLead>
        <JourneySteps steps={steps} />
      </JourneyPanel>
    </JourneyShell>
  );
};
