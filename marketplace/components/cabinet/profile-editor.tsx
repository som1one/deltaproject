"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlignLeft, Camera, ChevronDown, GalleryVerticalEnd, Link2, UserRound } from "lucide-react";

import { Portrait, Switch } from "@/components/ui/bits";
import { Select } from "@/components/ui/select";
import { plural } from "@/components/chat/chat-utils";
import { api } from "@/lib/api";
import type { BloggerSelfProfile, MarketplaceCategory } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { SELF_PROFILE_KEY } from "./keys";
import { LinkListEditor, PortfolioListEditor, type PortfolioItem } from "./link-list";
import s from "./cabinet.module.css";

const DESCRIPTION_MAX = 500;
const SOCIALS_MAX = 10;
const PORTFOLIO_MAX = 5;

// Значения совпадают с BloggerGender бэкенда и фильтром «Автор» в каталоге.
const GENDER_OPTIONS = [
  { value: "", label: "Не указан" },
  { value: "female", label: "Женский" },
  { value: "male", label: "Мужской" },
  { value: "other", label: "Другое" },
];

const cleanLinks = (links: string[]) => links.map((l) => l.trim()).filter(Boolean);

type ProfileSection = "main" | "about" | "socials" | "portfolio";

/**
 * «Профиль»: спокойная read-only сводка (аватар, имя, категория, метрики),
 * а редактирование спрятано в аккордеон под-разделов — раскрывается по одному.
 * Ничего не открыто по умолчанию. Аватар меняется прямо в шапке (сохраняется
 * сразу), остальное — кнопкой «Сохранить профиль». Связь идёт через чат сделки,
 * поэтому отдельного поля контакта нет.
 */
export function ProfileEditor({ profile }: { profile: BloggerSelfProfile }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState(profile.photo_url);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(profile.description ?? "");
  const [category, setCategory] = useState(profile.category ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [socials, setSocials] = useState<string[]>(profile.social_links.length ? profile.social_links : [""]);
  const [showSocials, setShowSocials] = useState(profile.show_socials ?? true);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(() =>
    profile.portfolio_links.map((url, i) => ({ url, cover: profile.portfolio_covers?.[i] ?? null })),
  );
  const [showPortfolio, setShowPortfolio] = useState(profile.show_portfolio ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Какой под-раздел раскрыт (null = всё свёрнуто, чистая сводка).
  const [open, setOpen] = useState<ProfileSection | null>(null);
  const toggle = (k: ProfileSection) => setOpen((p) => (p === k ? null : k));
  const uid = useId();
  const openBodyRef = useRef<HTMLDivElement>(null);
  // Раскрытая секция подтягивается в зону видимости (важно на узкой ширине).
  useEffect(() => {
    if (open) openBodyRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const { data: categories } = useQuery<MarketplaceCategory[]>({
    queryKey: ["marketplace-categories"],
    queryFn: api.getCategories,
    staleTime: 5 * 60_000,
  });

  const categoryOptions = useMemo(() => {
    const options = (categories ?? []).map((c) => ({ value: c.value, label: c.label }));
    if (category && !options.some((o) => o.value === category)) {
      options.unshift({ value: category, label: category });
    }
    return options;
  }, [categories, category]);

  const handleAvatar = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      await api.updateSelfProfile({ photo_url: url });
      setPhotoUrl(url);
      queryClient.invalidateQueries({ queryKey: SELF_PROFILE_KEY });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = useMutation({
    mutationFn: () => {
      // Пустые строки выбрасываем парой «ссылка + обложка», чтобы массивы не разъехались
      const works = portfolio
        .map((it) => ({ url: it.url.trim(), cover: it.cover }))
        .filter((it) => it.url);
      return api.updateSelfProfile({
        description: description.trim(),
        category: category || undefined,
        gender: gender || null,
        social_links: cleanLinks(socials),
        portfolio_links: works.map((it) => it.url),
        portfolio_covers: works.map((it) => it.cover),
        show_socials: showSocials,
        show_portfolio: showPortfolio,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SELF_PROFILE_KEY });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось сохранить профиль"),
  });

  const handleSave = () => {
    setError(null);
    if (!description.trim()) {
      setError("Расскажите о себе — описание не может быть пустым.");
      return;
    }
    if (cleanLinks(socials).length === 0) {
      setError("Добавьте хотя бы одну ссылку на соцсеть — по ней заказчики понимают, кто вы.");
      return;
    }
    save.mutate();
  };

  // «Сохранить»: раскрываем первую невалидную группу, затем прежняя валидация.
  const submit = () => {
    if (!description.trim()) setOpen("about");
    else if (cleanLinks(socials).length === 0) setOpen("socials");
    handleSave();
  };

  // ── Производные значения для сводки и summary-строк ──
  const categoryLabel =
    categoryOptions.find((o) => o.value === category)?.label || category || "Категория не выбрана";

  const socialCount = cleanLinks(socials).length;
  const portfolioCount = portfolio.filter((it) => it.url.trim()).length;
  const socialSummary =
    (socialCount ? `${socialCount} ${plural(socialCount, ["ссылка", "ссылки", "ссылок"])}` : "Не добавлены") +
    ` · ${showSocials ? "видно" : "скрыто"} в карточке`;
  const portfolioSummary =
    (portfolioCount ? `${portfolioCount} ${plural(portfolioCount, ["работа", "работы", "работ"])}` : "Пусто") +
    ` · ${showPortfolio ? "видно" : "скрыто"} в карточке`;

  const nf = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
  const stats: string[] = [];
  if (profile.subscriber_count) stats.push(`${nf.format(profile.subscriber_count)} подписчиков`);
  if (profile.rating) stats.push(`★ ${profile.rating.toFixed(1)}`);
  if (profile.reviews_count)
    stats.push(`${profile.reviews_count} ${plural(profile.reviews_count, ["отзыв", "отзыва", "отзывов"])}`);

  const hid = (k: ProfileSection) => `${uid}-${k}-h`;
  const bid = (k: ProfileSection) => `${uid}-${k}-b`;

  const groups: { key: ProfileSection; title: string; summary: string; icon: typeof UserRound; empty?: boolean }[] = [
    { key: "main", title: "Основное", summary: "Фото, категория и пол", icon: UserRound },
    {
      key: "about",
      title: "О себе",
      summary: description.trim() || "Пока не заполнено",
      icon: AlignLeft,
      empty: !description.trim(),
    },
    { key: "socials", title: "Соцсети", summary: socialSummary, icon: Link2 },
    { key: "portfolio", title: "Портфолио", summary: portfolioSummary, icon: GalleryVerticalEnd },
  ];

  return (
    <section className={`${ui.card} ${s.panel}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Профиль</h2>
      </div>
      <p className={s.panelSub}>Так ваша карточка выглядит для заказчиков. Меняйте по разделам ниже.</p>

      {/* ── Сводка «кто вы» (только чтение; фото меняется по клику) ── */}
      <div className={s.idHead}>
        <button
          type="button"
          className={s.idAvatarBtn}
          data-uploading={uploading || undefined}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          aria-label={photoUrl ? "Заменить фото профиля" : "Загрузить фото профиля"}
        >
          <Portrait name={profile.name} photoUrl={photoUrl} className={s.idAvatarImg} monoSize={24} />
          <span className={s.idAvatarOverlay} aria-hidden="true">
            <Camera size={16} />
          </span>
        </button>
        <div className={s.idInfo}>
          <span className={s.idName}>{profile.name}</span>
          <span className={s.idCat}>{categoryLabel}</span>
          {stats.length > 0 && (
            <div className={s.idStats}>
              {stats.map((t, i) => (
                <span key={i} className={s.idStat}>
                  {i > 0 && (
                    <span className={s.idDot} aria-hidden="true">
                      ·
                    </span>
                  )}
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Единый скрытый input — доступен и из шапки, и из «Основное» */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Загрузить фото профиля"
        onChange={(e) => handleAvatar(e.target.files?.[0])}
      />

      {/* ── Аккордеон под-разделов: редактирование спрятано ── */}
      <div className={s.acc}>
        {groups.map((g) => (
          <div key={g.key} className={`${s.accGroup} ${open === g.key ? s.accGroupOpen : ""}`.trim()}>
            <button
              type="button"
              className={s.accHead}
              id={hid(g.key)}
              aria-expanded={open === g.key}
              aria-controls={bid(g.key)}
              onClick={() => toggle(g.key)}
            >
              <span className={s.accIcon}>
                <g.icon size={17} />
              </span>
              <span className={s.accText}>
                <span className={s.accTitle}>{g.title}</span>
                <span className={`${s.accSummary} ${g.empty ? s.accSummaryEmpty : ""}`.trim()}>{g.summary}</span>
              </span>
              <ChevronDown
                size={18}
                className={`${s.accChev} ${open === g.key ? s.accChevOpen : ""}`.trim()}
                aria-hidden="true"
              />
            </button>

            {open === g.key && (
              <div className={s.accBody} id={bid(g.key)} role="region" aria-labelledby={hid(g.key)} ref={openBodyRef}>
                {g.key === "main" && (
                  <>
                    <div className={s.mainPhoto}>
                      <button
                        type="button"
                        className={`${ui.btnLine} ${ui.btnSmall}`}
                        style={{ gap: 7 }}
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Camera size={14} />{" "}
                        {uploading ? "Загружаем…" : photoUrl ? "Заменить фото" : "Загрузить фото"}
                      </button>
                      <span className={s.avatarHint}>JPG или PNG, лучше квадратное — сохраняется сразу.</span>
                    </div>
                    <div className={ui.field}>
                      <span className={ui.fieldLabel}>Категория</span>
                      <Select
                        value={category}
                        onChange={setCategory}
                        options={categoryOptions.length ? categoryOptions : [{ value: "", label: "Загружаем…" }]}
                        ariaLabel="Категория контента"
                      />
                    </div>
                    <div className={ui.field}>
                      <span className={ui.fieldLabel}>Пол</span>
                      <Select
                        value={gender}
                        onChange={setGender}
                        options={GENDER_OPTIONS}
                        ariaLabel="Пол автора"
                      />
                      <span className={ui.fieldHint}>По нему работает фильтр «Автор» в каталоге.</span>
                    </div>
                  </>
                )}

                {g.key === "about" && (
                  <>
                    <textarea
                      className={ui.textarea}
                      rows={4}
                      maxLength={DESCRIPTION_MAX}
                      value={description}
                      placeholder="Чем вы полезны бренду: тематика, форматы, чем гордитесь."
                      onChange={(e) => setDescription(e.target.value)}
                    />
                    <div className={s.charRow}>
                      <span className={s.counter}>
                        {description.length}/{DESCRIPTION_MAX}
                      </span>
                    </div>
                  </>
                )}

                {g.key === "socials" && (
                  <>
                    <div className={s.visRow}>
                      <span className={s.visLabel}>Показывать в карточке</span>
                      <Switch checked={showSocials} onChange={setShowSocials} ariaLabel="Показывать соцсети в карточке" />
                    </div>
                    <LinkListEditor
                      items={socials}
                      onChange={setSocials}
                      max={SOCIALS_MAX}
                      placeholder="https://t.me/ваш_канал"
                      addLabel="Добавить соцсеть"
                      ariaLabel="Соцсети"
                    />
                  </>
                )}

                {g.key === "portfolio" && (
                  <>
                    <div className={s.visRow}>
                      <span className={s.visLabel}>Показывать в карточке</span>
                      <Switch
                        checked={showPortfolio}
                        onChange={setShowPortfolio}
                        ariaLabel="Показывать портфолио в карточке"
                      />
                    </div>
                    <PortfolioListEditor
                      items={portfolio}
                      onChange={setPortfolio}
                      max={PORTFOLIO_MAX}
                      onError={setError}
                    />
                    <span className={ui.fieldHint}>
                      Квадрат слева — обложка работы: с ней публикация в карточке выглядит как превью, а не
                      ссылка.
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className={ui.noticeDanger} style={{ marginTop: 14 }}>{error}</p>}

      <div className={s.saveRow}>
        <button type="button" className={ui.btnPrimary} disabled={save.isPending} onClick={submit}>
          {save.isPending ? "Сохраняем…" : "Сохранить профиль"}
        </button>
        {saved && <span className={s.savedMsg}>Сохранено</span>}
      </div>
    </section>
  );
}
