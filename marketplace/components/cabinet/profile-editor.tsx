"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Link2, GalleryVerticalEnd } from "lucide-react";

import { Portrait, Switch } from "@/components/ui/bits";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { BloggerSelfProfile, MarketplaceCategory } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import { SELF_PROFILE_KEY } from "./keys";
import { LinkListEditor } from "./link-list";
import s from "./cabinet.module.css";

const DESCRIPTION_MAX = 500;
const SOCIALS_MAX = 10;
const PORTFOLIO_MAX = 5;

const cleanLinks = (links: string[]) => links.map((l) => l.trim()).filter(Boolean);

/**
 * «Профиль»: аватар, описание, категория, соцсети и портфолио.
 * Аватар сохраняется сразу после загрузки, остальное — кнопкой
 * «Сохранить профиль». Связь с заказчиком идёт через чат сделки,
 * поэтому отдельного поля контакта нет.
 */
export function ProfileEditor({ profile }: { profile: BloggerSelfProfile }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState(profile.photo_url);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(profile.description ?? "");
  const [category, setCategory] = useState(profile.category ?? "");
  const [socials, setSocials] = useState<string[]>(profile.social_links.length ? profile.social_links : [""]);
  const [showSocials, setShowSocials] = useState(profile.show_socials ?? true);
  const [portfolio, setPortfolio] = useState<string[]>(profile.portfolio_links);
  const [showPortfolio, setShowPortfolio] = useState(profile.show_portfolio ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: categories } = useQuery<MarketplaceCategory[]>({
    queryKey: ["marketplace-categories"],
    queryFn: api.getCategories,
    staleTime: 5 * 60_000,
  });

  const categoryOptions = useMemo(() => {
    const options = (categories ?? []).map((c) => ({ value: c.value, label: c.label }));
    // Текущая категория могла уйти из справочника — не теряем её в селекте.
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
    mutationFn: () =>
      api.updateSelfProfile({
        description: description.trim(),
        category: category || undefined,
        social_links: cleanLinks(socials),
        portfolio_links: cleanLinks(portfolio),
        show_socials: showSocials,
        show_portfolio: showPortfolio,
      }),
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

  return (
    <section className={`${ui.card} ${s.panel}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Профиль</h2>
      </div>
      <p className={s.panelSub}>Эти данные видят заказчики в вашей публичной карточке.</p>

      <div className={s.avatarRow}>
        <div className={s.avatarPortrait}>
          <Portrait name={profile.name} photoUrl={photoUrl} monoSize={30} />
        </div>
        <div className={s.avatarMeta}>
          <button
            type="button"
            className={`${ui.btnLine} ${ui.btnSmall}`}
            style={{ gap: 7 }}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={14} /> {uploading ? "Загружаем…" : photoUrl ? "Заменить фото" : "Загрузить фото"}
          </button>
          <p className={s.avatarHint}>JPG или PNG, лучше квадратное — сохраняется сразу.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="Загрузить фото профиля"
            onChange={(e) => handleAvatar(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className={ui.form}>
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
          <span className={ui.fieldLabel}>
            О себе{" "}
            <span className={s.counter}>
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </span>
          <textarea
            className={ui.textarea}
            rows={4}
            maxLength={DESCRIPTION_MAX}
            value={description}
            placeholder="Чем вы полезны бренду: тематика, форматы, чем гордитесь."
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <div className={s.toggleHead}>
            <span className={s.toggleHeadLabel}>
              <Link2 size={14} /> Соцсети
            </span>
            <span className={s.toggleHeadRight}>
              Показывать в карточке
              <Switch checked={showSocials} onChange={setShowSocials} ariaLabel="Показывать соцсети в карточке" />
            </span>
          </div>
          <LinkListEditor
            items={socials}
            onChange={setSocials}
            max={SOCIALS_MAX}
            placeholder="https://t.me/ваш_канал"
            addLabel="Добавить соцсеть"
            ariaLabel="Соцсети"
          />
        </div>

        <div>
          <div className={s.toggleHead}>
            <span className={s.toggleHeadLabel}>
              <GalleryVerticalEnd size={14} /> Портфолио
            </span>
            <span className={s.toggleHeadRight}>
              Показывать в карточке
              <Switch
                checked={showPortfolio}
                onChange={setShowPortfolio}
                ariaLabel="Показывать портфолио в карточке"
              />
            </span>
          </div>
          <LinkListEditor
            items={portfolio}
            onChange={setPortfolio}
            max={PORTFOLIO_MAX}
            placeholder="https://ссылка-на-публикацию"
            addLabel="Добавить работу"
            ariaLabel="Портфолио"
          />
        </div>

      </div>

      {error && <p className={ui.inputError}>{error}</p>}

      <div className={s.saveRow}>
        <button type="button" className={ui.btnPrimary} disabled={save.isPending} onClick={handleSave}>
          {save.isPending ? "Сохраняем…" : "Сохранить профиль"}
        </button>
        {saved && <span className={s.savedMsg}>Сохранено</span>}
      </div>
    </section>
  );
}
