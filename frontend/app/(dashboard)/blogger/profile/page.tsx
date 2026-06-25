"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AdMarketplaceShell, PageHeader, stitchStyles as styles } from "@/components/marketplace/stitch-marketplace";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";
import { appConfig } from "@/lib/config";
import { DEFAULT_MARKETPLACE_CATEGORIES, fetchMarketplaceCategories } from "@/lib/marketplace-categories";
import { useAuth } from "@/lib/auth-context";

type BloggerProfileData = {
  id: string;
  category: string;
  gender: "female" | "male" | "other" | null;
  subscriber_count: number;
  average_price_kopeks: number;
  description: string;
  portfolio_links: string[];
  social_links: string[];
  photo_url: string | null;
  preferred_contact: string | null;
  is_active: boolean;
  orders_enabled: boolean;
};

export default function BloggerProfilePage() {
  const router = useRouter();
  const { accessToken, isAuthenticated, isHydrated } = useAuth();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [subscriberCount, setSubscriberCount] = useState("");
  const [priceRubles, setPriceRubles] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [preferredContact, setPreferredContact] = useState("");
  const [socialLinks, setSocialLinks] = useState<string[]>([""]);
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([""]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace(`${appConfig.marketplaceUrl}/auth/login?next=/blogger/profile`);
  }, [isAuthenticated, isHydrated, router]);

  const { data: categoryOptions = DEFAULT_MARKETPLACE_CATEGORIES } = useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: fetchMarketplaceCategories,
    staleTime: 10 * 60 * 1000,
  });

  const { data: profile, isLoading } = useQuery<BloggerProfileData | null>({
    queryKey: ["blogger-marketplace-profile"],
    queryFn: async () => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/blogger/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Не удалось загрузить профиль");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!profile) return;
    setCategory(profile.category);
    setGender(profile.gender ?? "");
    setSubscriberCount(String(profile.subscriber_count));
    setPriceRubles(String(profile.average_price_kopeks / 100));
    setDescription(profile.description);
    setPhotoUrl(profile.photo_url ?? "");
    setPreferredContact(profile.preferred_contact ?? "");
    setSocialLinks(profile.social_links.length ? profile.social_links : [""]);
    setPortfolioLinks(profile.portfolio_links.length ? profile.portfolio_links : [""]);
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const social = socialLinks.map((item) => item.trim()).filter(Boolean);
      const portfolio = portfolioLinks.map((item) => item.trim()).filter(Boolean);
      if (!category) throw new Error("Выберите категорию");
      if (social.length === 0) throw new Error("Добавьте хотя бы одну ссылку на соцсеть");

      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/blogger/profile`, {
        method: profile ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          category,
          gender: gender || null,
          subscriber_count: Number(subscriberCount),
          average_price_kopeks: Math.round(Number(priceRubles.replace(",", ".")) * 100),
          description: description.trim(),
          social_links: social,
          portfolio_links: portfolio,
          photo_url: photoUrl.trim() || null,
          preferred_contact: preferredContact.trim() || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Не удалось сохранить профиль");
      }

      return response.json();
    },
    onSuccess: () => {
      setError("");
      setNotice(profile ? "Профиль обновлён." : "Профиль создан и появится в каталоге.");
      queryClient.invalidateQueries({ queryKey: ["blogger-marketplace-profile"] });
    },
    onError: (err: Error) => {
      setNotice("");
      setError(err.message);
    },
  });

  const updateList = (list: string[], index: number, value: string, setter: (next: string[]) => void) => {
    const next = [...list];
    next[index] = value;
    setter(next);
  };

  return (
    <AdMarketplaceShell>
      <main className={styles.main}>
        <PageHeader
          eyebrow="Creator profile"
          title={profile ? "Редактирование профиля" : "Заполните профиль"}
          lead="Эти данные формируют карточку в каталоге: ниша, аудитория, бюджет, описание и ссылки для проверки."
        />

        {isLoading && <LoadingSpinner text="Загружаем профиль..." />}

        <section className={styles.panel}>
          {notice && <p className={styles.successText}>{notice}</p>}
          {error && <p className={styles.errorText}>{error}</p>}
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Категория</span>
                <select className={styles.lineSelect} value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Выберите категорию</option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Пол</span>
                <select className={styles.lineSelect} value={gender} onChange={(event) => setGender(event.target.value)}>
                  <option value="">Не указан</option>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                  <option value="other">Другое</option>
                </select>
              </label>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Количество подписчиков</span>
                <input
                  className={styles.lineInput}
                  min={1}
                  type="number"
                  value={subscriberCount}
                  onChange={(event) => setSubscriberCount(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Средняя цена за рекламу, ₽</span>
                <input
                  className={styles.lineInput}
                  min={1}
                  type="number"
                  value={priceRubles}
                  onChange={(event) => setPriceRubles(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Предпочтительный контакт</span>
                <input
                  className={styles.lineInput}
                  placeholder="@telegram или email"
                  value={preferredContact}
                  onChange={(event) => setPreferredContact(event.target.value)}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Описание</span>
              <textarea
                className={styles.lineTextarea}
                maxLength={500}
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Фото профиля, URL</span>
              <input
                className={styles.lineInput}
                placeholder="https://..."
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
              />
            </label>

            <div className={styles.twoColumnGrid}>
              <div>
                <h2 className={styles.cardTitle}>Социальные сети</h2>
                <div className={styles.list} style={{ marginTop: "16px" }}>
                  {socialLinks.map((link, index) => (
                    <input
                      className={styles.lineInput}
                      key={index}
                      placeholder="https://..."
                      value={link}
                      onChange={(event) => updateList(socialLinks, index, event.target.value, setSocialLinks)}
                    />
                  ))}
                </div>
                <button className={styles.ghostButton} onClick={() => setSocialLinks([...socialLinks, ""])} type="button">
                  Добавить ссылку
                </button>
              </div>
              <div>
                <h2 className={styles.cardTitle}>Портфолио</h2>
                <div className={styles.list} style={{ marginTop: "16px" }}>
                  {portfolioLinks.map((link, index) => (
                    <input
                      className={styles.lineInput}
                      key={index}
                      placeholder="https://..."
                      value={link}
                      onChange={(event) => updateList(portfolioLinks, index, event.target.value, setPortfolioLinks)}
                    />
                  ))}
                </div>
                <button className={styles.ghostButton} onClick={() => setPortfolioLinks([...portfolioLinks, ""])} type="button">
                  Добавить кейс
                </button>
              </div>
            </div>

            <button className={styles.primaryButton} disabled={saveMutation.isPending} type="submit">
              {saveMutation.isPending ? "Сохраняем..." : profile ? "Сохранить изменения" : "Создать профиль"}
            </button>
          </form>
        </section>
      </main>
    </AdMarketplaceShell>
  );
}
