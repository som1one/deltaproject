"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clapperboard, Film, Megaphone, Tag } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { Portrait, StarRating } from "@/components/ui/bits";
import { Select } from "@/components/ui/select";
import { Reveal } from "@/components/ui/motion";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { resolveUploadUrl } from "@/lib/config";
import { formatAudience, formatDate, formatMoney } from "@/lib/format";
import type { BloggerProfileFull, Order } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./blogger.module.css";

const ShieldIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

/* Бейдж «проверен» — зелёный кружок с галочкой (как маркер доверия). */
const VerifiedIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M8 12.4l2.6 2.6 5-5.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UsersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const TrendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

/* Галочка-бейдж для списка «что вы получаете» — в мягком зелёном круге. */
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="var(--success-soft)" />
    <path d="M8 12.4l2.6 2.6 5-5.6" fill="none" stroke="var(--success-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* «в реестре с» — родительный падеж месяца, чтобы фраза читалась естественно. */
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const memberSince = (iso: string): string => {
  const d = new Date(iso);
  return `${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
};

const reviewWord = (n: number): string => {
  const t = n % 10;
  const h = n % 100;
  if (t === 1 && h !== 11) return "отзыв";
  if (t >= 2 && t <= 4 && (h < 10 || h >= 20)) return "отзыва";
  return "отзывов";
};

const DEFAULT_BRIEF =
  "Здравствуйте! Хотим обсудить рекламную интеграцию: расскажу о продукте и пожеланиях к формату.";

/** Пункт «своих условий» в селекте услуг. */
const CUSTOM_SERVICE = "custom";

/* ── Черновик оффера ──────────────────────────────────────────
   Неавторизованный сабмит уводит на логин, и до этого фикса форма
   стиралась. Теперь перед редиректом черновик уезжает в localStorage
   (ключ по id автора), при возврате восстанавливается вместе с
   раскрытой формой, а после создания сделки или явной отмены — чистится. */
const DRAFT_KEY_PREFIX = "mm:offer-draft:";

type OfferDraft = {
  amountRub: string;
  serviceId: string;
  deadlineDays: string;
  publishDate: string;
  brief: string;
  formOpen: boolean;
};

const readOfferDraft = (bloggerId: string): OfferDraft | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY_PREFIX + bloggerId);
    return raw ? (JSON.parse(raw) as OfferDraft) : null;
  } catch {
    return null;
  }
};

const saveOfferDraft = (bloggerId: string, draft: OfferDraft) => {
  try {
    window.localStorage.setItem(DRAFT_KEY_PREFIX + bloggerId, JSON.stringify(draft));
  } catch {
    // квота/приватный режим — молча пропускаем, хуже не станет
  }
};

const clearOfferDraft = (bloggerId: string) => {
  try {
    window.localStorage.removeItem(DRAFT_KEY_PREFIX + bloggerId);
  } catch {
    // ignore
  }
};

/* Иконки для плиток прайс-листа — чередуются по кругу. */
const PRICE_ICONS = [Clapperboard, Megaphone, Tag, Film];

/* Демо-профили для карточек каталога (demo-1/demo-2) — чтобы переход из каталога
   работал и без бэкенда. Совпадают с DEMO_BLOGGERS в каталоге. */
const DEMO_PROFILES: Record<string, BloggerProfileFull> = {
  "demo-1": {
    id: "demo-1",
    user_id: "demo-1",
    name: "Ирина Соколова",
    category: "tech",
    gender: "female",
    subscriber_count: 320_000,
    average_price_kopeks: 25_000_000,
    photo_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=640&q=80&auto=format&fit=crop",
    engagement_rate: 6.2,
    rating: 4.9,
    reviews_count: 47,
    platforms: ["yt", "tg", "ig"],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    orders_enabled: true,
    preferred_contact: null,
    description:
      "Обзоры смартфонов, ноутбуков и гаджетов без воды. Аудитория 25–40 лет, интересуется технологиями и покупками. Форматы: интеграция в ролик, распаковка, отдельный обзор.",
    social_links: ["https://youtube.com/@irina.tech", "https://t.me/irina_tech", "https://instagram.com/irina.tech"],
    portfolio_links: ["https://youtube.com/watch?v=demo1a", "https://youtube.com/watch?v=demo1b"],
    portfolio_titles: [
      "Обзор iPhone 15 Pro: год спустя — стоит ли брать?",
      "MacBook Air M3 против ThinkPad — рабочая машина без компромиссов",
    ],
    // Первая работа с обложкой, вторая — плиткой площадки (оба варианта витрины)
    portfolio_covers: [
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=640&q=80&auto=format&fit=crop",
      null,
    ],
    audience_age: [
      { label: "25–34", percent: 44 },
      { label: "35–44", percent: 31 },
      { label: "18–24", percent: 15 },
      { label: "45+", percent: 10 },
    ],
    audience_gender: { female: 42, male: 58 },
    audience_geo: [
      { label: "Россия", percent: 72 },
      { label: "СНГ", percent: 18 },
      { label: "Другое", percent: 10 },
    ],
    audience_devices: [
      { label: "Mobile", percent: 68 },
      { label: "Desktop", percent: 27 },
      { label: "TV", percent: 5 },
    ],
    formats: [
      "Интеграция 60 сек в ролик",
      "Отдельный обзор",
      "Распаковка",
      "Спонсор эпизода",
    ],
    avg_views: 245_000,
    posting_frequency: "3–4 ролика в месяц",
    response_time: "≈ 2 часа",
    audience_verified_at: "2026-05-14T00:00:00Z",
    price_list: [
      {
        service_type_id: "demo-1-integration",
        code: "integration",
        name: "Интеграция в ролик",
        price_kopeks: 25_000_000,
        description: "60 секунд внутри обзора, сценарий согласуем заранее",
      },
      {
        service_type_id: "demo-1-review",
        code: "review",
        name: "Отдельный обзор",
        price_kopeks: 45_000_000,
        description: "Полноценный ролик 10–15 минут о вашем продукте",
      },
      {
        service_type_id: "demo-1-tg-post",
        code: "tg_post",
        name: "Пост в Telegram",
        price_kopeks: 6_000_000,
        description: "Нативная рекомендация в канале с активной аудиторией",
      },
    ],
  },
  "demo-2": {
    id: "demo-2",
    user_id: "demo-2",
    name: "Марк Тимофеев",
    category: "gaming",
    gender: "male",
    subscriber_count: 510_000,
    average_price_kopeks: 18_000_000,
    photo_url: null,
    engagement_rate: 5.4,
    rating: 4.8,
    reviews_count: 31,
    platforms: ["yt", "tt"],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    orders_enabled: true,
    preferred_contact: null,
    description:
      "Стримы и обзоры игр, киберспорт и железо для гейминга. Активная молодая аудитория 16–28 лет. Форматы: спонсорский сегмент на стриме, обзор, интеграция в ролик.",
    social_links: ["https://youtube.com/@mark.games", "https://tiktok.com/@mark.games"],
    portfolio_links: ["https://youtube.com/watch?v=demo2a"],
    portfolio_titles: ["Прошёл Elden Ring без прокачки — как я мучился 40 часов"],
    audience_age: [
      { label: "18–24", percent: 48 },
      { label: "25–34", percent: 34 },
      { label: "13–17", percent: 12 },
      { label: "35+", percent: 6 },
    ],
    audience_gender: { female: 12, male: 88 },
    audience_geo: [
      { label: "Россия", percent: 68 },
      { label: "СНГ", percent: 21 },
      { label: "Другое", percent: 11 },
    ],
    audience_devices: [
      { label: "Desktop", percent: 55 },
      { label: "Mobile", percent: 42 },
      { label: "TV", percent: 3 },
    ],
    formats: [
      "Спонсорский сегмент на стриме",
      "Обзор игры",
      "Интеграция в ролик",
    ],
    avg_views: 380_000,
    posting_frequency: "2–3 стрима в неделю",
    response_time: "≈ 4 часа",
    audience_verified_at: "2026-04-02T00:00:00Z",
    price_list: [
      {
        service_type_id: "demo-2-stream",
        code: "stream_sponsor",
        name: "Спонсорский сегмент на стриме",
        price_kopeks: 18_000_000,
        description: "15 минут геймплея вашей игры в прямом эфире",
      },
      {
        service_type_id: "demo-2-game-review",
        code: "game_review",
        name: "Обзор игры",
        price_kopeks: 30_000_000,
        description: "Отдельный ролик с честным разбором механик",
      },
    ],
  },
};

/* Определение соцсети по ссылке — для аккуратных кнопок-площадок. */
type Social = { test: RegExp; name: string; color: string; path: string };
const SOCIALS: Social[] = [
  { test: /youtube\.com|youtu\.be/i, name: "YouTube", color: "#ff0000", path: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" },
  { test: /t\.me|telegram/i, name: "Telegram", color: "#29a9eb", path: "M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" },
  { test: /instagram\.com/i, name: "Instagram", color: "linear-gradient(45deg, #feda75, #fa7e1e 28%, #d62976 58%, #962fbf 100%)", path: "M12 2c2.72 0 3.06.01 4.12.06 1.07.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.89 1.11 1.15 1.77.25.64.42 1.36.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.07-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77c-.55.55-1.11.89-1.77 1.15-.64.25-1.36.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.07-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.36-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.07.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77.55-.55 1.11-.89 1.77-1.15.64-.25 1.36-.42 2.43-.47C8.94 2.01 9.28 2 12 2zm0 3.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm0 2.02a4.18 4.18 0 1 1 0 8.36 4.18 4.18 0 0 1 0-8.36zM18.4 4.55a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9z" },
  { test: /tiktok\.com/i, name: "TikTok", color: "#111214", path: "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.4a5.7 5.7 0 0 0-.78-.05 5.69 5.69 0 1 0 5.69 5.69V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.25-1.48z" },
  { test: /vk\.com|vk\.ru/i, name: "ВКонтакте", color: "#0077ff", path: "M12.8 16.3c-5 0-8-3.4-8.1-9.1h2.5c.1 4.2 2 6 3.4 6.4V7.2h2.4v3.6c1.4-.2 2.9-1.8 3.4-3.6h2.4a6.8 6.8 0 0 1-3.1 4.5 7 7 0 0 1 3.6 4.6h-2.6c-.4-1.4-1.7-2.9-3.7-3.1v3.1h-.2z" },
];
const GLOBE_PATH =
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8 8 0 0 1 0-4h3.38a16.6 16.6 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A8 8 0 0 1 5.08 16zm2.95-8H5.08a8 8 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.9 14.9 0 0 1 0-4h4.68a14.9 14.9 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.6 16.6 0 0 0 0-4h3.38a8 8 0 0 1 0 4h-3.38z";
const detectSocial = (url: string): Social | null => SOCIALS.find((s) => s.test.test(url)) ?? null;

export default function BloggerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();

  const bloggerUserId = params.id;

  // Для демо-id (demo-1/demo-2) берём локальный профиль и не ходим в API.
  const demoProfile = DEMO_PROFILES[bloggerUserId];

  const { data, isLoading } = useQuery<BloggerProfileFull>({
    queryKey: ["blogger-profile", bloggerUserId],
    queryFn: () => api.getBlogger(bloggerUserId),
    enabled: Boolean(bloggerUserId) && !demoProfile,
  });

  const blogger = demoProfile ?? data;

  const [amountRub, setAmountRub] = useState("");
  const [serviceId, setServiceId] = useState(CUSTOM_SERVICE);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (blogger && amountRub === "") {
      setAmountRub(String(Math.round(blogger.average_price_kopeks / 100)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogger]);

  // Восстановление черновика (например, после возврата с логина). Ставит
  // amountRub раньше, чем догрузится профиль, поэтому префилл выше его не трёт.
  useEffect(() => {
    if (!bloggerUserId) return;
    const draft = readOfferDraft(bloggerUserId);
    if (!draft) return;
    if (draft.amountRub) setAmountRub(draft.amountRub);
    if (draft.serviceId) setServiceId(draft.serviceId);
    setDeadlineDays(draft.deadlineDays ?? "");
    setPublishDate(draft.publishDate ?? "");
    if (draft.brief) setBrief(draft.brief);
    if (draft.formOpen) setFormOpen(true);
  }, [bloggerUserId]);

  const persistDraft = () =>
    saveOfferDraft(bloggerUserId, {
      amountRub,
      serviceId,
      deadlineDays,
      publishDate,
      brief,
      formOpen: true,
    });

  const cancelForm = () => {
    clearOfferDraft(bloggerUserId);
    setFormOpen(false);
    setFormError("");
    setServiceId(CUSTOM_SERVICE);
    setDeadlineDays("");
    setPublishDate("");
    setBrief(DEFAULT_BRIEF);
    setAmountRub(blogger ? String(Math.round(blogger.average_price_kopeks / 100)) : "");
  };

  /* Подтверждённая админом статистика важнее «сырых» полей профиля,
     но демо-профили держат данные в самих полях — берём и то и другое. */
  const stats = blogger?.audience_stats;
  const audienceAge = stats?.audience_age ?? blogger?.audience_age;
  const audienceGender = stats?.audience_gender ?? blogger?.audience_gender;
  const audienceGeo = stats?.audience_geo ?? blogger?.audience_geo;
  const avgViews = stats?.avg_views ?? blogger?.avg_views;
  const postingFrequency = stats?.posting_frequency ?? blogger?.posting_frequency;
  const responseTime = stats?.response_time ?? blogger?.response_time;

  const priceList = blogger?.price_list ?? [];
  const serviceOptions = [
    ...priceList.map((p) => ({ value: p.service_type_id, label: p.name })),
    { value: CUSTOM_SERVICE, label: "Свои условия" },
  ];

  /* Выбор услуги префиллит бюджет её ценой; «свои условия» возвращают ориентир. */
  const handleServiceChange = (next: string) => {
    setServiceId(next);
    const item = priceList.find((p) => p.service_type_id === next);
    if (item) {
      setAmountRub(String(Math.round(item.price_kopeks / 100)));
    } else if (blogger) {
      setAmountRub(String(Math.round(blogger.average_price_kopeks / 100)));
    }
  };

  const goToChat = () => {
    const target = `/chats/${blogger?.user_id ?? bloggerUserId}`;
    if (!isAuthenticated && formOpen) persistDraft();
    router.push(isAuthenticated ? target : `/auth/login?next=${target}`);
  };

  const orderMutation = useMutation({
    mutationFn: async (): Promise<Order> => {
      const rub = Number(amountRub.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(rub) || rub < 1) {
        throw new Error("Укажите корректную сумму сделки");
      }
      const days = deadlineDays.trim() === "" ? null : Number(deadlineDays);
      if (days != null && (!Number.isInteger(days) || days < 1 || days > 90)) {
        throw new Error("Срок выполнения — целое число от 1 до 90 дней");
      }
      if (!brief.trim()) {
        throw new Error("Опишите задачу для автора");
      }
      return api.createOrder({
        blogger_id: blogger?.user_id ?? bloggerUserId,
        message: brief.trim(),
        amount_kopeks: Math.round(rub * 100),
        service_type_id: serviceId === CUSTOM_SERVICE ? null : serviceId,
        deadline_days: days,
        publish_at: publishDate ? new Date(`${publishDate}T12:00:00`).toISOString() : null,
      });
    },
    onSuccess: (order) => {
      clearOfferDraft(bloggerUserId);
      router.push(`/orders/${order.id}`);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 401) {
        persistDraft();
        router.push(`/auth/login?next=/bloggers/${bloggerUserId}`);
        return;
      }
      setFormError(err.message || "Не удалось создать сделку");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!isAuthenticated) {
      persistDraft();
      router.push(`/auth/login?next=/bloggers/${bloggerUserId}`);
      return;
    }
    orderMutation.mutate();
  };

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <div className={styles.wrap}>
          <Link href="/catalog" className={styles.backLink}>
            ← В указатель авторов
          </Link>

          {isLoading ? (
            <div className={styles.layout}>
              <div className={ui.skeleton} style={{ aspectRatio: "4 / 5", maxWidth: 460 }} />
              <div className={ui.skeleton} style={{ height: 440 }} />
            </div>
          ) : !blogger ? (
            <div className={ui.empty}>
              <h3 className={ui.emptyTitle}>Досье не найдено</h3>
              <p className={ui.emptyText}>Возможно, автор скрыл страницу или ссылка устарела.</p>
              <Link href="/catalog" className={ui.btnLine}>
                Вернуться в каталог
              </Link>
            </div>
          ) : (
            <>
              <Reveal as="header" className={styles.header}>
                <h1 className={styles.name}>{blogger.name}</h1>
                <div className={styles.tagRow}>
                  <span className={styles.nicheTag}>{categoryLabel(blogger.category)}</span>
                  {blogger.orders_enabled ? (
                    <span className={styles.statusOpen}>Принимает сделки</span>
                  ) : (
                    <span className={styles.statusPaused}>Сделки приостановлены</span>
                  )}
                  <span className={styles.memberSince}>
                    <VerifiedIcon />
                    В реестре с {memberSince(blogger.created_at)}
                  </span>
                </div>
                <div className={styles.statRow}>
                  {blogger.rating != null && (
                    <span className={styles.stat}>
                      <StarRating value={blogger.rating} readOnly size={15} />
                      <b>{blogger.rating.toFixed(1)}</b>
                      {blogger.reviews_count ? (
                        <span className={styles.statSub}>· {blogger.reviews_count} {reviewWord(blogger.reviews_count)}</span>
                      ) : null}
                    </span>
                  )}
                  <span className={styles.stat}>
                    <UsersIcon />
                    <b>{formatAudience(blogger.subscriber_count)}</b>
                    <span className={styles.statSub}>охват</span>
                  </span>
                  {blogger.engagement_rate != null && (
                    <span className={styles.stat}>
                      <TrendIcon />
                      <b>{blogger.engagement_rate}%</b>
                      <span className={styles.statSub}>ER</span>
                    </span>
                  )}
                </div>
              </Reveal>

              <div className={styles.layout}>
                {/* Левая колонка — портрет и нарратив. На мобильном обёртка
                    становится display:contents, и порядок задаёт сам грид. */}
                <div className={styles.mainCol}>
                  <Portrait
                    name={blogger.name}
                    photoUrl={blogger.photo_url}
                    className={styles.portrait}
                    monoSize={88}
                  />

                  {blogger.description && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Об авторе</h2>
                      <p className={styles.description}>{blogger.description}</p>
                      {(avgViews != null || postingFrequency || responseTime) && (
                        <div className={styles.authorMeta}>
                          {avgViews != null && (
                            <div className={styles.authorMetaItem}>
                              <span className={styles.authorMetaVal}>{formatAudience(avgViews)}</span>
                              <span className={styles.authorMetaKey}>средние просмотры</span>
                            </div>
                          )}
                          {postingFrequency && (
                            <div className={styles.authorMetaItem}>
                              <span className={styles.authorMetaVal}>{postingFrequency}</span>
                              <span className={styles.authorMetaKey}>частота выхода</span>
                            </div>
                          )}
                          {responseTime && (
                            <div className={styles.authorMetaItem}>
                              <span className={styles.authorMetaVal}>{responseTime}</span>
                              <span className={styles.authorMetaKey}>среднее время ответа</span>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {priceList.length > 0 && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Прайс-лист</h2>
                      <div className={styles.priceList}>
                        {priceList.map((item, i) => {
                          const Icon = PRICE_ICONS[i % PRICE_ICONS.length];
                          return (
                            <div key={item.service_type_id} className={styles.priceRow}>
                              <span
                                className={`${styles.priceIcon} ${i % 2 === 0 ? styles.priceIconViolet : styles.priceIconGreen}`}
                                aria-hidden="true"
                              >
                                <Icon size={18} strokeWidth={1.8} />
                              </span>
                              <span className={styles.priceInfo}>
                                <span className={styles.priceName}>{item.name}</span>
                                {item.description && <span className={styles.priceDesc}>{item.description}</span>}
                              </span>
                              <span className={styles.priceValue}>{formatMoney(item.price_kopeks)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {(audienceAge || audienceGender || audienceGeo) && (
                    <section className={styles.block}>
                      <div className={styles.blockHead}>
                        <h2 className={styles.blockTitleBare}>Аудитория</h2>
                        {blogger.audience_verified_at && (
                          <span className={styles.verifiedBadge}>
                            <VerifiedIcon />
                            Подтверждено платформой {formatDate(blogger.audience_verified_at)}
                          </span>
                        )}
                      </div>
                      <div className={styles.audiencePanel}>
                        {audienceAge && audienceAge.length > 0 && (
                          <div className={styles.audienceCol}>
                            <span className={styles.audienceColTitle}>Возраст</span>
                            <ul className={styles.audienceList}>
                              {audienceAge.map((a) => (
                                <li key={a.label} className={styles.audienceRow}>
                                  <span className={styles.audienceLabel}>{a.label}</span>
                                  <span className={styles.audienceBar}>
                                    <span style={{ width: `${a.percent}%` }} />
                                  </span>
                                  <span className={styles.audienceVal}>{a.percent}%</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {audienceGender && (
                          <div className={styles.audienceCol}>
                            <span className={styles.audienceColTitle}>Пол</span>
                            <div className={styles.genderTrack}>
                              <span className={styles.genderFemale} style={{ width: `${audienceGender.female}%` }} />
                              <span className={styles.genderMale} style={{ width: `${audienceGender.male}%` }} />
                            </div>
                            <ul className={styles.genderLegend}>
                              <li>
                                <span className={styles.dotFemale} />
                                <span className={styles.audienceLabel}>Женщины</span>
                                <span className={styles.audienceVal}>{audienceGender.female}%</span>
                              </li>
                              <li>
                                <span className={styles.dotMale} />
                                <span className={styles.audienceLabel}>Мужчины</span>
                                <span className={styles.audienceVal}>{audienceGender.male}%</span>
                              </li>
                            </ul>
                          </div>
                        )}
                        {audienceGeo && audienceGeo.length > 0 && (
                          <div className={styles.audienceCol}>
                            <span className={styles.audienceColTitle}>География</span>
                            <ul className={styles.audienceList}>
                              {audienceGeo.map((g) => (
                                <li key={g.label} className={styles.audienceRow}>
                                  <span className={styles.audienceLabel}>{g.label}</span>
                                  <span className={styles.audienceBar}>
                                    <span style={{ width: `${g.percent}%` }} />
                                  </span>
                                  <span className={styles.audienceVal}>{g.percent}%</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {blogger.formats && blogger.formats.length > 0 && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Форматы работы</h2>
                      <div className={styles.formatChips}>
                        {blogger.formats.map((f) => (
                          <span key={f} className={styles.formatChip}>{f}</span>
                        ))}
                      </div>
                    </section>
                  )}

                  {Boolean(blogger.social_links?.length) && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Площадки</h2>
                      <div className={styles.socialGrid}>
                        {blogger.social_links.map((link) => {
                          const s = detectSocial(link);
                          const handle = link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
                          return (
                            <a key={link} href={link} target="_blank" rel="noreferrer" className={styles.socialBtn}>
                              <span className={styles.socialIcon} style={s ? { background: s.color } : undefined}>
                                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d={s?.path ?? GLOBE_PATH} />
                                </svg>
                              </span>
                              <span className={styles.socialMeta}>
                                <span className={styles.socialName}>{s?.name ?? "Ссылка"}</span>
                                <span className={styles.socialHandle}>{handle}</span>
                              </span>
                              <span className={styles.socialArrow}>↗</span>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {Boolean(blogger.portfolio_links?.length) && (
                    <section className={styles.block}>
                      <h2 className={styles.blockTitle}>Портфолио публикаций</h2>
                      <div className={styles.portfolioGrid}>
                        {blogger.portfolio_links.map((link, i) => {
                          const s = detectSocial(link);
                          const title = blogger.portfolio_titles?.[i] ?? `Публикация ${i + 1}`;
                          const cover = blogger.portfolio_covers?.[i] ?? null;
                          return (
                            <a key={link} href={link} target="_blank" rel="noreferrer" className={styles.portfolioItem}>
                              <span
                                className={styles.portfolioCover}
                                style={!cover && s ? { background: s.color } : undefined}
                              >
                                {cover && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    className={styles.portfolioCoverImg}
                                    src={resolveUploadUrl(cover) ?? cover}
                                    alt=""
                                    loading="lazy"
                                  />
                                )}
                                <svg className={styles.portfolioLogo} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d={s?.path ?? GLOBE_PATH} />
                                </svg>
                                <span className={styles.portfolioPlay} aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </span>
                              </span>
                              <span className={styles.portfolioMeta}>
                                <span className={styles.portfolioTitle}>{title}</span>
                                <span className={styles.portfolioSub}>{s?.name ?? "Ссылка"} · смотреть →</span>
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>

                {/* Правая колонка — факты и сделка */}
                <aside className={styles.orderCard}>
                  <div className={styles.orderPrice}>
                    <span className={styles.orderPriceValue}>
                      <span className={styles.priceMark}>{formatMoney(blogger.average_price_kopeks)}</span>
                    </span>
                    <span className={styles.orderPriceHint}>Ориентир за интеграцию</span>
                  </div>

                  {isHydrated && isBlogger ? (
                    <div className={ui.notice}>
                      Вы вошли как автор. Сделки оформляют заказчики — ваши входящие
                      находятся в разделе «Входящие».
                    </div>
                  ) : (
                    <>
                      {!blogger.orders_enabled && (
                        <div className={ui.notice}>
                          Автор приостановил приём заказов. Написать ему можно — обсудите
                          условия в чате, а сделку оформите позже.
                        </div>
                      )}

                      {blogger.orders_enabled && !formOpen && (
                        <>
                          <ul className={styles.perks}>
                            <li className={styles.perk}>
                              <CheckIcon />
                              Оплата на счёт платформы
                            </li>
                            <li className={styles.perk}>
                              <CheckIcon />
                              Чат с автором прямо на площадке
                            </li>
                            <li className={styles.perk}>
                              <CheckIcon />
                              Возврат, если публикация не вышла
                            </li>
                          </ul>
                          <button
                            type="button"
                            className={`${ui.btnPrimary} ${ui.btnBlock}`}
                            onClick={() => setFormOpen(true)}
                          >
                            Предложить сделку
                          </button>
                          <p className={ui.fine} style={{ textAlign: "center" }}>
                            Форма — 1 минута · без обязательств
                          </p>
                        </>
                      )}

                      {blogger.orders_enabled && formOpen && (
                        <form className={ui.form} onSubmit={handleSubmit}>
                          {priceList.length > 0 && (
                            <div className={ui.field}>
                              <span className={ui.fieldLabel}>Услуга</span>
                              <Select
                                value={serviceId}
                                onChange={handleServiceChange}
                                options={serviceOptions}
                                ariaLabel="Услуга"
                              />
                            </div>
                          )}
                          <label className={ui.field}>
                            <span className={ui.fieldLabel}>Бюджет, ₽</span>
                            <span className={styles.amountRow}>
                              <input
                                className={ui.input}
                                inputMode="numeric"
                                required
                                value={amountRub}
                                onChange={(e) => setAmountRub(e.target.value.replace(/[^\d\s.,]/g, ""))}
                                aria-label="Сумма в рублях"
                              />
                              <span className={styles.amountSuffix}>₽</span>
                            </span>
                          </label>
                          <div className={styles.fieldDuo}>
                            <label className={ui.field}>
                              <span className={ui.fieldLabel}>Срок выполнения, дней</span>
                              <input
                                className={ui.input}
                                type="number"
                                min={1}
                                max={90}
                                step={1}
                                placeholder="напр. 14"
                                value={deadlineDays}
                                onChange={(e) => setDeadlineDays(e.target.value)}
                              />
                            </label>
                            <label className={ui.field}>
                              <span className={ui.fieldLabel}>Дата публикации</span>
                              <input
                                className={ui.input}
                                type="date"
                                min={new Date().toISOString().slice(0, 10)}
                                value={publishDate}
                                onChange={(e) => setPublishDate(e.target.value)}
                              />
                            </label>
                          </div>
                          <p className={styles.fieldHint}>
                            Срок и дата необязательны. Дата — если ролик должен выйти в конкретный день.
                          </p>
                          <label className={ui.field}>
                            <span className={ui.fieldLabel}>ТЗ для автора</span>
                            <textarea
                              className={ui.textarea}
                              maxLength={1000}
                              minLength={1}
                              required
                              value={brief}
                              onChange={(e) => setBrief(e.target.value)}
                            />
                          </label>
                          {formError && <div className={ui.noticeDanger}>{formError}</div>}
                          <button className={`${ui.btnPrimary} ${ui.btnBlock}`} type="submit" disabled={orderMutation.isPending}>
                            {orderMutation.isPending
                              ? "Отправляем предложение…"
                              : isAuthenticated
                                ? "Отправить предложение"
                                : "Войти и предложить сделку"}
                          </button>
                          <p className={ui.fine} style={{ textAlign: "center" }}>
                            Автор получит предложение в чат и сможет принять его или задать
                            вопросы. Оплата — только после принятия.
                          </p>
                          {isHydrated && !isAuthenticated && (
                            <p className={ui.fine} style={{ textAlign: "center" }}>
                              Нужен аккаунт заказчика —{" "}
                              <Link
                                href={`/auth/register?next=/bloggers/${bloggerUserId}`}
                                className={ui.link}
                                onClick={persistDraft}
                              >
                                создать за минуту
                              </Link>
                            </p>
                          )}
                          <p className={ui.fine} style={{ textAlign: "center", margin: 0 }}>
                            <button type="button" className={ui.link} onClick={cancelForm}>
                              Отменить и очистить форму
                            </button>
                          </p>
                        </form>
                      )}

                      <button
                        type="button"
                        className={`${ui.btnLine} ${ui.btnBlock} ${styles.chatBtn}`}
                        onClick={goToChat}
                      >
                        Написать автору
                      </button>

                      <p className={styles.secureNote}>
                        <ShieldIcon />
                        Оплата удерживается на счёте платформы и переходит автору только
                        после того, как вы подтвердите публикацию.
                      </p>
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </MarketShell>
  );
}
