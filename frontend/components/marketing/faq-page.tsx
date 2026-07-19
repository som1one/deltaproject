"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import { SiteFooter } from "@/components/common/site-footer";
import styles from "@/components/marketing/info-page.module.css";

const faqs: { q: string; a: string }[] = [
  {
    q: "Что такое looney moon?",
    a: "Сообщество по ворку — платформа, где быстро находят заработок в интернете. Воркеры приводят заказчиков рекламы и получают процент с их заказов, блогеры выполняют интеграции. Расчёты и выплаты берёт на себя платформа.",
  },
  {
    q: "Как начать зарабатывать?",
    a: "Зарегистрируйтесь через Telegram — это занимает минуту. В кабинете сразу появятся персональная реферальная ссылка и готовые скрипты сообщений. Отправляйте ссылку потенциальным заказчикам — процент с каждого их заказа ваш.",
  },
  {
    q: "Что делает воркер?",
    a: "Находит тех, кому нужна реклама у блогеров: продавцов маркетплейсов, малый бизнес, экспертов. Пишет им по готовым скриптам из кабинета и приглашает на площадку по своей ссылке. Дальше заказчик всё делает сам.",
  },
  {
    q: "Что делает блогер?",
    a: "Ведёт профиль в каталоге маркетплейса и получает прямые заказы на рекламные интеграции. Детали согласовываются во встроенном чате, оплата проходит через площадку.",
  },
  {
    q: "Чем платформа отличается от маркетплейса?",
    a: "looney moon — сообщество и кабинеты тех, кто зарабатывает: воркеров и блогеров. Маркетплейс — отдельный сервис для заказчиков: каталог блогеров, где покупают рекламу. Воркеры приводят туда заказчиков, блогеры выполняют там заказы.",
  },
  {
    q: "Как работает реферальная ссылка?",
    a: "У каждого воркера есть персональная ссылка на маркетплейс. Заказчик, зарегистрировавшийся по ней, привязывается к воркеру навсегда: процент начисляется с каждого его заказа, а не только с первого.",
  },
  {
    q: "Когда начисляется комиссия?",
    a: "Заказчик оплачивает заказ через площадку, и деньги держатся в эскроу. Когда блогер выполнил работу и заказчик её принял, система автоматически распределяет доли — ваша появляется на балансе.",
  },
  {
    q: "Как вывести заработанное?",
    a: "Привяжите карту в разделе «Профиль», затем в «Финансах» укажите сумму и создайте запрос на выплату. Администратор обработает его в течение рабочего дня.",
  },
  {
    q: "Как связаться с поддержкой?",
    a: "Напишите нам в Telegram — @looneymoonhelper. Отвечаем в рабочее время в течение нескольких часов.",
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
