"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { Portrait, Seal } from "@/components/ui/bits";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { api } from "@/lib/api";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import { formatAudience, formatMoney } from "@/lib/format";
import { recordNo } from "@/lib/registry";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/components/landing/landing.module.css";

const rise = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.2, 0, 0, 1] as const },
};

const PROCESS = [
  {
    title: "Бриф",
    text: "Выбираете автора в указателе, описываете задачу и бюджет. Сделке присваивается номер.",
  },
  {
    title: "Оплата",
    text: "Переводите оплату по реквизитам платформы. Деньги удерживаются на счёте.",
  },
  {
    title: "Публикация",
    text: "Автор согласует и публикует интеграцию, отмечает выполнение в сделке.",
  },
  {
    title: "Подтверждение",
    text: "Проверяете публикацию и подтверждаете. Гонорар переводится автору.",
  },
];

const CLAUSES = [
  "Оплата удерживается на счёте платформы и не переходит автору до подтверждения публикации.",
  "Если публикация не вышла, оплата возвращается заказчику в полном объёме.",
  "Спорную ситуацию разбирает служба поддержки и принимает решение по сделке.",
  "История сделки и переписка с автором сохраняются на всём её протяжении.",
];

export default function MarketplaceHomePage() {
  const { data: catalog } = useQuery<CatalogResponse>({
    queryKey: ["featured-bloggers"],
    queryFn: () => api.getBloggers("?page_size=4&sort=audience_desc"),
    staleTime: 60_000,
  });

  const { data: categories = DEFAULT_MARKETPLACE_CATEGORIES } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: fetchMarketplaceCategories,
    staleTime: 10 * 60 * 1000,
  });

  const featured = catalog?.items ?? [];
  const total = catalog?.total;

  return (
    <MarketShell>
      {/* ── Hero (7/5) ── */}
      <section className={styles.hero}>
        <div className={shell.pageContainer}>
          <div className={styles.heroGrid}>
            <div>
              <span className={ui.brow}>Реестр рекламных размещений</span>
              <h1 className={styles.heroTitle}>
                <span className={styles.line}>
                  <span className={styles.lineInner} style={{ animationDelay: "0.05s" }}>
                    Реклама
                  </span>
                </span>
                <span className={styles.line}>
                  <span className={styles.lineInner} style={{ animationDelay: "0.11s" }}>
                    у блогеров, <em className={ui.displayEm}>достойная</em>
                  </span>
                </span>
                <span className={styles.line}>
                  <span className={styles.lineInner} style={{ animationDelay: "0.17s" }}>
                    вашего бренда
                  </span>
                </span>
              </h1>
              <p className={styles.heroLead}>
                Кураторский каталог авторов и безопасная сделка. Оплата удерживается
                платформой до тех пор, пока вы не подтвердите публикацию.
              </p>
              <div className={styles.heroActions}>
                <Link href="/catalog" className={ui.btnPrimary}>
                  Открыть каталог
                </Link>
                <Link href="/#how" className={ui.btnUnderline}>
                  Как это работает
                </Link>
              </div>
            </div>

            <motion.div
              className={styles.dealCard}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.2, 0, 0, 1] }}
            >
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
                  <div className={styles.dealSum}>420 000 ₽</div>
                </div>
              </div>
              <div className={styles.dealStamps}>
                <span className={ui.stampDone}>Бриф принят</span>
                <span className={ui.stampActive}>Оплата на счёте</span>
                <span className={ui.stampMuted}>Опубликовано</span>
                <span className={ui.stampMuted}>Подтверждено</span>
              </div>
              <p className={styles.dealFine}>
                Деньги на счёте платформы до подтверждения публикации заказчиком.
              </p>
            </motion.div>
          </div>

          {/* ── Строка фактов ── */}
          <div className={styles.facts}>
            <div className={styles.factsRow}>
              {total != null && (
                <span>
                  <b className={styles.factStrong}>{total}</b> авторов в каталоге
                </span>
              )}
              <span>
                <b className={styles.factStrong}>{categories.length}</b> ниш
              </span>
              <span>
                <b className={styles.factStrong}>100%</b> сделок под защитой
              </span>
              <span>ручная модерация</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Указатель ниш ── */}
      <section className={styles.section}>
        <div className={shell.pageContainer}>
          <motion.div className={styles.sectionHead} {...rise}>
            <span className={ui.brow}>Указатель</span>
            <h2 className={`${ui.h2} ${styles.sectionTitle}`}>Ниши и категории авторов</h2>
          </motion.div>
          <motion.div className={styles.indexGrid} {...rise}>
            {categories.map((cat, i) => (
              <Link
                key={cat.value}
                href={`/catalog?category=${encodeURIComponent(cat.value)}`}
                className={styles.indexItem}
              >
                <span className={styles.indexNum}>{recordNo(i)}</span>
                <span className={styles.indexLabel}>{cat.label}</span>
                <span className={styles.indexLeader} aria-hidden="true" />
                <span className={styles.indexArrow}>→</span>
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Подборка недели ── */}
      <section className={styles.section}>
        <div className={shell.pageContainer}>
          <motion.div className={styles.sectionHead} {...rise}>
            <span className={ui.brow}>Подборка недели</span>
            <h2 className={`${ui.h2} ${styles.sectionTitle}`}>Авторы, которым доверяют</h2>
          </motion.div>

          <div className={styles.featuredList}>
            {featured.length > 0
              ? featured.map((blogger, i) => (
                  <Link
                    key={blogger.id}
                    href={`/bloggers/${blogger.user_id}`}
                    className={styles.record}
                  >
                    <span className={styles.recordLeft}>
                      <span className={styles.recordNum}>{recordNo(i)}</span>
                      <Portrait
                        name={blogger.name}
                        photoUrl={blogger.photo_url}
                        record={recordNo(i)}
                        className={styles.recordPortrait}
                        monoSize={18}
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
                ))
              : Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className={styles.record} aria-hidden="true">
                    <span className={styles.recordLeft}>
                      <span className={styles.recordNum}>{recordNo(i)}</span>
                    </span>
                    <span className={ui.skeleton} style={{ height: 28, width: "60%" }} />
                    <span />
                    <span className={ui.skeleton} style={{ height: 18, width: 90 }} />
                    <span />
                  </div>
                ))}
          </div>

          <div className={styles.featuredFoot}>
            <Link href="/catalog" className={ui.btnUnderline}>
              Весь указатель авторов →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Процесс ── */}
      <section className={styles.section} id="how">
        <div className={shell.pageContainer}>
          <motion.div className={styles.sectionHead} {...rise}>
            <span className={ui.brow}>Как проходит сделка</span>
            <h2 className={`${ui.h2} ${styles.sectionTitle}`}>Четыре шага, зафиксированных в реестре</h2>
          </motion.div>
          <div className={styles.processGrid}>
            {PROCESS.map((step, i) => (
              <motion.div key={step.title} className={styles.step} {...rise} transition={{ ...rise.transition, delay: i * 0.05 }}>
                <div className={styles.stepNum}>{recordNo(i)}</div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Условия сделки (тёмная секция) ── */}
      <section className={styles.terms}>
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
                  <div key={text} className={styles.clause}>
                    <span className={styles.clauseNo}>1.{i + 1}</span>
                    <span className={styles.clauseText}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.termsAside}>
              <Seal size={150} />
              <p className={styles.sealNote}>Сделка под защитой платформы looney moon</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Финальный CTA ── */}
      <section className={styles.cta}>
        <div className={shell.pageContainer}>
          <div className={styles.ctaRow}>
            <h2 className={styles.ctaTitle}>Первая сделка занимает пару минут.</h2>
            <Link href="/catalog" className={ui.btnPrimary}>
              Открыть каталог
            </Link>
          </div>
        </div>
      </section>
    </MarketShell>
  );
}
