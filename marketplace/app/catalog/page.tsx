"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCardSkeleton, BloggerCardView } from "@/components/catalog/blogger-card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import type { CatalogResponse } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./catalog.module.css";

const PAGE_SIZE = 12;

const audienceOptions = [
  { value: "", label: "Любой охват", sub: "" },
  { value: "nano", label: "Nano", sub: "до 10K" },
  { value: "micro", label: "Micro", sub: "10K–100K" },
  { value: "macro", label: "Macro", sub: "100K–1M" },
  { value: "mega", label: "Mega", sub: "от 1M" },
];

const genderOptions = [
  { value: "", label: "Не важно" },
  { value: "female", label: "Женский" },
  { value: "male", label: "Мужской" },
  { value: "other", label: "Другое" },
];

const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
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
          <span className={ui.eyebrow}>Каталог</span>
          <h1 className={ui.displayTitle}>Избранные авторы</h1>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refNotice, setRefNotice] = useState(false);

  // Реферальный код воркера: закрепляем до регистрации
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

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFiltersCount = [category, gender, audience].filter(Boolean).length;

  const resetFilters = () => {
    setCategory("");
    setGender("");
    setAudience("");
    setSearch("");
    setSort("audience_desc");
  };

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.label.localeCompare(b.label, "ru")),
    [categories],
  );

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <span className={ui.eyebrow}>Каталог</span>
          <h1 className={ui.displayTitle}>Избранные авторы</h1>
          <p className={ui.lead}>
            Каждый профиль проходит модерацию. Выберите нишу, охват и бюджет —
            остальное сделает безопасная сделка.
          </p>
        </header>

        {refNotice && (
          <div className={ui.noticeSuccess} style={{ marginBottom: 24 }}>
            Вы пришли по приглашению. Зарегистрируйтесь — приглашение закрепится за вашим аккаунтом.
          </div>
        )}

        <div className={styles.layout}>
          <aside
            className={`${styles.sidebar} ${filtersOpen ? styles.sidebarOpen : ""}`}
            aria-label="Фильтры"
          >
            <div className={styles.filterGroup}>
              <span className={styles.filterTitle}>
                Ниша
                {activeFiltersCount > 0 && (
                  <button type="button" className={styles.resetBtn} onClick={resetFilters}>
                    Сбросить
                  </button>
                )}
              </span>
              <div className={styles.filterList}>
                <button
                  type="button"
                  className={category === "" ? ui.chipActive : ui.chip}
                  onClick={() => setCategory("")}
                >
                  Все
                </button>
                {sortedCategories.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={category === item.value ? ui.chipActive : ui.chip}
                    onClick={() => setCategory(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterTitle}>Охват</span>
              <div className={styles.radioList}>
                {audienceOptions.map((item) => (
                  <label key={item.value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="audience"
                      checked={audience === item.value}
                      onChange={() => setAudience(item.value)}
                    />
                    {item.label}
                    {item.sub && <span className={styles.radioSub}>{item.sub}</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterTitle}>Пол автора</span>
              <div className={styles.radioList}>
                {genderOptions.map((item) => (
                  <label key={item.value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="gender"
                      checked={gender === item.value}
                      onChange={() => setGender(item.value)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          </aside>

          <section>
            <div className={styles.toolbar}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>
                  <SearchIcon />
                </span>
                <input
                  className={styles.searchInput}
                  placeholder="Поиск по имени или описанию"
                  aria-label="Поиск"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={`${ui.btnGhost} ${styles.mobileFiltersBtn}`}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                Фильтры{activeFiltersCount > 0 ? ` · ${activeFiltersCount}` : ""}
              </button>
              <div className={styles.toolbarMeta}>
                <span className={styles.count}>
                  Найдено: <b>{total}</b>
                </span>
                <select
                  className={styles.sortSelect}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Сортировка"
                >
                  <option value="audience_desc">По аудитории</option>
                  <option value="price_asc">Цена: по возрастанию</option>
                  <option value="price_desc">Цена: по убыванию</option>
                  <option value="newest">Сначала новые</option>
                </select>
              </div>
            </div>

            {error ? (
              <div className={ui.noticeDanger}>
                Каталог не загрузился. Проверьте соединение и попробуйте ещё раз.
              </div>
            ) : isLoading && !data ? (
              <div className={styles.grid} aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <BloggerCardSkeleton key={i} />
                ))}
              </div>
            ) : data && data.items.length === 0 ? (
              <div className={ui.empty}>
                <h3 className={ui.emptyTitle}>Никого не нашлось</h3>
                <p className={ui.muted}>Попробуйте смягчить фильтры или изменить запрос.</p>
                <button type="button" className={ui.btnSecondary} onClick={resetFilters} style={{ marginTop: 18 }}>
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              <>
                <div className={styles.grid}>
                  {data?.items.map((blogger, index) => (
                    <BloggerCardView key={blogger.id} blogger={blogger} index={index} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className={styles.pagination}>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Назад
                    </button>
                    <span className={styles.pageInfo}>
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Вперёд →
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </MarketShell>
  );
}
