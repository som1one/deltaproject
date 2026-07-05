"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { MarketShell } from "@/components/shell/shell";
import { BloggerCardSkeleton, BloggerCardView, categoryLabel } from "@/components/catalog/blogger-card";
import { Portrait } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatAudience, formatMoney } from "@/lib/format";
import { recordNo } from "@/lib/registry";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import type { BloggerCard, CatalogResponse } from "@/lib/types";

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
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
          <h1 className={`${ui.display} ${styles.headTitle}`}>Указатель авторов</h1>
        </header>
        <div className={styles.list} style={{ marginTop: 32 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.row} aria-hidden="true">
              <span className={styles.rowNum}>{recordNo(i)}</span>
              <span className={ui.skeleton} style={{ height: 26, width: "55%" }} />
              <span />
              <span className={ui.skeleton} style={{ height: 16, width: 80 }} />
              <span />
            </div>
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
  const [view, setView] = useState<"list" | "grid">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;
  const activeFiltersCount = [category, gender, audience, debouncedSearch].filter(Boolean).length;

  const active: BloggerCard | undefined =
    items.find((b) => b.user_id === activeId) ?? items[0];

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
        <header className={styles.head}>
          <span className={ui.brow}>Каталог · Указатель авторов</span>
          <h1 className={`${ui.display} ${styles.headTitle}`}>Избранные авторы реестра</h1>
          <p className={`${ui.lead} ${styles.headLead}`}>
            Каждая запись проходит ручную модерацию. Выберите нишу, охват и бюджет —
            остальное берёт на себя безопасная сделка.
          </p>
        </header>

        {refNotice && (
          <div className={ui.noticeSuccess} style={{ marginTop: 28 }}>
            Вы пришли по приглашению. Зарегистрируйтесь — оно закрепится за вашим аккаунтом.
          </div>
        )}

        {/* ── Тихая панель фильтров ── */}
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

          <select
            className={styles.filterSelect}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Ниша"
          >
            <option value="">Все ниши</option>
            {sortedCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            aria-label="Охват"
          >
            {audienceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            aria-label="Пол автора"
          >
            {genderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Сортировка"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <span className={styles.count}>
            Найдено: <b>{total}</b>
          </span>

          <div className={styles.viewToggle} role="group" aria-label="Вид списка">
            <button
              type="button"
              className={view === "list" ? styles.viewBtnActive : styles.viewBtn}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              Список
            </button>
            <button
              type="button"
              className={view === "grid" ? styles.viewBtnActive : styles.viewBtn}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              Сетка
            </button>
          </div>
        </div>

        {/* ── Результаты ── */}
        {error ? (
          <div className={ui.noticeDanger} style={{ marginTop: 24 }}>
            Каталог не загрузился. Проверьте соединение и обновите страницу.
          </div>
        ) : isLoading && !data ? (
          <div className={view === "grid" ? styles.grid : styles.list} style={{ marginTop: 24 }} aria-busy="true">
            {view === "grid"
              ? Array.from({ length: 6 }, (_, i) => <BloggerCardSkeleton key={i} />)
              : Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className={styles.row} aria-hidden="true">
                    <span className={styles.rowNum}>{recordNo(offset + i)}</span>
                    <span className={ui.skeleton} style={{ height: 26, width: "55%" }} />
                    <span />
                    <span className={ui.skeleton} style={{ height: 16, width: 80 }} />
                    <span />
                  </div>
                ))}
          </div>
        ) : items.length === 0 ? (
          <div className={ui.empty} style={{ marginTop: 24 }}>
            <h3 className={ui.emptyTitle}>По этим условиям авторов нет</h3>
            <p className={ui.emptyText}>
              Снимите один из фильтров — и записи вернутся в указатель.
            </p>
            <button type="button" className={ui.btnLine} onClick={resetFilters}>
              Сбросить фильтры{activeFiltersCount > 0 ? ` · ${activeFiltersCount}` : ""}
            </button>
          </div>
        ) : view === "grid" ? (
          <div className={styles.layoutFull}>
            <div className={styles.grid}>
              {items.map((blogger, index) => (
                <BloggerCardView key={blogger.id} blogger={blogger} index={offset + index} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} styles={styles} ui={ui} />
          </div>
        ) : (
          <div className={styles.layout}>
            <div>
              <div className={styles.list}>
                {items.map((blogger, index) => (
                  <Link
                    key={blogger.id}
                    href={`/bloggers/${blogger.user_id}`}
                    className={`${styles.row} ${active?.user_id === blogger.user_id ? styles.rowActive : ""}`}
                    onMouseEnter={() => setActiveId(blogger.user_id)}
                    onFocus={() => setActiveId(blogger.user_id)}
                  >
                    <span className={styles.rowNum}>{recordNo(offset + index)}</span>
                    <span>
                      <span className={styles.rowName}>{blogger.name}</span>
                      <span className={styles.rowNiche}>{categoryLabel(blogger.category)}</span>
                    </span>
                    <span className={styles.rowReach}>
                      {formatAudience(blogger.subscriber_count)}
                      <span>охват</span>
                    </span>
                    <span className={styles.rowPrice}>
                      {formatMoney(blogger.average_price_kopeks)}
                      <span>интеграция от</span>
                    </span>
                    <span className={styles.rowArrow}>→</span>
                  </Link>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} setPage={setPage} styles={styles} ui={ui} />
            </div>

            {/* Sticky-превью наведённого автора (desktop) */}
            <aside className={styles.aside} aria-hidden="true">
              {active && (
                <>
                  <Portrait
                    key={active.user_id}
                    name={active.name}
                    photoUrl={active.photo_url}
                    className={styles.asidePortrait}
                    monoSize={72}
                  />
                  <div className={styles.asideBody}>
                    <div className={styles.asideName}>{active.name}</div>
                    <div className={styles.asideNiche}>{categoryLabel(active.category)}</div>
                    <div className={`${ui.defList} ${styles.asideFacts}`}>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Охват</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{formatAudience(active.subscriber_count)}</span>
                      </div>
                      <div className={ui.defRow}>
                        <span className={ui.defKey}>Интеграция от</span>
                        <span className={`${ui.defValue} ${ui.mono}`}>{formatMoney(active.average_price_kopeks)}</span>
                      </div>
                    </div>
                    <span className={styles.asideLink}>Открыть досье →</span>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </div>
    </MarketShell>
  );
}

function Pagination({
  page,
  totalPages,
  setPage,
  styles,
  ui,
}: {
  page: number;
  totalPages: number;
  setPage: (fn: (p: number) => number) => void;
  styles: Record<string, string>;
  ui: Record<string, string>;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={styles.pagination}>
      <button
        type="button"
        className={ui.btnLine}
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
      >
        ← Назад
      </button>
      <span className={styles.pageInfo}>
        {String(page).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
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
  );
}
