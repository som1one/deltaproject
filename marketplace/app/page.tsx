"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { CountUp, Reveal } from "@/components/ui/motion";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { api } from "@/lib/api";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import { formatAudience, formatMoney } from "@/lib/format";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";

/* ── Иконки ───────────────────────────────────────────────── */
const I = {
  check: (p = {}) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  shield: (p = {}) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  users: (p = {}) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </svg>
  ),
  chat: (p = {}) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  wallet: (p = {}) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" />
      <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  ),
  search: (p = {}) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  verified: (p = {}) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 1l2.4 2.1 3.2-.2.9 3 2.6 1.8-1.1 3 1.1 3-2.6 1.8-.9 3-3.2-.2L12 23l-2.4-2.1-3.2.2-.9-3L2.9 15 4 12 2.9 9l2.6-1.8.9-3 3.2.2z" />
      <path d="M10.5 14.6l-2-2L7 14l3.5 3.5L17 11l-1.5-1.5z" fill="#fff" />
    </svg>
  ),
};

const GRADS = [
  "linear-gradient(135deg,#6d5ef6,#a78bfa)",
  "linear-gradient(135deg,#2aa5f0,#22d3ee)",
  "linear-gradient(135deg,#12a150,#4ade80)",
  "linear-gradient(135deg,#f5a524,#fbbf5a)",
  "linear-gradient(135deg,#ec4899,#f472b6)",
];

const FALLBACK = [
  { name: "Ирина Вологда", niche: "Тех-обзоры", reach: "320K", price: "от 250 000 ₽", id: "a" },
  { name: "Даша Лунёва", niche: "Красота", reach: "88K", price: "от 40 000 ₽", id: "b" },
  { name: "Марк Соло", niche: "Игры", reach: "510K", price: "от 180 000 ₽", id: "c" },
];

const BENEFITS = [
  { icon: I.shield, color: "var(--green)", soft: "var(--green-soft)", title: "Безопасная сделка", text: "Деньги на счёте платформы, пока вы не подтвердите публикацию." },
  { icon: I.users, color: "var(--violet)", soft: "var(--violet-soft)", title: "Ручной отбор", text: "Каждый автор проходит модерацию — без ботов и накруток." },
  { icon: I.wallet, color: "var(--amber)", soft: "var(--amber-soft)", title: "Оплата за результат", text: "Комиссия удерживается только с успешной сделки." },
  { icon: I.chat, color: "var(--sky)", soft: "var(--sky-soft)", title: "Прямой диалог", text: "Бриф, сроки и формат — напрямую с автором внутри сделки." },
];

export default function HomePage() {
  const { data: catalog } = useQuery<CatalogResponse>({
    queryKey: ["featured-bloggers"],
    queryFn: () => api.getBloggers("?page_size=3&sort=audience_desc"),
    staleTime: 60_000,
  });
  const { data: categories = DEFAULT_MARKETPLACE_CATEGORIES } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: fetchMarketplaceCategories,
    staleTime: 10 * 60 * 1000,
  });

  const items = catalog?.items ?? [];
  const total = catalog?.total;

  const creators =
    items.length > 0
      ? items.slice(0, 3).map((b, i) => ({
          name: b.name,
          niche: categoryLabel(b.category),
          reach: formatAudience(b.subscriber_count),
          price: `от ${formatMoney(b.average_price_kopeks)}`,
          id: b.id,
          grad: GRADS[i % GRADS.length],
        }))
      : FALLBACK.map((c, i) => ({ ...c, grad: GRADS[i % GRADS.length] }));

  return (
    <MarketShell>
      {/* ── Hero ── */}
      <section className={s.hero}>
        <div className={s.heroBg} aria-hidden="true" />
        <div className={shell.pageContainer}>
          <Reveal className={s.heroInner} as="div">
            <span className={ui.brow}>Кураторский маркетплейс · безопасная сделка</span>
            <h1 className={s.heroTitle}>
              Реклама у блогеров <em>без риска</em>
            </h1>
            <p className={s.heroSub}>
              Кураторский каталог авторов и безопасная сделка: деньги остаются на счёте
              платформы, пока вы не подтвердите публикацию.
            </p>
            <div className={s.heroCta}>
              <Link href="/catalog" className={ui.btnPrimary}>
                Открыть каталог
              </Link>
              <Link href="/#how" className={ui.btnLine}>
                Как это работает
              </Link>
            </div>
            <div className={s.heroTrust}>
              <span>{I.check({ width: 15, height: 15 })} Без абонплаты</span>
              <span>{I.check({ width: 15, height: 15 })} Комиссия только с успешной сделки</span>
              <span>{I.check({ width: 15, height: 15 })} Ручная модерация</span>
            </div>
          </Reveal>

          {/* Продуктовый «скриншот» */}
          <Reveal className={s.heroShot} as="div" delay={0.12}>
            <div className={s.win}>
              <div className={s.winBar}>
                <span className={s.winDots}>
                  <span className={s.winDot} />
                  <span className={s.winDot} />
                  <span className={s.winDot} />
                </span>
                <span className={s.winUrl}>marketplace.looneymoon.ru/catalog</span>
              </div>
              <div className={s.winBody}>
                <div className={s.shotToolbar}>
                  <span className={s.shotSearch}>
                    {I.search()} Поиск по имени или нише
                  </span>
                  <span className={s.shotChipActive}>Все ниши</span>
                  <span className={s.shotChip}>Tech</span>
                  <span className={s.shotChip}>Красота</span>
                  <span className={s.shotChip}>Игры</span>
                </div>
                <div className={s.shotGrid}>
                  {creators.map((c) => (
                    <div key={c.id} className={s.creatorCard}>
                      <div className={s.caTop}>
                        <span className={s.caAvatar} style={{ background: c.grad }}>
                          {c.name.charAt(0)}
                        </span>
                        <span>
                          <span className={s.caName}>
                            {c.name.split(" ")[0]} {I.verified()}
                          </span>
                          <span className={s.caNiche}>{c.niche}</span>
                        </span>
                      </div>
                      <div className={s.caStats}>
                        <span className={s.caStat}>
                          <b>{c.reach}</b> охват
                        </span>
                        <span className={s.caStat}>
                          <b>4.9</b> рейтинг
                        </span>
                      </div>
                      <div className={s.caFoot}>
                        <span className={s.caPrice}>
                          {c.price.replace("от ", "")}
                          <span>интеграция</span>
                        </span>
                        <span className={s.caBtn}>Заказать</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={s.floatDeal}>
              <div className={s.floatHead}>
                <span className={s.floatNo}>№ LM-2026-0147</span>
                <span className={ui.stampActive}>Оплата на счёте</span>
              </div>
              <div className={s.floatSum}>420 000 ₽</div>
              <div className={s.floatLabel}>Деньги под защитой до подтверждения публикации</div>
              <div className={s.floatBar}>
                <span className={s.floatSegOn} />
                <span className={s.floatSegOn} />
                <span className={s.floatSeg} />
                <span className={s.floatSeg} />
              </div>
            </div>
          </Reveal>

          {/* Ниши как «логотипы» */}
          <div className={s.proof}>
            <div className={s.proofLabel}>Авторы в {categories.length} нишах — от техобзоров до красоты</div>
            <div className={s.proofRow}>
              {categories.slice(0, 6).map((c) => (
                <span key={c.value} className={s.proofItem}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Фича 1: эскроу ── */}
      <section className={shell.pageContainer}>
        <div className={s.feature}>
          <Reveal className={s.featureText} as="div">
            <span className={ui.iconTile} style={{ background: "var(--green)" }}>
              {I.shield()}
            </span>
            <h2 className={s.featureTitle}>Деньги под защитой до результата</h2>
            <p className={s.featureLead}>
              Оплата хранится на счёте платформы и переходит автору только после того,
              как вы подтвердите публикацию. Никакой предоплаты «в никуда».
            </p>
            <ul className={s.featureList}>
              {["Эскроу на каждую сделку", "Полный возврат, если публикация не вышла", "Арбитраж поддержки в спорных ситуациях"].map((t) => (
                <li key={t} className={s.featureLi}>
                  {I.check()} {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className={s.featureVisual} as="div" delay={0.1}>
            <div className={s.mockCard}>
              <div className={s.mockHead}>
                <span className={s.mockNo}>Сделка № LM-2026-0147</span>
                <span className={ui.stampActive}>В работе</span>
              </div>
              <div className={s.mockSumLabel}>Сумма сделки</div>
              <div className={s.mockSum}>420 000 ₽</div>
              <div className={s.steps}>
                {[
                  { t: "Бриф согласован", s: "12 июня", done: true },
                  { t: "Оплата на счёте платформы", s: "12 июня", done: true },
                  { t: "Публикация интеграции", s: "ожидается", now: true },
                  { t: "Подтверждение и выплата", s: "", done: false },
                ].map((st) => (
                  <div key={st.t} className={s.step}>
                    <span className={st.done ? s.stepDotOn : st.now ? s.stepDotNow : s.stepDot}>
                      {st.done ? I.check({ width: 12, height: 12 }) : null}
                    </span>
                    <span className={`${s.stepText} ${st.done ? s.done : ""}`}>
                      {st.t}
                      {st.s ? <small>{st.s}</small> : null}
                    </span>
                  </div>
                ))}
              </div>
              <div className={s.moneyRow}>
                {I.shield({ width: 16, height: 16 })} Деньги: на счёте платформы
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Фича 2: курация ── */}
      <section className={shell.pageContainer}>
        <div className={`${s.feature} ${s.featureReverse}`}>
          <Reveal className={s.featureText} as="div">
            <span className={ui.iconTile} style={{ background: "var(--violet)" }}>
              {I.users()}
            </span>
            <h2 className={s.featureTitle}>Только проверенные авторы</h2>
            <p className={s.featureLead}>
              Каждый профиль проходит ручную модерацию: реальная аудитория, честная
              статистика и адекватные цены — без ботов и накруток.
            </p>
            <ul className={s.featureList}>
              {["Ручная проверка каждого автора", "Прозрачная статистика охватов", `${categories.length} ниш и категорий`].map((t) => (
                <li key={t} className={s.featureLi}>
                  {I.check()} {t}
                </li>
              ))}
            </ul>
            <Link href="/catalog" className={ui.btnUnderline} style={{ marginTop: 22 }}>
              Открыть каталог →
            </Link>
          </Reveal>
          <Reveal className={s.featureVisual} as="div" delay={0.1}>
            <div className={s.mockCard}>
              {creators.map((c, i) => (
                <div key={c.id} className={s.step} style={{ borderBottom: i < creators.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <span className={s.caAvatar} style={{ background: c.grad, width: 40, height: 40 }}>
                    {c.name.charAt(0)}
                  </span>
                  <span className={s.stepText} style={{ flex: 1 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {c.name} <span style={{ color: "var(--green)", display: "inline-flex" }}>{I.verified()}</span>
                    </span>
                    <small>{c.niche} · {c.reach} охват</small>
                  </span>
                  <span className={s.caPrice} style={{ fontSize: 14 }}>{c.price.replace("от ", "")}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Фича 3: диалог ── */}
      <section className={shell.pageContainer}>
        <div className={s.feature}>
          <Reveal className={s.featureText} as="div">
            <span className={ui.iconTile} style={{ background: "var(--sky)" }}>
              {I.chat()}
            </span>
            <h2 className={s.featureTitle}>Прямой диалог с автором</h2>
            <p className={s.featureLead}>
              Обсуждайте бриф, сроки и формат внутри сделки — без посредников и потери
              контекста. Вся история сохраняется.
            </p>
            <ul className={s.featureList}>
              {["Переписка внутри сделки", "История и файлы сохраняются", "Уведомления о смене статуса"].map((t) => (
                <li key={t} className={s.featureLi}>
                  {I.check()} {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className={s.featureVisual} as="div" delay={0.1}>
            <div className={s.mockCard}>
              <div className={s.chat}>
                <div className={s.bubbleIn}>Здравствуйте! Хотим обсудить интеграцию продукта в ваш обзор.</div>
                <span className={s.chatMeta}>Ирина · автор</span>
                <div className={s.bubbleOut}>Добрый день! Пришлю бриф и сроки. Формат — 60 сек в основном ролике.</div>
                <div className={s.bubbleIn}>Отлично, беру. Оплата — через безопасную сделку платформы?</div>
                <div className={s.bubbleOut}>Да, деньги на счёте платформы до выхода публикации 👌</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Преимущества ── */}
      <section className={`${s.section} ${shell.pageContainer}`} id="how">
        <div className={s.head}>
          <span className={ui.brow}>Как это работает</span>
          <h2 className={`${ui.h2} ${s.headTitle}`}>Всё, что нужно для спокойной сделки</h2>
          <p className={s.headSub}>Выбрали автора, согласовали бриф, оплатили — деньги под защитой до результата.</p>
        </div>
        <div className={s.benefits}>
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} className={`${ui.card} ${s.benefitCard}`} as="div" delay={i * 0.06}>
              <span className={ui.iconTile} style={{ background: b.soft, color: b.color }}>
                {b.icon()}
              </span>
              <h3 className={s.benefitTitle}>{b.title}</h3>
              <p className={s.benefitText}>{b.text}</p>
            </Reveal>
          ))}
        </div>

        {/* Статистика */}
        <div className={s.stats}>
          <div className={s.statsGrid}>
            <div>
              <div className={s.statNum}>{total != null ? <CountUp value={total} /> : "—"}</div>
              <div className={s.statLabel}>авторов в каталоге</div>
            </div>
            <div>
              <div className={s.statNum}>
                <CountUp value={categories.length} />
              </div>
              <div className={s.statLabel}>ниш и категорий</div>
            </div>
            <div>
              <div className={s.statNum}>
                <CountUp value={100} format={(n) => `${Math.round(n)}%`} />
              </div>
              <div className={s.statLabel}>сделок под защитой</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Тёмный CTA ── */}
      <section className={`${s.cta} ${shell.pageContainer}`}>
        <div className={s.ctaInner}>
          <div className={s.ctaGlow} aria-hidden="true" />
          <h2 className={s.ctaTitle}>Первая сделка — за пару минут</h2>
          <p className={s.ctaSub}>
            Откройте каталог, выберите автора и оформите безопасную сделку уже сегодня.
          </p>
          <div className={s.ctaBtns}>
            <Link href="/catalog" className={s.ctaPrimary}>
              Открыть каталог
            </Link>
            <Link href="/auth/login?role=blogger" className={s.ctaGhost}>
              Я блогер
            </Link>
          </div>
        </div>
      </section>
    </MarketShell>
  );
}
