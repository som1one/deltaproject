"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { categoryLabel } from "@/components/marketplace/stitch-marketplace";
import { SiteFooter } from "@/components/common/site-footer";
import { appConfig } from "@/lib/config";
import styles from "@/components/marketing/marketplace-landing.module.css";

type FeaturedBlogger = {
  id: string;
  name: string;
  category?: string;
  profile_image_url?: string | null;
};

const fallbackFeaturedBloggers: FeaturedBlogger[] = [
  {
    id: "featured-lina",
    name: "Лина Мороз",
    category: "lifestyle",
    profile_image_url: "/images/placeholder-portrait.jpg",
  },
  {
    id: "featured-maya",
    name: "Майя Север",
    category: "beauty",
    profile_image_url: "/images/placeholder-portrait.jpg",
  },
  {
    id: "featured-ivan",
    name: "Иван Крафт",
    category: "tech",
    profile_image_url: "/images/placeholder-portrait.jpg",
  },
  {
    id: "featured-nika",
    name: "Ника Ветер",
    category: "travel",
    profile_image_url: "/images/placeholder-portrait.jpg",
  },
];

const roles = [
  {
    title: "Рекламодателям",
    text: "Каталог проверенных блогеров с фильтрами по нишам, аудитории и цене. Быстрый бриф и прозрачная статистика.",
    href: "/marketplace",
    cta: "Открыть каталог",
  },
  {
    title: "Блогерам",
    text: "Заявки на интеграции, управление расписанием и гарантированные выплаты в едином личном кабинете.",
    href: "/blogger/login",
    cta: "Кабинет автора",
  },
];

const flow = ["Выбор автора", "Бриф и заказ", "Интеграция", "Выплаты"];

export const LandingPage = () => {
  return (
    <main className={styles.page}>
      <section className={`${styles.hero} fadeIn`}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Рекламный маркетплейс</p>
          <h1 className={styles.title}>Реклама у блогеров напрямую</h1>
          <p className={styles.lead}>
            Прямой доступ к кураторской базе проверенных креаторов. Заказывайте нативные интеграции, согласовывайте брифы и проводите безопасные сделки в едином личном кабинете без скрытых комиссий.
          </p>
          <div className={styles.actions}>
            <Link href="/marketplace" className={styles.primaryAction}>
              Попробовать <span aria-hidden="true" style={{ marginLeft: 8 }}>→</span>
            </Link>
          </div>
        </div>
        <div className={styles.heroImageWrapper}>
          <img src="/images/hero-editorial.png" alt="High fashion editorial model" />
        </div>
      </section>

      <FeaturedCreators />

      <section className={styles.section} id="about">
        <div className={styles.splitSection}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Как это устроено</p>
            <h2 className={styles.sectionTitle}>Встреча брендов и креаторов</h2>
            <p className={styles.sectionLead}>
              Мы убрали посредников. Рекламодатели получают каталог с фильтрами и статистикой, а блогеры — гарантированную оплату и удобное управление расписанием.
            </p>
          </div>
          <div className={styles.stackGrid}>
            {roles.map((role) => (
              <div key={role.title}>
                <Link href={role.href} className={styles.card}>
                  <h3 className={styles.cardTitle}>{role.title}</h3>
                  <p className={styles.cardText}>{role.text}</p>
                  <span className={styles.cardCta}>{role.cta}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>


      <SiteFooter />
    </main>
  );
};

function FeaturedCreators() {
  const { data, isLoading } = useQuery<{ items: FeaturedBlogger[] }>({
    queryKey: ["featured-bloggers"],
    placeholderData: { items: fallbackFeaturedBloggers },
    retry: false,
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/bloggers?page_size=4&sort=audience_desc`);
      if (!response.ok) throw new Error("Failed to fetch featured creators");
      return response.json();
    },
  });
  const featuredBloggers = data?.items?.length ? data.items : fallbackFeaturedBloggers;

  return (
    <section className={styles.featuredSection}>
      <div className={styles.featuredHeader}>
        <div>
          <p className={styles.eyebrow}>Резиденты платформы</p>
          <h2 className={styles.sectionTitle}>Кураторская подборка</h2>
        </div>
      </div>
      
      <div className={styles.featuredGrid}>
        {isLoading ? (
          <>
            <div className={styles.featuredSkeleton} />
            <div className={styles.featuredSkeleton} />
            <div className={styles.featuredSkeleton} />
            <div className={styles.featuredSkeleton} />
          </>
        ) : (
          featuredBloggers.map((blogger) => (
            <Link href={`/marketplace?q=${blogger.name}`} key={blogger.id} className={styles.featuredCard}>
              <div className={styles.featuredImageWrapper}>
                <img src={blogger.profile_image_url || "/images/placeholder-portrait.jpg"} alt={blogger.name} />
              </div>
              <div className={styles.featuredCardInfo}>
                <h3 className={styles.featuredCardTitle}>{blogger.name}</h3>
                <span className={styles.featuredCardCategory}>{categoryLabel(blogger.category)}</span>
              </div>
            </Link>
          ))
        )}
      </div>
      
      <div className={styles.featuredFooter}>
        <Link href="/marketplace" className={styles.secondaryAction}>
          Перейти в каталог <span aria-hidden="true" style={{ marginLeft: 8 }}>→</span>
        </Link>
      </div>
    </section>
  );
}
