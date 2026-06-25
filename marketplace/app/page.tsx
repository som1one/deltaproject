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
  { value: "", label: "Все охваты" },
  { value: "nano", label: "Nano до 10k" },
  { value: "micro", label: "Micro 10k-100k" },
  { value: "macro", label: "Macro 100k-1M" },
  { value: "mega", label: "Mega от 1M" },
];

const genderOptions = [
  { value: "", label: "Все" },
  { value: "female", label: "Женский" },
  { value: "male", label: "Мужской" },
  { value: "other", label: "Другое" },
];

const INITIAL_CATEGORY_COUNT = 7;
const skeletonCards = Array.from({ length: 6 }, (_, index) => index);

export default function MarketplaceCatalogPage() {
  return (
    <Suspense fallback={<MarketplaceCatalogFallback />}>
      <MarketplaceCatalogContent />
    </Suspense>
  );
}

function MarketplaceHero({ total }: { total?: number }) {
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
      lead="Кураторская подборка профессиональных креаторов для брендов, ценящих качество и эстетику. Фильтруйте по аудитории, охватам и нишам."
      stats={heroStats}
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
              <div className={styles.filterBlock}>
                <h3 className={styles.filterTitle}>Категории</h3>
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
              {/* Other filters omitted for fallback skeleton */}
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

  return (
    <AdMarketplaceShell>
      <main className={`${styles.main} ${styles.catalogMain}`}>
        <MarketplaceHero total={total} />

        <AnimatePresence>
          {notice && (
            <motion.section
              className={styles.panel}
              style={{ marginBottom: "32px", borderColor: "var(--status-success)" }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <p className={styles.successText}>{notice}</p>
            </motion.section>
          )}
        </AnimatePresence>

        <div className={styles.catalogGrid}>
          <aside className={styles.sidebar}>
            <div className={styles.stickyFilters}>
              <div className={styles.filterBlock}>
                <h3 className={styles.filterTitle}>Категории</h3>
                <div className={styles.categoryList}>
                  <button className={!category ? styles.chipActive : styles.chip} onClick={() => setCategory("")} type="button">
                    Все ниши
                  </button>
                  {visibleCategories.map((item) => (
                    <button
                      className={category === item.value ? styles.chipActive : styles.chip}
                      key={item.value}
                      onClick={() => setCategory(item.value)}
                      type="button"
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
                  </button>
                )}
              </div>

              <div className={styles.filterBlock}>
                <h3 className={styles.filterTitle}>Пол</h3>
                <div className={styles.segmentedList}>
                  {genderOptions.map((item) => (
                    <button
                      className={gender === item.value ? styles.chipActive : styles.chip}
                      key={item.value}
                      onClick={() => setGender(item.value)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.filterBlock}>
                <h3 className={styles.filterTitle}>Охват</h3>
                <div className={styles.checkboxList}>
                  {audienceOptions.map((item) => (
                    <label className={styles.checkboxLabel} key={item.value}>
                      <input
                        checked={audience === item.value}
                        name="audience"
                        onChange={() => setAudience(item.value)}
                        type="radio"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                className={styles.ghostButton}
                onClick={() => {
                  setCategory("");
                  setGender("");
                  setAudience("");
                  setSearch("");
                  setSort("audience_desc");
                }}
                type="button"
              >
                Сбросить фильтры
              </button>
            </div>
          </aside>

          <section className={styles.contentColumn}>
            <div className={styles.catalogToolbar}>
              <div className={styles.search}>
                <span className={styles.searchIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  className={styles.searchInput}
                  placeholder="Поиск по имени или нише"
                  aria-label="Поиск"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className={styles.catalogMeta}>
                <span>Найдено: {total}</span>
                <select className={styles.sortSelect} value={sort} onChange={(event) => setSort(event.target.value)}>
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
              <p className={styles.emptyText}>
                Под эти фильтры пока нет блогеров. Сбросьте фильтры или выберите другую нишу.
              </p>
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

        <AnimatePresence>
          {selected && (
            <motion.section
              className={styles.panel}
              style={{ marginTop: "32px" }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4 }}
            >
              <div className={styles.twoColumnGrid}>
                <div>
                  <span className={styles.eyebrow}>Новый проект</span>
                  <h2 className={styles.sectionTitle}>{selected.name}</h2>
                  <p className={styles.text} style={{ marginTop: 16 }}>
                    Ниша: {categoryLabel(selected.category)}. Бюджет будет рассчитан по цене профиля.
                  </p>
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
                    />
                  </label>
                  <div className={styles.buttonRow}>
                    <button className={styles.primaryButton} disabled={orderMutation.isPending} type="submit">
                      {orderMutation.isPending ? "Создаём..." : "Создать заказ"}
                    </button>
                    <button className={styles.secondaryButton} onClick={() => setSelected(null)} type="button">
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
