"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Crown, Handshake, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCardSkeleton, BloggerCardView } from "@/components/catalog/blogger-card";
import { api } from "@/lib/api";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "@/components/landing/landing.module.css";

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.65, ease: [0.2, 0.6, 0.2, 1] as const },
};

const TRUST_CARDS = [
  {
    icon: <ShieldCheck size={20} strokeWidth={1.6} />,
    title: "Безопасная сделка",
    text: "Оплата хранится на счёте платформы до подтверждения публикации.",
  },
  {
    icon: <Crown size={20} strokeWidth={1.6} />,
    title: "Только избранные",
    text: "Каждый профиль проходит ручную модерацию перед публикацией.",
  },
  {
    icon: <Handshake size={20} strokeWidth={1.6} />,
    title: "Прямой диалог",
    text: "Бриф, сроки и детали — напрямую с автором внутри заказа.",
  },
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
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={shell.pageContainer}>
          <div className={styles.heroInner}>
            <div>
              <motion.span className={ui.eyebrow} {...fadeUp}>
                Кураторский маркетплейс
              </motion.span>
              <motion.h1 className={ui.displayTitle} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.06 }}>
                Реклама у блогеров, <em>достойная</em> вашего бренда
              </motion.h1>
              <motion.p className={ui.lead} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }}>
                Избранные авторы, проверенная аудитория и безопасная сделка:
                деньги остаются под защитой платформы, пока вы не подтвердите результат.
              </motion.p>
              <motion.div className={styles.heroActions} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.18 }}>
                <Link href="/catalog" className={ui.btnPrimary}>
                  Открыть каталог
                </Link>
                <Link href="/auth/register" className={ui.btnSecondary}>
                  Стать заказчиком
                </Link>
              </motion.div>
              <motion.div className={styles.heroStats} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.24 }}>
                <div>
                  <div className={ui.statValue}>{total != null ? `${total}` : "—"}</div>
                  <div className={ui.statLabel}>авторов в каталоге</div>
                </div>
                <div>
                  <div className={ui.statValue}>{categories.length}</div>
                  <div className={ui.statLabel}>ниш и категорий</div>
                </div>
                <div>
                  <div className={ui.statValue}>100%</div>
                  <div className={ui.statLabel}>сделок под защитой</div>
                </div>
              </motion.div>
            </div>

            <motion.div
              className={styles.heroAside}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.85, delay: 0.15, ease: [0.2, 0.6, 0.2, 1] }}
            >
              <div className={styles.heroVisual}>
                <img
                  src="/img/hero-interior.jpg"
                  alt="Премиальный интерьер"
                  className={styles.heroImg}
                  fetchPriority="high"
                />
                <div className={styles.heroVisualScrim} aria-hidden="true" />
                <div className={styles.heroSeal}>
                  <span className={styles.heroSealIcon}>
                    <ShieldCheck size={18} strokeWidth={1.6} />
                  </span>
                  <span>
                    <span className={styles.heroSealTitle}>Сделка под защитой</span>
                    <span className={styles.heroSealText}>
                      Оплата хранится на платформе до результата
                    </span>
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Trust row ── */}
      <section className={styles.trustSection}>
        <div className={shell.pageContainer}>
          <div className={styles.trustRow}>
            {TRUST_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                className={styles.heroCard}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.2, 0.6, 0.2, 1] }}
              >
                <span className={styles.heroCardIcon}>{card.icon}</span>
                <span>
                  <p className={styles.heroCardTitle}>{card.title}</p>
                  <p className={styles.heroCardText}>{card.text}</p>
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Categories strip ── */}
      <section className={styles.stripSection}>
        <div className={shell.pageContainer}>
          <motion.div className={styles.strip} {...fadeUp}>
            {categories.map((cat) => (
              <Link key={cat.value} href={`/catalog?category=${encodeURIComponent(cat.value)}`} className={ui.chip}>
                {cat.label}
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Featured bloggers ── */}
      <section className={ui.section}>
        <div className={shell.pageContainer}>
          <div className={ui.sectionHead}>
            <div>
              <span className={ui.eyebrow}>Подборка недели</span>
              <h2 className={ui.sectionTitle}>Голоса, которым доверяют</h2>
            </div>
            <Link href="/catalog" className={ui.btnGhost}>
              Смотреть всех →
            </Link>
          </div>
          <div className={styles.bloggersGrid}>
            {featured.length > 0
              ? featured.map((blogger, index) => (
                  <BloggerCardView key={blogger.id} blogger={blogger} index={index} />
                ))
              : Array.from({ length: 4 }, (_, i) => <BloggerCardSkeleton key={i} />)}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className={ui.section} id="how">
        <div className={shell.pageContainer}>
          <div className={ui.sectionHead}>
            <div>
              <span className={ui.eyebrow}>Процесс</span>
              <h2 className={ui.sectionTitle}>Четыре шага до публикации</h2>
            </div>
          </div>
          <div className={styles.howGrid}>
            {[
              {
                title: "Выберите автора",
                text: "Фильтры по нише, охвату и бюджету. Портфолио и статистика — в каждом профиле.",
              },
              {
                title: "Опишите задачу",
                text: "Создайте заказ с брифом и суммой. Блогер увидит его сразу после оплаты.",
              },
              {
                title: "Оплатите безопасно",
                text: "Переводом по реквизитам платформы. Деньги заморожены до результата.",
              },
              {
                title: "Подтвердите результат",
                text: "Публикация вышла — вы подтверждаете, автор получает гонорар.",
              },
            ].map((step) => (
              <motion.div key={step.title} className={styles.howCard} {...fadeUp}>
                <div className={styles.howNum} aria-hidden="true" />
                <h3 className={styles.howTitle}>{step.title}</h3>
                <p className={styles.howText}>{step.text}</p>
              </motion.div>
            ))}
          </div>

          {/* ── Guarantee band ── */}
          <motion.div className={styles.band} {...fadeUp}>
            <div className={styles.bandVisual}>
              <img
                src="/img/luxury-suite.jpg"
                alt="Премиальный интерьер"
                className={styles.bandImg}
                loading="lazy"
              />
            </div>
            <div className={styles.bandBody}>
              <span className={ui.eyebrow}>Гарантии</span>
              <h2 className={ui.sectionTitle}>Сделка под защитой платформы</h2>
              <p className={ui.lead}>
                Мы удерживаем оплату на стороне платформы и переводим её автору
                только после вашего подтверждения. Спорные ситуации решает служба поддержки.
              </p>
              <ul className={styles.bandList}>
                {[
                  "Деньги не уходят блогеру до подтверждения результата",
                  "Возврат средств, если публикация не состоялась",
                  "Арбитраж поддержки в спорных ситуациях",
                  "История заказа и переписки сохраняется",
                ].map((item) => (
                  <li key={item} className={styles.bandItem}>
                    <span className={styles.bandCheck}>
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* ── Final CTA ── */}
          <motion.div className={styles.finalCta} {...fadeUp}>
            <span className={ui.eyebrow} style={{ justifyContent: "center" }}>
              Начните сегодня
            </span>
            <h2 className={ui.sectionTitle}>Первый заказ — за пару минут</h2>
            <div className={styles.finalActions}>
              <Link href="/catalog" className={ui.btnPrimary}>
                Выбрать блогера
              </Link>
              <Link href="/auth/login?role=blogger" className={ui.btnSecondary}>
                Я блогер — войти
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </MarketShell>
  );
}
