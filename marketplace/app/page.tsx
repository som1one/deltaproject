"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

import {
  AdMarketplaceShell,
  BloggerCardSkeleton,
  BloggerCardView,
  PageHeader,
  categoryLabel,
  genderLabel,
  stitchStyles as styles,
  type BloggerCard,
} from "@/components/marketplace/stitch-marketplace";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";

type CatalogResponse = {
  items: BloggerCard[];
  total: number;
  page: number;
  page_size: number;
};

const audienceOptions = [
  { value: "", label: "Все охваты", icon: "🌐" },
  { value: "nano", label: "Nano", sub: "до 10K", icon: "🌱" },
  { value: "micro", label: "Micro", sub: "10K–100K", icon: "📱" },
  { value: "macro", label: "Macro", sub: "100K–1M", icon: "🔥" },
  { value: "mega", label: "Mega", sub: "от 1M", icon: "⚡" },
];

const genderOptions = [
  { value: "", label: "Все" },
  { value: "female", label: "Женский" },
  { value: "male", label: "Мужской" },
  { value: "other", label: "Другое" },
];

const INITIAL_CATEGORY_COUNT = 8;
const skeletonCards = Array.from({ length: 6 }, (_, index) => index);

export default function MarketplaceCatalogPage() {
  return (
    <Suspense fallback={<MarketplaceCatalogFallback />}>
      <MarketplaceCatalogContent />
    </Suspense>
  );
}

function MarketplaceHero({
  total,
  search,
  onSearchChange,
}: {
  total?: number;
  search?: string;
  onSearchChange?: (v: string) => void;
}) {
  const heroStats = [
    { value: total != null ? `${total}+` : "—", label: "Авторов" },
    { value: "24/7", label: "Поддержка" },
    { value: "Telegram", label: "Площадка" },
  ];

  return (
    <PageHeader
      display
      eyebrow="Looney Moon"
      title="Найти идеальный голос"
      lead="Кураторская подборка профессиональных креаторов для брендов, ценящих качество и эстетику."
      stats={heroStats}
      searchValue={search}
      onSearchChange={onSearchChange}
    />
  );
}

function MarketplaceCatalogFallback() {
  return (
    <AdMarketplaceShell>
      <main className={`${styles.main} ${styles.catalogMain}`}>
        <MarketplaceHero />
        <div className={styles.catalogGrid}>
          <aside className={styles.sidebar}>
            <div className={styles.stickyFilters}>
              <SidebarFallback />
            </div>
          </aside>
          <section className={styles.contentColumn} aria-busy="true" aria-live="polite">
            <div className={styles.catalogToolbar}>
              <div className={styles.search}>
                <input className={styles.searchInput} disabled placeholder="Поиск..." />
              </div>
            </div>
            <div className={styles.cardsGrid}>
              {skeletonCards.map((item) => (
                <BloggerCardSkeleton key={item} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </AdMarketplaceShell>
  );
}

function SidebarFallback() {
  return (
    <>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Фильтры</span>
      </div>
      <div className={styles.filterGroup}>
        <div className={styles.filterTitle}>Категории</div>
        <div className={styles.filterBlock}>
          <div className={styles.categoryList}>
            <span className={styles.chipActive}>Все ниши</span>
            {[...DEFAULT_MARKETPLACE_CATEGORIES]
              .sort((a, b) => a.label.localeCompare(b.label, "ru"))
              .slice(0, INITIAL_CATEGORY_COUNT)
              .map((item) => (
                <span className={styles.chip} key={item.value}>
                  {item.label}
                </span>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

function FilterSection({
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.filterGroup}>
      <button
        type="button"
        className={styles.filterTitle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          {badge != null && badge > 0 && (
            <span className={styles.filterBadge}>{badge}</span>
          )}
        </span>
        <svg
          className={styles.filterTitleArrow}
          data-open={open}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.filterBlock}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.6, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MarketplaceCatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated } = useAuth();

  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [audience, setAudience] = useState("");
  const [sort, setSort] = useState("audience_desc");
  const [search, setSearch] = useState("");
  const [categoryLimit, setCategoryLimit] = useState(INITIAL_CATEGORY_COUNT);
  const [message, setMessage] = useState("Здравствуйте! Хочу обсудить рекламную интеграцию.");
  const [selected, setSelected] = useState<BloggerCard | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && !isAuthenticated) {
      setNotice("Вы пришли по реферальной ссылке. Зарегистрируйтесь, чтобы закрепить приглашение и оформить заказ.");
      if (typeof window !== "undefined") {
        window.localStorage.setItem("marketplace_referral_code", ref);
      }
    }
  }, [isAuthenticated, searchParams]);

  const { data: categories = DEFAULT_MARKETPLACE_CATEGORIES } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: fetchMarketplaceCategories,
    staleTime: 10 * 60 * 1000,
  });

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.label.localeCompare(b.label, "ru")),
    [categories],
  );
  const visibleCategories = sortedCategories.slice(0, categoryLimit);
  const hasMoreCategories = categoryLimit < sortedCategories.length;

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page_size: "12", sort });
    if (category) params.set("category", category);
    if (gender) params.set("gender", gender);
    if (audience) params.set("audience", audience);
    if (search.trim()) params.set("q", search.trim());
    return params.toString();
  }, [audience, category, gender, search, sort]);

  const { data, isLoading, error } = useQuery<CatalogResponse>({
    queryKey: ["marketplace-bloggers", queryString],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/bloggers?${queryString}`);
      if (!response.ok) throw new Error("Каталог не загрузился. Проверьте соединение и попробуйте еще раз.");
      return response.json();
    },
  });

  const orderMutation = useMutation({
    mutationFn: async (blogger: BloggerCard) => {
      if (!isAuthenticated) {
        const ref = searchParams.get("ref");
        router.push(`/auth/register${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
        return null;
      }

      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ blogger_id: blogger.user_id, message }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось создать заказ");
      }

      return response.json();
    },
    onSuccess: (order) => {
      if (!order) return;
      setNotice("Заказ создан. Теперь можно перейти к оплате в кабинете клиента.");
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
    },
    onError: (err: Error) => setNotice(err.message),
  });

  const total = data?.total ?? 0;

  // Count active filters for badge
  const activeFiltersCount = [category, gender, audience].filter(Boolean).length;

  const handleResetFilters = () => {
    setCategory("");
    setGender("");
    setAudience("");
    setSearch("");
    setSort("audience_desc");
  };

  return (
    <AdMarketplaceShell>
      <main className={`${styles.main} ${styles.catalogMain}`}>
        <MarketplaceHero
          total={total}
          search={search}
          onSearchChange={setSearch}
        />

        <AnimatePresence>
          {notice && (
            <motion.div
              className={styles.noticeBanner}
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span className={styles.noticeBannerIcon} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <p style={{ margin: 0 }}>{notice}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.catalogGrid}>
          {/* ── Sidebar Filters ── */}
          <aside className={styles.sidebar} aria-label="Фильтры">
            <div className={styles.stickyFilters}>
              <div className={styles.sidebarHeader}>
                <span className={styles.sidebarTitle}>Фильтры</span>
                {activeFiltersCount > 0 && (
                  <button
                    className={styles.ghostButton}
                    onClick={handleResetFilters}
                    type="button"
                    style={{ width: "auto", height: 28, padding: "0 10px", fontSize: 12 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Сбросить ({activeFiltersCount})
                  </button>
                )}
              </div>

              {/* Categories */}
              <FilterSection
                title="Категории"
                defaultOpen={true}
                badge={category ? 1 : 0}
              >
                <div className={styles.categoryList}>
                  <button
                    className={!category ? styles.chipActive : styles.chip}
                    onClick={() => setCategory("")}
                    type="button"
                    id="filter-cat-all"
                  >
                    Все ниши
                  </button>
                  {visibleCategories.map((item) => (
                    <button
                      className={category === item.value ? styles.chipActive : styles.chip}
                      key={item.value}
                      onClick={() => setCategory(item.value)}
                      type="button"
                      id={`filter-cat-${item.value}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {hasMoreCategories && (
                  <button
                    className={styles.categoryLoadButton}
                    onClick={() => setCategoryLimit((value) => value + INITIAL_CATEGORY_COUNT)}
                    type="button"
                  >
                    Показать ещё
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
              </FilterSection>

              {/* Audience */}
              <FilterSection
                title="Охват"
                defaultOpen={true}
                badge={audience ? 1 : 0}
              >
                <div className={styles.checkboxList}>
                  {audienceOptions.map((item) => (
                    <label className={styles.checkboxLabel} key={item.value}>
                      <input
                        checked={audience === item.value}
                        name="audience"
                        onChange={() => setAudience(item.value)}
                        type="radio"
                        id={`filter-audience-${item.value || "all"}`}
                      />
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                        <span style={{ fontSize: 14 }}>{item.icon}</span>
                        <span>
                          {item.label}
                          {"sub" in item && item.sub && (
                            <span style={{ color: "var(--text-soft)", fontSize: 12, marginLeft: 4 }}>
                              {item.sub}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </FilterSection>

              {/* Gender */}
              <FilterSection
                title="Пол"
                defaultOpen={false}
                badge={gender ? 1 : 0}
              >
                <div className={styles.segmentedList}>
                  {genderOptions.map((item) => (
                    <button
                      className={gender === item.value ? styles.chipActive : styles.chip}
                      key={item.value}
                      onClick={() => setGender(item.value)}
                      type="button"
                      id={`filter-gender-${item.value || "all"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {activeFiltersCount > 0 && (
                <button
                  className={styles.ghostButton}
                  onClick={handleResetFilters}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-3.14" />
                  </svg>
                  Сбросить все фильтры
                </button>
              )}
            </div>
          </aside>

          {/* ── Content Column ── */}
          <section className={styles.contentColumn}>
            <div className={styles.catalogToolbar}>
              {/* Compact search in toolbar */}
              <div className={styles.search}>
                <span className={styles.searchIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  className={styles.searchInput}
                  placeholder="Поиск по имени или нише"
                  aria-label="Поиск"
                  id="toolbar-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className={styles.catalogMeta}>
                <span className={styles.resultCount}>
                  Найдено: <span>{total}</span>
                </span>
                <select
                  className={styles.sortSelect}
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  id="sort-select"
                  aria-label="Сортировка"
                >
                  <option value="audience_desc">По аудитории</option>
                  <option value="price_asc">По стоимости ↑</option>
                  <option value="price_desc">По стоимости ↓</option>
                  <option value="newest">Новые</option>
                </select>
              </div>
            </div>

            {isLoading && (
              <div className={styles.cardsGrid} aria-busy="true" aria-live="polite">
                {skeletonCards.map((item) => (
                  <BloggerCardSkeleton key={item} />
                ))}
              </div>
            )}

            {error && (
              <p className={styles.errorText}>
                {error instanceof Error ? error.message : "Каталог не загрузился. Проверьте соединение и попробуйте еще раз."}
              </p>
            )}

            {!isLoading && data?.items.length === 0 && (
              <div className={styles.emptyText}>
                <span className={styles.emptyIcon} aria-hidden="true">🔍</span>
                Под эти фильтры пока нет блогеров.
                <br />
                <button
                  onClick={handleResetFilters}
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--brand-violet)",
                    cursor: "pointer",
                    fontSize: 15,
                    fontWeight: 600,
                    marginTop: 12,
                    display: "inline-block",
                    padding: 0,
                  }}
                >
                  Сбросить фильтры →
                </button>
              </div>
            )}

            {!isLoading && !error && (
              <div className={styles.cardsGrid}>
                {data?.items.map((blogger, index) => (
                  <BloggerCardView
                    blogger={blogger}
                    key={blogger.id}
                    index={index}
                    onOrder={(item) => {
                      setSelected(item);
                      setNotice("");
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Order Form Panel ── */}
        <AnimatePresence>
          {selected && (
            <motion.section
              className={styles.panel}
              style={{ marginTop: 40 }}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4, ease: [0.2, 0.6, 0.2, 1] }}
            >
              <div className={styles.twoColumnGrid}>
                <div>
                  <span className={styles.eyebrow}>Новый проект</span>
                  <h2 className={styles.sectionTitle} style={{ fontSize: 28, marginTop: 8 }}>{selected.name}</h2>
                  <p className={styles.text} style={{ marginTop: 12 }}>
                    Ниша: <strong>{categoryLabel(selected.category)}</strong>.{" "}
                    Бюджет будет рассчитан по цене профиля.
                  </p>
                  {selected.telegram_username && (
                    <p className={styles.handle} style={{ marginTop: 8 }}>
                      @{selected.telegram_username}
                    </p>
                  )}
                </div>
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    orderMutation.mutate(selected);
                  }}
                >
                  <label>
                    <span className={styles.fieldLabel}>Бриф для блогера</span>
                    <textarea
                      className={styles.lineTextarea}
                      maxLength={1000}
                      minLength={1}
                      required
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      id="order-message"
                    />
                  </label>
                  <div className={styles.buttonRow}>
                    <button className={styles.primaryButton} disabled={orderMutation.isPending} type="submit" id="submit-order">
                      {orderMutation.isPending ? "Создаём..." : "Создать заказ"}
                    </button>
                    <button className={styles.secondaryButton} onClick={() => setSelected(null)} type="button" id="cancel-order">
                      Отмена
                    </button>
                  </div>
                </form>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </AdMarketplaceShell>
  );
}
