"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCardSkeleton, BloggerCardView, type BloggerCardVM } from "@/components/catalog/blogger-card";
import { Reveal } from "@/components/ui/motion";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import land from "@/components/landing/landing.module.css";
import styles from "./catalog.module.css";

const PAGE_SIZE = 12;

/* Тестовые карточки для проверки вёрстки без бэкенда: /catalog?demo=1 */
const DEMO_BLOGGERS: BloggerCardVM[] = [
  {
    id: "demo-1",
    user_id: "demo-1",
    name: "Ирина Соколова",
    category: "tech",
    gender: "female",
    subscriber_count: 320_000,
    average_price_kopeks: 25_000_000,
    photo_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=640&q=80&auto=format&fit=crop",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    er: 6.2,
    rating: 4.9,
    reviews_count: 47,
    platforms: ["yt", "tg", "ig"],
  },
  {
    id: "demo-2",
    user_id: "demo-2",
    name: "Марк Тимофеев",
    category: "gaming",
    gender: "male",
    subscriber_count: 510_000,
    average_price_kopeks: 18_000_000,
    photo_url: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    er: 5.4,
    rating: 4.8,
    reviews_count: 31,
    platforms: ["yt", "tt"],
  },
];

const audienceOptions = [
  { value: "", label: "Любой охват" },
  { value: "nano", label: "Nano · до 10K" },
  { value: "micro", label: "Micro · 10K–100K" },
  { value: "macro", label: "Macro · 100K–1M" },
  { value: "mega", label: "Mega · от 1M" },
];

const genderOptions = [
  { value: "", label: "Автор — любой" },
  { value: "female", label: "Женский" },
  { value: "male", label: "Мужской" },
  { value: "other", label: "Другое" },
];

const sortOptions = [
  { value: "audience_desc", label: "По охвату" },
  { value: "price_asc", label: "Цена ↑" },
  { value: "price_desc", label: "Цена ↓" },
  { value: "newest", label: "Сначала новые" },
];

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const AlertIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogFallback />}>
      <CatalogContent />
    </Suspense>
  );
}

function CatalogFallback() {
  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <h1 className={`${ui.display} ${styles.headTitle}`}>Авторы</h1>
        </header>
        <div className={styles.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <BloggerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </MarketShell>
  );
}

function CatalogContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [gender, setGender] = useState("");
  const [audience, setAudience] = useState("");
  const [sort, setSort] = useState("audience_desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refNotice, setRefNotice] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      window.localStorage.setItem("marketplace_referral_code", ref);
      if (!isAuthenticated) setRefNotice(true);
    }
  }, [isAuthenticated, searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [category, gender, audience, sort, debouncedSearch]);

  const { data: categories = DEFAULT_MARKETPLACE_CATEGORIES } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: fetchMarketplaceCategories,
    staleTime: 10 * 60 * 1000,
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
    if (category) params.set("category", category);
    if (gender) params.set("gender", gender);
    if (audience) params.set("audience", audience);
    if (debouncedSearch) params.set("q", debouncedSearch);
    return `?${params.toString()}`;
  }, [audience, category, debouncedSearch, gender, page, sort]);

  const { data, isLoading, error, refetch } = useQuery<CatalogResponse>({
    queryKey: ["marketplace-bloggers", queryString],
    queryFn: () => api.getBloggers(queryString),
    placeholderData: (prev) => prev,
  });

  // Демо-карточки: явно по ?demo=1 (и выключаются ?demo=0). Без параметра в
  // dev-режиме показываем демо, пока нет реальных данных (бэкенд недоступен
  // или не отвечает) — чтобы каталог всегда было на чём верстать.
  const demoParam = searchParams.get("demo");
  const demoMode =
    demoParam === "0"
      ? false
      : demoParam != null || (process.env.NODE_ENV !== "production" && !data);
  const items = demoMode ? DEMO_BLOGGERS : data?.items ?? [];
  const total = demoMode ? DEMO_BLOGGERS.length : data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFiltersCount = [category, gender, audience, debouncedSearch].filter(Boolean).length;

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.label.localeCompare(b.label, "ru")),
    [categories],
  );

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Все ниши" }, ...sortedCategories.map((c) => ({ value: c.value, label: c.label }))],
    [sortedCategories],
  );

  const resetFilters = () => {
    setCategory("");
    setGender("");
    setAudience("");
    setSearch("");
    setSort("audience_desc");
  };

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <Reveal as="header" className={styles.head}>
          <h1 className={`${ui.display} ${styles.headTitle}`}>
            Найдите автора для <span className={land.mark}>интеграции</span>
          </h1>
          <p className={`${ui.lead} ${styles.headLead}`}>
            Каждый профиль проходит ручную модерацию. Фильтруйте по нише, охвату и бюджету —
            остальное берёт на себя безопасная сделка.
          </p>
        </Reveal>

        {refNotice && (
          <div className={ui.noticeSuccess} style={{ marginTop: 24 }}>
            Вы пришли по приглашению. Зарегистрируйтесь — оно закрепится за вашим аккаунтом.
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.winBar}>
            <span className={styles.winDots}>
              <span className={styles.winDot} />
              <span className={styles.winDot} />
              <span className={styles.winDot} />
            </span>
            <span className={styles.winUrl}>marketplace.looneymoon.ru/catalog</span>
          </div>

          <div className={styles.winBody}>
            <div className={styles.toolbarTop}>
              <label className={styles.search}>
                <span className={styles.searchIcon}>
                  <SearchIcon />
                </span>
                <input
                  className={styles.searchInput}
                  placeholder="Поиск по имени"
                  aria-label="Поиск по имени или описанию"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            <div className={styles.filters}>
              <Select value={category} onChange={setCategory} options={categoryOptions} ariaLabel="Ниша" />
              <Select value={audience} onChange={setAudience} options={audienceOptions} ariaLabel="Охват" />
              <Select value={gender} onChange={setGender} options={genderOptions} ariaLabel="Пол автора" />
              <Select
                value={sort}
                onChange={setSort}
                options={sortOptions}
                ariaLabel="Сортировка"
                className={styles.sortSelect}
                leadingIcon={<ArrowUpDown size={15} strokeWidth={2} />}
              />
            </div>
          </div>
        </div>

        {!demoMode && error ? (
          <div className={styles.errorState}>
            <span className={styles.errorIcon}>
              <AlertIcon />
            </span>
            <h3 className={styles.errorTitle}>Каталог не загрузился</h3>
            <p className={styles.errorText}>
              Данные не пришли с сервера — похоже, проблемы с соединением. Попробуйте ещё раз.
            </p>
            <button type="button" className={ui.btnPrimary} onClick={() => refetch()}>
              Обновить
            </button>
          </div>
        ) : !demoMode && isLoading && !data ? (
          <div className={styles.grid} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <BloggerCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className={ui.empty} style={{ marginTop: 24 }}>
            <h3 className={ui.emptyTitle}>По этим условиям авторов нет</h3>
            <p className={ui.emptyText}>Снимите один из фильтров — и авторы вернутся в каталог.</p>
            <button type="button" className={ui.btnLine} onClick={resetFilters}>
              Сбросить фильтры{activeFiltersCount > 0 ? ` · ${activeFiltersCount}` : ""}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {items.map((blogger) => (
                <BloggerCardView key={blogger.id} blogger={blogger} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button type="button" className={ui.btnLine} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ← Назад
                </button>
                <span className={styles.pageInfo}>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className={ui.btnLine}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Вперёд →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </MarketShell>
  );
}
