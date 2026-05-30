"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { AnimatedSection, StaggerGroup, StaggerItem } from "@/components/common/animated-section";
import styles from "@/components/marketing/info-page.module.css";

const faqs: { q: string; a: string }[] = [
  {
    q: "Как работает платформа?",
    a: "Работники находят рекламодателей среди продавцов маркетплейсов и заводят сделки. Блогеры принимают подходящие интеграции и выпускают рекламу. Администратор подтверждает каждую сделку. После статуса «Оплачена» система автоматически распределяет доли и зачисляет средства на балансы.",
  },
  {
    q: "Кто такой работник?",
    a: "Работник — это аутричер, который ведёт переписку с продавцами, согласовывает рекламу и заводит заявку в системе. После подтверждения он получает свою долю с каждой сделки.",
  },
  {
    q: "Кто такой блогер?",
    a: "Блогер делает рекламные интеграции и привлекает работников по персональной реферальной ссылке. Он принимает заявки в кабинете, видит статус каждой сделки и получает свою долю.",
  },
  {
    q: "Как считаются выплаты?",
    a: "Каждый блогер привязан к финансовой схеме. Например, при цене интеграции 15 000 ₽ распределение может быть таким: 5 000 ₽ блогеру, 2 000 ₽ работнику, 1 000 ₽ рефералу блогера, 8 000 ₽ платформе. Конкретные веса задаёт администратор.",
  },
  {
    q: "Как работает реферальная ссылка?",
    a: "Каждый блогер получает ссылку вида site.com/ref/{username}. Любой работник, прошедший по ней регистрацию, автоматически привязывается к блогеру. Привязка срабатывает в момент регистрации.",
  },
  {
    q: "Когда можно вывести деньги?",
    a: "Когда сделка переходит в статус «Оплачена», ваша доля попадает на баланс. Запрос на выплату создаётся в разделе «Финансы» личного кабинета. Администратор подтверждает выплату вручную.",
  },
  {
    q: "Кто подтверждает сделки?",
    a: "Администратор. Сделка проходит четыре статуса: Новая → Проверка → Подтверждена → Оплачена → Выполнена. Каждый переход фиксируется в журнале и сопровождается обязательной причиной.",
  },
  {
    q: "Как создаётся аккаунт блогера?",
    a: "Только администратор. Самостоятельная регистрация блогера через сайт закрыта. Администратор создаёт аккаунт, выдаёт никнейм и одноразовый пароль.",
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
    <header className={styles.topBar}>
      <div className={styles.topBarRow}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>looney moon</span>
          <span className={styles.brandSub}>агентство · faq</span>
        </Link>
        <nav className={styles.topBarLinks}>
          <Link href="/">Главная</Link>
          <Link href="/contacts">Контакты</Link>
          <Link href="/register">Войти</Link>
        </nav>
      </div>

      <nav className={styles.mobileNav} aria-label="Мобильная навигация">
        <Link href="/">Главная</Link>
        <Link href="/contacts">Контакты</Link>
        <Link href="/register" className={styles.mobileNavCta}>Войти</Link>
      </nav>
    </header>

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

    <footer className={styles.footer}>
      <span>looney moon · {new Date().getFullYear()}</span>
      <div className={styles.footerLinks}>
        <Link href="/">Главная</Link>
        <Link href="/contacts">Контакты</Link>
        <Link href="/register">Войти</Link>
      </div>
    </footer>

    <nav className={styles.bottomNav} aria-label="Мобильная навигация">
      <Link href="/">Главная</Link>
      <Link href="/contacts">Контакты</Link>
      <Link href="/register" className={styles.bottomNavCta}>Войти</Link>
    </nav>
  </main>
);
