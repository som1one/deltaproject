"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import { SiteFooter } from "@/components/common/site-footer";
import styles from "@/components/marketing/info-page.module.css";

const faqs: { q: string; a: string }[] = [
  {
    q: "Как начать работать на платформе?",
    a: "Зарегистрируйтесь по реферальной ссылке от блогера, войдите в личный кабинет и начните искать рекламодателей. Каждая закрытая сделка приносит вам долю.",
  },
  {
    q: "Как устроены выплаты?",
    a: "После подтверждения сделки администратором система автоматически распределяет доли между работником, блогером и рефералом. Деньги поступают на баланс в кабинете.",
  },
  {
    q: "Как вывести заработанное?",
    a: "Перейдите в раздел «Финансы» в кабинете, укажите карту и создайте запрос на выплату. Администратор обработает его в течение рабочего дня.",
  },
  {
    q: "Что делает работник?",
    a: "Работник находит продавцов на маркетплейсах, ведёт переписку, согласовывает рекламную интеграцию и заводит сделку в системе.",
  },
  {
    q: "Что делает блогер?",
    a: "Блогер выпускает рекламные интеграции и привлекает работников через персональную реферальную ссылку. Принимает заявки и получает свою долю с каждой сделки.",
  },
  {
    q: "Как работает реферальная система?",
    a: "Каждый блогер получает ссылку вида site.com/ref/username. Работник, зарегистрировавшийся по ней, автоматически привязывается к блогеру.",
  },
  {
    q: "Кто подтверждает сделки?",
    a: "Администратор. Каждая сделка проходит проверку перед подтверждением. После статуса «Оплачена» включается автоматическое распределение.",
  },
  {
    q: "Как связаться с поддержкой?",
    a: "Напишите нам в Telegram — @delta_agency. Отвечаем в рабочее время в течение нескольких часов.",
  },
];

const FaqItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <article className={`${styles.faqItem}${open ? ` ${styles.faqItemOpen}` : ""}`}>
      <button type="button" className={styles.faqQ} onClick={() => setOpen((v) => !v)}>
        <span>{q}</span>
        <span className={styles.faqMark} aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.4, ease: [0.16, 0.84, 0.3, 1] }}
        className={styles.faqAnswerWrap}
      >
        <p className={styles.faqA}>{a}</p>
      </motion.div>
    </article>
  );
};

export const FaqPage = () => (
  <main className={styles.page}>
    <AnimatedSection>
      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>FAQ</p>
        <h1 className={styles.heroTitle}>
          Главные вопросы.<br />
          <em>Прямые ответы.</em>
        </h1>
        <p className={styles.heroLead}>
          Если что-то осталось непонятным — напишите нам в Telegram. Мы не любим долгие переписки и
          отвечаем по делу.
        </p>
      </section>
    </AnimatedSection>

    <StaggerGroup className={styles.faqList}>
      {faqs.map((item) => (
        <StaggerItem key={item.q}>
          <FaqItem q={item.q} a={item.a} />
        </StaggerItem>
      ))}
    </StaggerGroup>

    <SiteFooter />
  </main>
);
