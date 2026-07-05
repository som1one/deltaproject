"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCardSkeleton, BloggerCardView } from "@/components/catalog/blogger-card";
import { Reveal } from "@/components/ui/motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./catalog.module.css";

const PAGE_SIZE = 12;

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
          <span className={ui.brow}>Каталог</span>
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

  const { data, isLoading, error } = useQuery<CatalogResponse>({
    queryKey: ["marketplace-bloggers", queryString],
    queryFn: () => api.getBloggers(queryString),
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFiltersCount = [category, gender, audience, debouncedSearch].filter(Boolean).length;

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.label.localeCompare(b.label, "ru")),
    [categories],
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
          <span className={ui.brow}>Кураторский каталог</span>
          <h1 className={`${ui.display} ${styles.headTitle}`}>Найдите автора для интеграции</h1>
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

          <select className={styles.filterSelect} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Ниша">
            <option value="">Все ниши</option>
            {sortedCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select className={styles.filterSelect} value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Охват">
            {audienceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select className={styles.filterSelect} value={gender} onChange={(e) => setGender(e.target.value)} aria-label="Пол автора">
            {genderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select className={styles.filterSelect} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <span className={styles.count}>
            Найдено: <b>{total}</b>
          </span>
        </div>

        {error ? (
          <div className={ui.noticeDanger} style={{ marginTop: 24 }}>
            Каталог не загрузился. Проверьте соединение и обновите страницу.
          </div>
        ) : isLoading && !data ? (
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
