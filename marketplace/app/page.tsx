"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, Star, TrendingUp, Users } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { CountUp, Reveal } from "@/components/ui/motion";
import { api } from "@/lib/api";
import { resolveUploadUrl } from "@/lib/config";
import { formatAudience, formatMoney } from "@/lib/format";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import type { BloggerCard, CatalogResponse, HeroConfigResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";

/* ── Иконки (duotone, в стиле flaticon: заливка + вырезы) ─── */
type IconProps = { size?: number; width?: number; height?: number };
const dim = (p: IconProps, d: number) => p.size ?? p.width ?? d;

const I = {
  /* плоская галочка — только для шагов-точек в мокапе сделки */
  check: (p: IconProps = {}) => <Check size={dim(p, 18)} strokeWidth={2.6} />,

  /* галочка-бейдж: круг с ореолом и вырезанной галкой */
  checkBadge: (p: IconProps = {}) => (
    <svg width={dim(p, 18)} height={dim(p, 18)} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle opacity=".22" cx="12" cy="12" r="10.6" />
      <path
        fillRule="evenodd"
        d="M12 4.3a7.7 7.7 0 1 1 0 15.4 7.7 7.7 0 0 1 0-15.4zm3.94 5.6a1.05 1.05 0 0 0-1.48-1.49l-3.28 3.27-1.64-1.63a1.05 1.05 0 1 0-1.48 1.49l2.38 2.37c.41.41 1.07.41 1.48 0z"
      />
    </svg>
  ),

  /* flaticon: shield-check */
  shield: (p: IconProps = {}) => (
    <svg width={dim(p, 24)} height={dim(p, 24)} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.581,2.14,12.316.051a1,1,0,0,0-.632,0L5.419,2.14A4.993,4.993,0,0,0,2,6.883V12c0,7.563,9.2,11.74,9.594,11.914a1,1,0,0,0,.812,0C12.8,23.74,22,19.563,22,12V6.883A4.993,4.993,0,0,0,18.581,2.14ZM20,12c0,5.455-6.319,9.033-8,9.889-1.683-.853-8-4.42-8-9.889V6.883A3,3,0,0,1,6.052,4.037L12,2.054l5.948,1.983A3,3,0,0,1,20,6.883Z" />
      <path d="M15.3,8.3,11.112,12.5,8.868,10.16a1,1,0,1,0-1.441,1.386l2.306,2.4a1.872,1.872,0,0,0,1.345.6h.033a1.873,1.873,0,0,0,1.335-.553l4.272-4.272A1,1,0,0,0,15.3,8.3Z" />
    </svg>
  ),

  /* flaticon: user-trust */
  users: (p: IconProps = {}) => (
    <svg width={dim(p, 24)} height={dim(p, 24)} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17,10c-3.86,0-7,3.141-7,7s3.14,7,7,7,7-3.141,7-7-3.14-7-7-7Zm0,12c-2.757,0-5-2.243-5-5s2.243-5,5-5,5,2.243,5,5-2.243,5-5,5Zm3.992-5.882l-3.457,3.399c-.308,.309-.727,.482-1.172,.482s-.864-.173-1.179-.488l-1.846-1.789,1.393-1.436,1.63,1.58,3.229-3.175,1.402,1.426Zm-12.992-4.118c3.309,0,6-2.691,6-6S11.309,0,8,0,2,2.691,2,6s2.691,6,6,6Zm0-10c2.206,0,4,1.794,4,4s-1.794,4-4,4-4-1.794-4-4,1.794-4,4-4Zm.523,12c-.226,.638-.388,1.305-.464,2h-3.059c-1.654,0-3,1.346-3,3v5H0v-5c0-2.757,2.243-5,5-5h3.523Z" />
    </svg>
  ),

  /* flaticon: comment-dots */
  chat: (p: IconProps = {}) => (
    <svg width={dim(p, 24)} height={dim(p, 24)} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12h12v-12C24,5.383,18.617,0,12,0Zm10,22h-10c-5.514,0-10-4.486-10-10S6.486,2,12,2s10,4.486,10,10v10Zm-8.5-10c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Zm5,0c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Zm-10,0c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z" />
    </svg>
  ),

  /* flaticon: wallet-money */
  wallet: (p: IconProps = {}) => (
    <svg width={dim(p, 24)} height={dim(p, 24)} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m20 16c0 .828-.672 1.5-1.5 1.5s-1.5-.672-1.5-1.5.672-1.5 1.5-1.5 1.5.672 1.5 1.5zm-10.5-13c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm10 3c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5zm4.5-2v17c0 1.654-1.346 3-3 3h-16c-2.757 0-5-2.243-5-5v-10c0-.868.226-1.711.643-2.452.272-.486.625-.923 1.05-1.298.414-.365 1.046-.327 1.412.088.365.414.326 1.046-.088 1.412-.089.079-.173.162-.251.25.563.627 1.376 1 2.235 1v-4c-.001-2.206 1.793-4 3.999-4h11c2.206 0 4 1.794 4 4zm-17 4h4.5c0-1.657 1.343-3 3-3s3 1.343 3 3h3.5c.352 0 .686.072 1 .184v-4.184c0-1.103-.897-2-2-2h-11c-1.103 0-2 .897-2 2zm15 3c0-.551-.448-1-1-1h-16c-1.096 0-2.146-.363-3-1.003v10.003c0 1.654 1.346 3 3 3h16c.552 0 1-.449 1-1z" />
    </svg>
  ),

  search: (p: IconProps = {}) => <Search size={dim(p, 16)} strokeWidth={2} />,

  verified: (p: IconProps = {}) => (
    <svg width={dim(p, 15)} height={p.height ?? dim(p, 15)} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M8 12.4l2.6 2.6 5-5.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const HERO_CHIPS = [
  { key: "all", label: "Все ниши" },
  { key: "tech", label: "Tech" },
  { key: "beauty", label: "Красота" },
  { key: "games", label: "Игры" },
];

const DEMO = [
  { id: "d1", name: "Ирина", niche: "Тех-обзоры", key: "tech", reach: "320K", price: "250 000 ₽", grad: "linear-gradient(135deg,#6d5ef6,#a78bfa)", color: "#6d5ef6", er: "6.2%", bars: [40, 55, 45, 68, 60, 88], platforms: ["yt", "tg", "ig"] },
  { id: "d2", name: "Даша", niche: "Красота", key: "beauty", reach: "88K", price: "40 000 ₽", grad: "linear-gradient(135deg,#ec4899,#f472b6)", color: "#ec4899", er: "8.1%", bars: [32, 46, 58, 50, 66, 82], platforms: ["ig", "tt"] },
  { id: "d3", name: "Марк", niche: "Игры", key: "games", reach: "510K", price: "180 000 ₽", grad: "linear-gradient(135deg,#12a150,#4ade80)", color: "#12a150", er: "5.4%", bars: [48, 42, 58, 52, 74, 92], platforms: ["yt", "tt", "tg"] },
  { id: "d4", name: "Олег", niche: "Технологии", key: "tech", reach: "140K", price: "90 000 ₽", grad: "linear-gradient(135deg,#f5a524,#fbbf5a)", color: "#f5a524", er: "7.0%", bars: [30, 40, 52, 48, 60, 74], platforms: ["yt", "tg"] },
  { id: "d5", name: "Вика", niche: "Бьюти", key: "beauty", reach: "260K", price: "120 000 ₽", grad: "linear-gradient(135deg,#8b5cf6,#c084fc)", color: "#8b5cf6", er: "9.3%", bars: [38, 50, 44, 62, 70, 90], platforms: ["ig", "tt", "tg"] },
  { id: "d6", name: "Тимур", niche: "Гейминг", key: "games", reach: "430K", price: "160 000 ₽", grad: "linear-gradient(135deg,#0f9d76,#34d399)", color: "#0f9d76", er: "6.8%", bars: [44, 38, 56, 50, 68, 84], platforms: ["yt", "tt"] },
];

/* ── Единая модель карточки витрины (демо ИЛИ реальные авторы) ─── */
type HeroVM = {
  id: string;
  name: string;
  niche: string;
  key: string;
  reach: string;
  price: string;
  er: string;
  rating: string;
  grad: string;
  color: string;
  photoUrl?: string | null;
  bars: number[];
  platforms: string[];
};

const HERO_AVATARS = [
  { grad: "linear-gradient(135deg,#6d5ef6,#a78bfa)", color: "#6d5ef6" },
  { grad: "linear-gradient(135deg,#ec4899,#f472b6)", color: "#ec4899" },
  { grad: "linear-gradient(135deg,#12a150,#4ade80)", color: "#12a150" },
  { grad: "linear-gradient(135deg,#f5a524,#fbbf5a)", color: "#f5a524" },
  { grad: "linear-gradient(135deg,#8b5cf6,#c084fc)", color: "#8b5cf6" },
  { grad: "linear-gradient(135deg,#2aa5f0,#22d3ee)", color: "#2aa5f0" },
];

const hashSeed = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
};

// Столбики — декоративные, но детерминированные (стабильны для автора).
const heroBars = (seed: string): number[] => {
  const h = hashSeed(seed);
  return Array.from({ length: 6 }, (_, i) =>
    Math.min(96, 34 + ((h >> (i * 3)) % 9) * 7 + (i === 5 ? 14 : 0)),
  );
};

const demoToHeroVM = (d: (typeof DEMO)[number]): HeroVM => ({
  ...d,
  rating: "4.9",
  photoUrl: undefined,
});

const bloggerToHeroVM = (a: BloggerCard, label: string): HeroVM => {
  const av = HERO_AVATARS[hashSeed(a.id) % HERO_AVATARS.length];
  return {
    id: a.id,
    name: a.name,
    niche: label,
    key: a.category ?? "other",
    reach: formatAudience(a.subscriber_count),
    price: formatMoney(a.average_price_kopeks),
    er: a.engagement_rate != null ? `${a.engagement_rate}%` : "—",
    rating: a.rating != null ? a.rating.toFixed(1) : "—",
    grad: av.grad,
    color: av.color,
    // Загруженные фото приходят относительным /uploads/... — дополняем до URL API
    photoUrl: resolveUploadUrl(a.photo_url),
    bars: heroBars(a.id),
    platforms: a.platforms ?? [],
  };
};

/** Аватар карточки витрины: фото автора, при ошибке загрузки — инициал на градиенте. */
const HeroAvatar = ({ card }: { card: HeroVM }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={s.caAvatar} style={{ background: card.grad }}>
      {card.photoUrl && !failed ? (
        <img
          src={card.photoUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
          onError={() => setFailed(true)}
        />
      ) : (
        card.name.charAt(0)
      )}
    </span>
  );
};

const BENEFITS = [
  { icon: I.shield, color: "var(--green)", soft: "var(--green-soft)", title: "Безопасная сделка", text: "Деньги на счёте платформы, пока вы не подтвердите публикацию." },
  { icon: I.users, color: "var(--violet)", soft: "var(--violet-soft)", title: "Ручной отбор", text: "Каждый автор проходит модерацию — без ботов и накруток." },
  { icon: I.wallet, color: "var(--amber)", soft: "var(--amber-soft)", title: "Оплата за результат", text: "Комиссия удерживается только с успешной сделки." },
  { icon: I.chat, color: "var(--pink)", soft: "var(--pink-soft)", title: "Прямой диалог", text: "Бриф, сроки и формат — напрямую с автором внутри сделки." },
];

const PLAT: Record<string, { cls: string; name: string; url: string; icon: ReactNode }> = {
  yt: {
    cls: s.platYt,
    name: "YouTube",
    url: "https://youtube.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" />
      </svg>
    ),
  },
  tg: {
    cls: s.platTg,
    name: "Telegram",
    url: "https://telegram.org",
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
    ),
  },
  ig: {
    cls: s.platIg,
    name: "Instagram",
    url: "https://instagram.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M12 2c2.72 0 3.06.01 4.12.06 1.07.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.89 1.11 1.15 1.77.25.64.42 1.36.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.07-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77c-.55.55-1.11.89-1.77 1.15-.64.25-1.36.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.07-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.36-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.07.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77.55-.55 1.11-.89 1.77-1.15.64-.25 1.36-.42 2.43-.47C8.94 2.01 9.28 2 12 2zm0 1.8c-2.67 0-2.99.01-4.04.06-.98.04-1.51.21-1.86.35-.47.18-.8.4-1.15.75-.35.35-.57.68-.75 1.15-.14.35-.31.88-.35 1.86-.05 1.05-.06 1.37-.06 4.04s.01 2.99.06 4.04c.04.98.21 1.51.35 1.86.18.47.4.8.75 1.15.35.35.68.57 1.15.75.35.14.88.31 1.86.35 1.05.05 1.37.06 4.04.06s2.99-.01 4.04-.06c.98-.04 1.51-.21 1.86-.35.47-.18.8-.4 1.15-.75.35-.35.57-.68.75-1.15.14-.35.31-.88.35-1.86.05-1.05.06-1.37.06-4.04s-.01-2.99-.06-4.04c-.04-.98-.21-1.51-.35-1.86a3.1 3.1 0 0 0-.75-1.15 3.1 3.1 0 0 0-1.15-.75c-.35-.14-.88-.31-1.86-.35-1.05-.05-1.37-.06-4.04-.06zM12 6.87a5.13 5.13 0 1 1 0 10.26 5.13 5.13 0 0 1 0-10.26zm0 1.8a3.33 3.33 0 1 0 0 6.66 3.33 3.33 0 0 0 0-6.66zm5.34-3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" />
      </svg>
    ),
  },
  tt: {
    cls: s.platTt,
    name: "TikTok",
    url: "https://tiktok.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.4a5.7 5.7 0 0 0-.78-.05 5.69 5.69 0 1 0 5.69 5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.25-1.48z" />
      </svg>
    ),
  },
};

const PlatBadge = ({ type, href }: { type: string; href?: string }) => {
  const p = PLAT[type];
  if (!p) return null;
  return (
    <a
      className={`${s.plat} ${p.cls}`}
      href={href ?? p.url}
      target="_blank"
      rel="noreferrer"
      aria-label={p.name}
      title={p.name}
    >
      {p.icon}
    </a>
  );
};

const MINI = {
  users: <Users size={13} strokeWidth={2} />,
  chart: <TrendingUp size={13} strokeWidth={2} />,
  star: <Star size={12} fill="#f5a524" stroke="#f5a524" strokeWidth={1.5} />,
};

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
  // Настройка витрины из админки. Ошибка/пусто → показываем демо.
  const { data: heroConfig } = useQuery<HeroConfigResponse>({
    queryKey: ["hero-config"],
    queryFn: () => api.getHeroConfig(),
    staleTime: 5 * 60 * 1000,
  });

  const total = catalog?.total;

  const [heroQuery, setHeroQuery] = useState("");
  const [heroNiche, setHeroNiche] = useState("all");
  const [orderExample, setOrderExample] = useState(false);

  const q = heroQuery.trim().toLowerCase();

  // Есть ли настроенные авторы? Иначе — демо.
  const configured = Boolean(
    heroConfig &&
      (heroConfig.authors_all.length > 0 ||
        Object.values(heroConfig.authors_by_category ?? {}).some((list) => list.length > 0)),
  );

  const heroChips = useMemo(() => {
    if (heroConfig?.categories?.length) {
      return [
        { key: "all", label: "Все ниши" },
        ...heroConfig.categories.map((c) => ({ key: c.value, label: c.label })),
      ];
    }
    return HERO_CHIPS;
  }, [heroConfig]);

  const heroCards = useMemo(() => {
    let pool: HeroVM[];
    if (configured && heroConfig) {
      const catLabel = (val: string | null) =>
        val ? categories.find((c) => c.value === val)?.label ?? val : "Другое";
      let list: BloggerCard[];
      if (heroNiche === "all") {
        list = heroConfig.authors_all;
      } else {
        const per = heroConfig.authors_by_category?.[heroNiche];
        list = per && per.length ? per : heroConfig.authors_all.filter((a) => a.category === heroNiche);
      }
      pool = list.map((a) => bloggerToHeroVM(a, catLabel(a.category)));
    } else {
      const list = heroNiche === "all" ? DEMO : DEMO.filter((d) => d.key === heroNiche);
      pool = list.map(demoToHeroVM);
    }
    return pool
      .filter((vm) => q === "" || `${vm.name} ${vm.niche}`.toLowerCase().includes(q))
      .slice(0, 3);
  }, [configured, heroConfig, heroNiche, q, categories]);

  return (
    <MarketShell>
      {/* ── Hero ── */}
      <section className={s.hero}>
        <div className={s.heroBg} aria-hidden="true" />
        <div className={shell.pageContainer}>
          <Reveal className={s.heroInner} as="div">
            <h1 className={s.heroTitle}>
              Реклама у блогеров <span className={s.mark}>без риска</span>
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
              <span>{I.checkBadge({ size: 16 })}Без абонплаты</span>
              <span>{I.checkBadge({ size: 16 })}Комиссия только с успешной сделки</span>
              <span>{I.checkBadge({ size: 16 })}Ручная модерация</span>
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
                <span className={s.winUrl}>marketplace.moneymaxxxing.ru/catalog</span>
                <span className={s.winUser} aria-hidden="true">
                  <span className={s.winUserDot} />
                </span>
              </div>
              <div className={s.winBody}>
                <div className={s.shotToolbar}>
                  <span className={s.shotSearch}>
                    {I.search()}
                    <input
                      className={s.shotSearchInput}
                      value={heroQuery}
                      onChange={(e) => setHeroQuery(e.target.value)}
                      placeholder="Поиск по имени или нише"
                      aria-label="Поиск авторов"
                    />
                  </span>
                  <div className={s.shotChips}>
                    {heroChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        className={heroNiche === chip.key ? s.shotChipActive : s.shotChip}
                        onClick={() => setHeroNiche(chip.key)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
                {heroCards.length > 0 ? (
                  <div className={s.shotGrid}>
                    {heroCards.map((c) => (
                      <div key={c.id} className={s.creatorCard}>
                        <div className={s.caTop}>
                          <HeroAvatar card={c} />
                          <div className={s.caHead}>
                            <span className={s.caName}>
                              {c.name} {I.verified()}
                            </span>
                            <span className={s.caNiche}>{c.niche}</span>
                          </div>
                          <div className={s.caPlatforms}>
                            {c.platforms.map((p) => (
                              <PlatBadge key={p} type={p} />
                            ))}
                          </div>
                        </div>
                        <div className={s.caChart} aria-hidden="true">
                          {c.bars.map((h, bi) => (
                            <span
                              key={bi}
                              className={s.caBar}
                              style={{
                                height: `${h}%`,
                                background: bi === c.bars.length - 1 ? c.color : `${c.color}59`,
                              }}
                            />
                          ))}
                        </div>
                        <div className={s.caMetrics}>
                          <span className={s.metric}>
                            {MINI.users} <b>{c.reach}</b>
                          </span>
                          <span className={s.metric}>
                            {MINI.chart} ER&nbsp;<b>{c.er}</b>
                          </span>
                          <span className={s.metric}>
                            {MINI.star} <b>{c.rating}</b>
                          </span>
                        </div>
                        <div className={s.caFoot}>
                          <span className={s.caPrice}>
                            {c.price}
                            <span>интеграция от</span>
                          </span>
                          <button
                            type="button"
                            className={s.caBtn}
                            onClick={() => setOrderExample(true)}
                          >
                            Заказать
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={s.shotEmpty}>Ничего не найдено. Измените запрос или нишу.</div>
                )}
                <div className={s.shotFooter}>
                  {I.shield({ width: 15, height: 15 })} Каждая сделка — под защитой платформы looney moon
                </div>
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
            <h2 className={s.featureTitle}>Деньги под защитой до результата</h2>
            <p className={s.featureLead}>
              Оплата хранится на счёте платформы и переходит автору только после того,
              как вы подтвердите публикацию. Никакой предоплаты «в никуда».
            </p>
            <ul className={s.featureList}>
              {["Эскроу на каждую сделку", "Полный возврат, если публикация не вышла", "Арбитраж поддержки в спорных ситуациях"].map((t) => (
                <li key={t} className={s.featureLi}>
                  {I.checkBadge()} {t}
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
            <h2 className={s.featureTitle}>Только проверенные авторы</h2>
            <p className={s.featureLead}>
              Каждый профиль проходит ручную модерацию: реальная аудитория, честная
              статистика и адекватные цены — без ботов и накруток.
            </p>
            <ul className={s.featureList}>
              {["Ручная проверка каждого автора", "Прозрачная статистика охватов", `${categories.length} ниш и категорий`].map((t) => (
                <li key={t} className={s.featureLi}>
                  {I.checkBadge()} {t}
                </li>
              ))}
            </ul>
            <Link href="/catalog" className={ui.btnUnderline} style={{ marginTop: 22 }}>
              Открыть каталог →
            </Link>
          </Reveal>
          <Reveal className={s.featureVisual} as="div" delay={0.1}>
            <div className={s.mockCard}>
              {DEMO.slice(0, 4).map((c, i) => (
                <div key={c.id} className={s.step} style={{ borderBottom: i < 3 ? "1px solid var(--line)" : "none" }}>
                  <span className={s.caAvatar} style={{ background: c.grad, width: 40, height: 40 }}>
                    {c.name.charAt(0)}
                  </span>
                  <span className={s.stepText} style={{ flex: 1 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {c.name} <span style={{ color: "var(--green)", display: "inline-flex" }}>{I.verified()}</span>
                    </span>
                    <small>{c.niche} · {c.reach} охват</small>
                  </span>
                  <span className={s.caPrice} style={{ fontSize: 14 }}>{c.price}</span>
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
            <h2 className={s.featureTitle}>Прямой диалог с автором</h2>
            <p className={s.featureLead}>
              Обсуждайте бриф, сроки и формат внутри сделки — без посредников и потери
              контекста. Вся история сохраняется.
            </p>
            <ul className={s.featureList}>
              {["Переписка внутри сделки", "История и файлы сохраняются", "Уведомления о смене статуса"].map((t) => (
                <li key={t} className={s.featureLi}>
                  {I.checkBadge()} {t}
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
          <h2 className={`${ui.h2} ${s.headTitle}`}>Всё, что нужно для спокойной сделки</h2>
          <p className={s.headSub}>Выбрали автора, согласовали бриф, оплатили — деньги под защитой до результата.</p>
        </div>
        <div className={s.benefits}>
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} className={`${ui.card} ${s.benefitCard}`} as="div" delay={i * 0.06}>
              <span className={s.benefitIcon} style={{ color: b.color, background: b.soft }}>
                {b.icon({ size: 22 })}
              </span>
              <div className={s.benefitBody}>
                <h3 className={s.benefitTitle}>{b.title}</h3>
                <p className={s.benefitText}>{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Статистика */}
        <Reveal className={s.stats} as="div">
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
        </Reveal>
      </section>

      {/* ── Тёмный CTA ── */}
      <section className={`${s.cta} ${shell.pageContainer}`}>
        <Reveal className={s.ctaInner} as="div">
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
        </Reveal>
      </section>

      {orderExample && (
        <div
          className={s.exampleOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="example-title"
          onClick={() => setOrderExample(false)}
        >
          <div className={s.exampleCard} onClick={(e) => e.stopPropagation()}>
            <h3 id="example-title" className={s.exampleTitle}>
              Это демо-пример
            </h3>
            <p className={s.exampleText}>
              Карточки на этой странице — иллюстрация. Настоящих авторов и безопасную
              сделку вы найдёте в каталоге.
            </p>
            <div className={s.exampleBtns}>
              <Link href="/catalog" className={ui.btnPrimary}>
                Открыть каталог
              </Link>
              <button type="button" className={ui.btnLine} onClick={() => setOrderExample(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </MarketShell>
  );
}
