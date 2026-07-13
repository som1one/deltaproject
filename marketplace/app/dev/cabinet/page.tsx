"use client";

/**
 * /dev/cabinet — постоянный превью-стенд кабинета автора.
 *
 * Рендерит реальный компонент <BloggerCabinet /> с образцовыми данными,
 * предзагруженными в изолированный QueryClient (staleTime: Infinity, без
 * рефетчей) — поэтому работает без логина и без бэкенда. Удобно смотреть и
 * править дизайн кабинета. Данные ненастоящие; кнопки-мутации (сохранение,
 * заявки) при отсутствии бэкенда не сработают — это только визуальный стенд.
 *
 * Доступен только в dev-режиме.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCabinet } from "@/components/cabinet/blogger-cabinet";
import { ORDERS_KEY, PREMIUM_LATEST_KEY, SELF_PROFILE_KEY } from "@/components/cabinet/keys";
import type {
  BloggerSelfProfile,
  MarketplaceCategory,
  OrdersResponse,
  ServiceType,
} from "@/lib/types";

import shell from "@/components/shell/shell.module.css";

const SERVICE_TYPES: ServiceType[] = [
  { id: "st-integration", code: "integration", name: "Интеграция в видео", description: "Рекламный блок 60–90 сек внутри ролика", sort_order: 1, is_active: true },
  { id: "st-story", code: "story", name: "Серия сторис", description: "3–5 сторис с отметкой и ссылкой", sort_order: 2, is_active: true },
  { id: "st-dedicated", code: "dedicated", name: "Отдельный ролик", description: "Полноценный ролик под продукт", sort_order: 3, is_active: true },
  { id: "st-pinned", code: "pinned", name: "Закреп в Telegram", description: "Пост в канале с закрепом на сутки", sort_order: 4, is_active: true },
];

const CATEGORIES: MarketplaceCategory[] = [
  { value: "lifestyle", label: "Лайфстайл" },
  { value: "tech", label: "Технологии" },
  { value: "beauty", label: "Бьюти" },
  { value: "gaming", label: "Игры" },
  { value: "education", label: "Образование" },
];

const PROFILE: BloggerSelfProfile = {
  // BloggerCard
  id: "prof-delta",
  user_id: "user-delta",
  name: "Delta",
  category: "lifestyle",
  gender: "male",
  subscriber_count: 128000,
  average_price_kopeks: 4500000,
  photo_url: null,
  engagement_rate: 6.2,
  rating: 4.8,
  reviews_count: 23,
  platforms: ["youtube", "telegram"],
  is_active: true,
  orders_enabled: true,
  created_at: "2025-11-02T10:00:00Z",
  // BloggerProfileFull
  description:
    "Лайфстайл и техника: честные обзоры, влоги и интеграции без воды. Пишу сценарий сам, согласовываю с брендом.",
  portfolio_links: [
    "https://youtube.com/watch?v=demo1",
    "https://youtube.com/watch?v=demo2",
    "https://youtube.com/watch?v=demo3",
  ],
  portfolio_titles: ["Гаджеты месяца", "Влог: неделя из жизни", "Тест новинок"],
  social_links: ["https://youtube.com/@delta", "https://t.me/delta"],
  preferred_contact: "@delta",
  updated_at: "2026-07-05T12:00:00Z",
  audience_age: [
    { label: "18–24", percent: 34 },
    { label: "25–34", percent: 41 },
    { label: "35–44", percent: 18 },
    { label: "45+", percent: 7 },
  ],
  audience_gender: { female: 46, male: 54 },
  audience_geo: [
    { label: "Россия", percent: 72 },
    { label: "Казахстан", percent: 11 },
    { label: "Беларусь", percent: 9 },
    { label: "Другое", percent: 8 },
  ],
  audience_devices: [
    { label: "Mobile", percent: 81 },
    { label: "Desktop", percent: 15 },
    { label: "TV", percent: 4 },
  ],
  formats: ["Интеграция", "Сторис", "Ролик"],
  avg_views: 95000,
  posting_frequency: "3 видео в неделю",
  response_time: "≈ 2 часа",
  audience_verified_at: "2026-06-15T00:00:00Z",
  show_portfolio: true,
  show_socials: true,
  // BloggerSelfProfile
  price_list_full: [
    { id: "pl-1", service_type_id: "st-integration", code: "integration", name: "Интеграция в видео", price_kopeks: 4500000, description: "60–90 сек в ролике", is_enabled: true },
    { id: "pl-2", service_type_id: "st-story", code: "story", name: "Серия сторис", price_kopeks: 1500000, description: "3–5 сторис со ссылкой", is_enabled: true },
    { id: "pl-3", service_type_id: "st-dedicated", code: "dedicated", name: "Отдельный ролик", price_kopeks: 9000000, description: "Полноценный ролик под продукт", is_enabled: true },
    { id: "pl-4", service_type_id: "st-pinned", code: "pinned", name: "Закреп в Telegram", price_kopeks: 800000, description: null, is_enabled: false },
  ],
  latest_audience_submission: {
    id: "sub-1",
    profile_id: "prof-delta",
    status: "approved",
    payload: {
      subscriber_count: 128000,
      avg_views: 95000,
      posting_frequency: "3 видео в неделю",
      response_time: "≈ 2 часа",
      audience_gender: { female: 46, male: 54 },
    },
    screenshots: [],
    review_comment: null,
    created_at: "2026-06-10T00:00:00Z",
    reviewed_at: "2026-06-15T00:00:00Z",
  },
};

const ORDERS: OrdersResponse = {
  items: [
    {
      id: "ord-1", client_id: "c1", blogger_id: "user-delta", worker_id: null,
      status: "ESCROW_HELD", amount_kopeks: 4500000, message: "Интеграция в ближайший ролик про технику",
      platform_commission_pct: 10, worker_commission_pct: 0, yookassa_payment_id: null, payment_url: null,
      payment_expires_at: null, payment_reported_at: null, service_type_id: "st-integration",
      service_type_name: "Интеграция в видео", offered_by: "client", deadline_days: 7, publish_at: null,
      accepted_at: "2026-07-08T10:00:00Z", deadline_at: "2026-07-15T10:00:00Z", work_submitted_at: null,
      work_result: null, review_deadline_at: null, decline_reason: null, created_at: "2026-07-08T09:00:00Z",
      paid_at: "2026-07-08T11:00:00Z", blogger_confirmed_at: null, completed_at: null,
      updated_at: "2026-07-08T11:00:00Z", blogger_name: "Delta", client_name: "Артур Чуль",
    },
    {
      id: "ord-2", client_id: "c2", blogger_id: "user-delta", worker_id: null,
      status: "OFFER_PENDING", amount_kopeks: 1500000, message: "Серия сторис под запуск косметики",
      platform_commission_pct: 10, worker_commission_pct: 0, yookassa_payment_id: null, payment_url: null,
      payment_expires_at: null, payment_reported_at: null, service_type_id: "st-story",
      service_type_name: "Серия сторис", offered_by: "client", deadline_days: 3, publish_at: null,
      accepted_at: null, deadline_at: null, work_submitted_at: null, work_result: null,
      review_deadline_at: null, decline_reason: null, created_at: "2026-07-11T14:00:00Z",
      paid_at: null, blogger_confirmed_at: null, completed_at: null, updated_at: "2026-07-11T14:00:00Z",
      blogger_name: "Delta", client_name: "Мария И.",
    },
  ],
  total: 2,
  page: 1,
  page_size: 50,
};

function makeSeededClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  client.setQueryData(SELF_PROFILE_KEY, PROFILE);
  client.setQueryData(ORDERS_KEY, ORDERS);
  client.setQueryData(PREMIUM_LATEST_KEY, null);
  client.setQueryData(["marketplace-service-types"], SERVICE_TYPES);
  client.setQueryData(["marketplace-categories"], CATEGORIES);
  return client;
}

export default function DevCabinetPage() {
  const [client] = useState(makeSeededClient);

  if (process.env.NODE_ENV === "production") {
    return <div style={{ padding: 40 }}>Стенд доступен только в dev-режиме.</div>;
  }

  return (
    <QueryClientProvider client={client}>
      <MarketShell>
        <div className={shell.pageContainer}>
          <BloggerCabinet />
        </div>
      </MarketShell>
    </QueryClientProvider>
  );
}
