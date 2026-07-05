"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { Portrait, Seal } from "@/components/ui/bits";
import { CountUp, MaskLine, Marquee, Reveal, ScrollSpin, useParallax } from "@/components/ui/motion";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { api } from "@/lib/api";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import { formatAudience, formatMoney } from "@/lib/format";
import { dealNo, recordNo } from "@/lib/registry";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/components/landing/landing.module.css";

const EASE = [0.2, 0, 0, 1] as const;
const rub = (n: number) => `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₽`;

const PROCESS = [
  { title: "Бриф", text: "Выбираете автора в указателе, описываете задачу и бюджет — сделке присваивается номер." },
  { title: "Оплата", text: "Переводите оплату по реквизитам платформы. Деньги удерживаются на счёте." },
  { title: "Публикация", text: "Автор согласует и публикует интеграцию, отмечает выполнение в сделке." },
  { title: "Подтверждение", text: "Проверяете публикацию и подтверждаете — гонорар переходит автору." },
];

const CLAUSES = [
  "Оплата удерживается на счёте платформы и не переходит автору до подтверждения публикации.",
  "Если публикация не вышла, оплата возвращается заказчику в полном объёме.",
  "Спорную ситуацию разбирает служба поддержки и принимает решение по сделке.",
  "История сделки и переписка с автором сохраняются на всём её протяжении.",
];

const FALLBACK_TAPE = [
  { no: "LM-2026-0147", name: "Ирина Вологда", niche: "Тех-обзоры", sum: "420 000 ₽" },
  { no: "LM-2026-0132", name: "Пётр Ким", niche: "Финансы", sum: "180 000 ₽" },
  { no: "LM-2026-0121", name: "Даша Лунёва", niche: "Красота", sum: "95 000 ₽" },
  { no: "LM-2026-0119", name: "Марк Соло", niche: "Игры", sum: "240 000 ₽" },
  { no: "LM-2026-0108", name: "Аня Речь", niche: "Образование", sum: "70 000 ₽" },
];

const TAPE_STAMPS = ["Подтверждено", "Опубликовано", "Оплата на счёте", "Подтверждено", "Опубликовано"];

export default function MarketplaceHomePage() {
  const reduce = useReducedMotion();

  const { data: catalog } = useQuery<CatalogResponse>({
    queryKey: ["featured-bloggers"],
    queryFn: () => api.getBloggers("?page_size=5&sort=audience_desc"),
    staleTime: 60_000,
  });

  const { data: categories = DEFAULT_MARKETPLACE_CATEGORIES } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: fetchMarketplaceCategories,
    staleTime: 10 * 60 * 1000,
  });

  const featured = (catalog?.items ?? []).slice(0, 4);
  const total = catalog?.total;

  const tape =
    (catalog?.items ?? []).length > 0
      ? (catalog?.items ?? []).slice(0, 5).map((b, i) => ({
          no: dealNo(b.id, b.created_at),
          name: b.name,
          niche: categoryLabel(b.category),
          sum: formatMoney(b.average_price_kopeks),
          stamp: TAPE_STAMPS[i % TAPE_STAMPS.length],
        }))
      : FALLBACK_TAPE.map((t, i) => ({ ...t, stamp: TAPE_STAMPS[i % TAPE_STAMPS.length] }));

  // Параллакс карточки сделки
  const { ref: cardRef, y: cardY } = useParallax(48);

  // Прогресс-линия процесса по прокрутке
  const procRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: procRef, offset: ["start 78%", "end 55%"] });
  const ruleScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <MarketShell>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={shell.pageContainer}>
          <div className={styles.heroInner}>
            <div>
              <Reveal>
                <span className={ui.brow}>Реестр рекламных размещений</span>
              </Reveal>
              <h1 className={styles.heroTitle}>
                <MaskLine delay={0.05}>Реклама</MaskLine>
                <MaskLine delay={0.12}>
                  у блогеров, <em className={ui.displayEm}>достойная</em>
                </MaskLine>
                <MaskLine delay={0.19}>вашего бренда</MaskLine>
              </h1>
              <Reveal delay={0.24}>
                <p className={styles.heroLead}>
                  Кураторский каталог авторов и безопасная сделка. Оплата удерживается
                  платформой, пока вы не подтвердите публикацию.
                </p>
              </Reveal>
              <Reveal delay={0.3}>
                <div className={styles.heroActions}>
                  <Link href="/catalog" className={ui.btnPrimary}>
                    Открыть каталог
                  </Link>
                  <Link href="/#how" className={ui.btnUnderline}>
                    Как это работает
                  </Link>
                </div>
              </Reveal>
            </div>

            <motion.div
              ref={cardRef}
              className={styles.dealCard}
              style={{ y: cardY }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            >
              <span className={styles.dealCardCorner} aria-hidden="true" />
              <div className={styles.dealCardHead}>
                <span className={styles.dealCardNo}>№&nbsp;LM-2026-0147</span>
                <span className={styles.dealCardTag}>Реестр сделок</span>
              </div>
              <hr className={styles.dealCardRule} />
              <div className={styles.dealCardBody}>
                <div className={styles.dealAuthor}>
                  <span className={styles.dealMono} aria-hidden="true">
                    И
                  </span>
                  <span>
                    <span className={styles.dealName}>Ирина Вологда</span>
                    <span className={styles.dealNiche}>Тех-обзоры</span>
                  </span>
                </div>
                <div>
                  <div className={styles.dealSumLabel}>Сумма сделки</div>
                  <div className={styles.dealSum}>
                    <CountUp value={420000} format={rub} duration={1.4} />
                  </div>
                </div>
              </div>
              <div className={styles.dealStamps}>
                {[
                  { label: "Бриф принят", cls: ui.stampDone },
                  { label: "Оплата на счёте", cls: ui.stampActive },
                  { label: "Опубликовано", cls: ui.stampMuted },
                  { label: "Подтверждено", cls: ui.stampMuted },
                ].map((s, i) => (
                  <motion.span
                    key={s.label}
                    className={s.cls}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.12, ease: EASE }}
                  >
                    {s.label}
                  </motion.span>
                ))}
              </div>
              <p className={styles.dealFine}>
                Деньги на счёте платформы до подтверждения публикации заказчиком.
              </p>
            </motion.div>
          </div>
        </div>

        {/* ── Лента-реестр (тикер) ── */}
        <div className={`${styles.tape} ${"fullBleed"}`}>
          <Marquee durationSec={52} ariaLabel="Лента реестра сделок">
            {tape.map((t, i) => (
              <span key={`${t.no}-${i}`} className={styles.tapeItem}>
                <span className={styles.tapeNo}>№&nbsp;{t.no}</span>
                <span className={styles.tapeName}>{t.name}</span>
                <span className={styles.tapeNiche}>{t.niche}</span>
                <span className={styles.tapeStamp}>{t.stamp}</span>
                <span className={styles.tapeSum}>{t.sum}</span>
              </span>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ── Факты (count-up) ── */}
      <section className={styles.facts}>
        <div className={shell.pageContainer}>
          <Reveal className={styles.factsGrid} as="div">
            <div className={styles.fact}>
              <div className={styles.factNum}>
                {total != null ? <CountUp value={total} /> : "—"}
              </div>
              <div className={styles.factLabel}>авторов в каталоге</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factNum}>
                <CountUp value={categories.length} />
              </div>
              <div className={styles.factLabel}>ниш и категорий</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factNum}>
                <CountUp value={100} format={(n) => `${Math.round(n)}%`} />
              </div>
              <div className={styles.factLabel}>сделок под защитой платформы</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factNum}>
                <em>ручной</em>
              </div>
              <div className={styles.factLabel}>отбор каждого автора</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Указатель ниш ── */}
      <section className={styles.section}>
        <div className={shell.pageContainer}>
          <Reveal className={styles.sectionHead} as="div">
            <div className={styles.sectionHeadText}>
              <span className={ui.brow}>Указатель</span>
              <h2 className={styles.sectionTitle}>Ниши и категории авторов</h2>
            </div>
          </Reveal>
          <div className={styles.indexGrid}>
            {categories.map((cat, i) => (
              <Reveal key={cat.value} delay={Math.min(i * 0.03, 0.3)}>
                <Link href={`/catalog?category=${encodeURIComponent(cat.value)}`} className={styles.indexItem}>
                  <span className={styles.indexNum}>{recordNo(i)}</span>
                  <span className={styles.indexLabel}>{cat.label}</span>
                  <span className={styles.indexLeader} aria-hidden="true" />
                  <span className={styles.indexArrow}>→</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Подборка недели ── */}
      <section className={styles.section}>
        <div className={shell.pageContainer}>
          <Reveal className={styles.sectionHead} as="div">
            <div className={styles.sectionHeadText}>
              <span className={ui.brow}>Подборка недели</span>
              <h2 className={styles.sectionTitle}>Авторы, которым доверяют</h2>
            </div>
            <Link href="/catalog" className={ui.btnUnderline}>
              Весь указатель →
            </Link>
          </Reveal>

          <div className={styles.featuredList}>
            {featured.length > 0
              ? featured.map((blogger, i) => (
                  <Reveal key={blogger.id} delay={Math.min(i * 0.05, 0.25)}>
                    <Link href={`/bloggers/${blogger.user_id}`} className={styles.record}>
                      <span className={styles.recordLeft}>
                        <span className={styles.recordNum}>{recordNo(i)}</span>
                        <Portrait
                          name={blogger.name}
                          photoUrl={blogger.photo_url}
                          record={recordNo(i)}
                          className={styles.recordPortrait}
                          monoSize={20}
                        />
                      </span>
                      <span>
                        <span className={styles.recordName}>{blogger.name}</span>
                        <span className={styles.recordNiche}>{categoryLabel(blogger.category)}</span>
                      </span>
                      <span className={styles.recordReach}>
                        {formatAudience(blogger.subscriber_count)}
                        <span>охват</span>
                      </span>
                      <span className={styles.recordPrice}>
                        {formatMoney(blogger.average_price_kopeks)}
                        <span>интеграция от</span>
                      </span>
                      <span className={styles.recordArrow}>→</span>
                    </Link>
                  </Reveal>
                ))
              : Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className={styles.record} aria-hidden="true">
                    <span className={styles.recordLeft}>
                      <span className={styles.recordNum}>{recordNo(i)}</span>
                    </span>
                    <span className={ui.skeleton} style={{ height: 30, width: "58%" }} />
                    <span />
                    <span className={ui.skeleton} style={{ height: 18, width: 96 }} />
                    <span />
                  </div>
                ))}
          </div>

          <div className={styles.featuredFoot}>
            <Link href="/catalog" className={ui.btnUnderline}>
              Открыть весь каталог →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Процесс ── */}
      <section className={styles.process} id="how">
        <div className={shell.pageContainer}>
          <Reveal className={styles.sectionHead} as="div">
            <div className={styles.sectionHeadText}>
              <span className={ui.brow}>Как проходит сделка</span>
              <h2 className={styles.sectionTitle}>Четыре шага, зафиксированных в реестре</h2>
            </div>
          </Reveal>
          <div className={styles.processTrack} ref={procRef}>
            <motion.div
              className={styles.processRule}
              style={{ scaleX: reduce ? 1 : ruleScale }}
            />
            {PROCESS.map((step, i) => (
              <Reveal key={step.title} className={styles.processStep} as="div" delay={i * 0.06}>
                <div className={styles.processNum}>{recordNo(i)}</div>
                <h3 className={styles.processTitle}>{step.title}</h3>
                <p className={styles.processText}>{step.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Условия сделки (тёмная секция) ── */}
      <section className={`${styles.terms} ${"fullBleed"}`}>
        <div className={shell.pageContainer}>
          <span className={`${ui.brow} ${styles.termsBrow}`}>Выдержка из договора</span>
          <div className={styles.termsGrid}>
            <div>
              <h2 className={styles.termsTitle}>Условия сделки</h2>
              <p className={styles.termsLead}>
                Пункты, по которым проходит каждое размещение. Ими обеспечивается
                безопасность обеих сторон — заказчика и автора.
              </p>
              <div className={styles.clauseList}>
                {CLAUSES.map((text, i) => (
                  <Reveal key={text} className={styles.clause} as="div" delay={i * 0.05}>
                    <span className={styles.clauseNo}>1.{i + 1}</span>
                    <span className={styles.clauseText}>{text}</span>
                  </Reveal>
                ))}
              </div>
            </div>
            <div className={styles.termsAside}>
              <ScrollSpin turns={0.14}>
                <Seal size={168} />
              </ScrollSpin>
              <p className={styles.sealNote}>Сделка под защитой платформы looney moon</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Финальный CTA ── */}
      <section className={styles.cta}>
        <div className={shell.pageContainer}>
          <Reveal className={styles.ctaInner} as="div">
            <h2 className={styles.ctaTitle}>Первая сделка занимает пару минут.</h2>
            <Link href="/catalog" className={ui.btnPrimary}>
              Открыть каталог
            </Link>
          </Reveal>
        </div>
      </section>
    </MarketShell>
  );
}
