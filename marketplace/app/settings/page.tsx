"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { Portrait, Switch } from "@/components/ui/bits";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  chatNotificationsActive,
  notificationsSupported,
  requestChatNotifications,
  setChatNotifyFlag,
} from "@/lib/chat-notifications";
import type { UserMeRead } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";
import styles from "./settings.module.css";

type Notice = { tone: "success" | "danger"; text: string } | null;

const errText = (err: Error, fallback: string) =>
  err instanceof ApiError && err.message ? err.message : fallback;

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, isWorker, isClient, applyUserPhoto } = useAuth();

  // Блогеры и заказчики общаются только в чате платформы — контактных
  // мессенджеров у них в профиле нет. Telegram остаётся воркерам: с ними
  // платформа связывается напрямую.
  const showTelegram = isWorker;

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/auth/login?next=/settings");
  }, [isAuthenticated, isHydrated, router]);

  const authed = isHydrated && isAuthenticated;

  const { data: me } = useQuery<UserMeRead>({
    queryKey: ["marketplace-me"],
    queryFn: api.getMe,
    enabled: authed,
  });

  // ── Уведомления чата ──
  const [notifySupported, setNotifySupported] = useState(true);
  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyNotice, setNotifyNotice] = useState<Notice>(null);

  useEffect(() => {
    setNotifySupported(notificationsSupported());
    setNotifyOn(chatNotificationsActive());
  }, []);

  const toggleNotify = async (next: boolean) => {
    setNotifyNotice(null);
    if (!next) {
      setChatNotifyFlag(false);
      setNotifyOn(false);
      return;
    }
    const permission = await requestChatNotifications();
    if (permission === "granted") {
      setChatNotifyFlag(true);
      setNotifyOn(true);
    } else {
      setNotifyOn(false);
      setNotifyNotice({
        tone: "danger",
        text: "Браузер запретил уведомления для этого сайта. Разрешите их в настройках браузера (значок замка в адресной строке) и включите переключатель ещё раз.",
      });
    }
  };

  // ── Профиль ──
  const [form, setForm] = useState({ name: "", email: "", telegram: "" });
  const [profileNotice, setProfileNotice] = useState<Notice>(null);

  // ── Аватар (только заказчик; фото автора живёт в кабинете) ──
  const showAvatar = isClient;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleAvatar = async (file: File | undefined) => {
    if (!file) return;
    setProfileNotice(null);
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      const updated = await api.updateMe({ photo_url: url });
      queryClient.setQueryData(["marketplace-me"], updated);
      applyUserPhoto(url);
    } catch (err) {
      setProfileNotice({
        tone: "danger",
        text: err instanceof Error && err.message ? err.message : "Не удалось загрузить фото.",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  useEffect(() => {
    if (me) setForm({ name: me.name ?? "", email: me.email ?? "", telegram: me.telegram ?? "" });
  }, [me]);

  const profileMutation = useMutation({
    mutationFn: (body: { name?: string; email?: string; telegram?: string }) => api.updateMe(body),
    onSuccess: (data) => {
      setProfileNotice({ tone: "success", text: "Профиль обновлён." });
      queryClient.setQueryData(["marketplace-me"], data);
    },
    onError: (err: Error) => setProfileNotice({ tone: "danger", text: errText(err, "Не удалось сохранить.") }),
  });

  const submitProfile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileNotice(null);
    const changed: { name?: string; email?: string; telegram?: string } = {};
    if (form.name.trim() !== (me?.name ?? "")) changed.name = form.name.trim();
    if (form.email.trim() !== (me?.email ?? "")) changed.email = form.email.trim();
    if (form.telegram.trim() !== (me?.telegram ?? "")) changed.telegram = form.telegram.trim();
    if (Object.keys(changed).length === 0) {
      setProfileNotice({ tone: "danger", text: "Нет изменений для сохранения." });
      return;
    }
    profileMutation.mutate(changed);
  };

  // ── Пароль ──
  const [pw, setPw] = useState({ current_password: "", password: "" });
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  const passwordMutation = useMutation({
    mutationFn: (body: { password: string; current_password: string }) => api.updateMe(body),
    onSuccess: () => {
      setPwNotice({ tone: "success", text: "Пароль изменён." });
      setPw({ current_password: "", password: "" });
    },
    onError: (err: Error) => setPwNotice({ tone: "danger", text: errText(err, "Не удалось изменить пароль.") }),
  });

  const submitPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwNotice(null);
    passwordMutation.mutate({ password: pw.password, current_password: pw.current_password });
  };

  if (!authed) {
    return (
      <MarketShell>
        <div className={shell.pageContainer}>
          <div className={styles.head}>
            <div className={ui.skeleton} style={{ height: 80, width: "100%", maxWidth: 340 }} />
          </div>
        </div>
      </MarketShell>
    );
  }

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <Link href="/cabinet" className={styles.backLink}>
            <ArrowLeft size={15} /> В кабинет
          </Link>
          <h1 className={styles.title}>
            <span className={s.mark}>Настройки аккаунта</span>
          </h1>
          <p className={styles.sub}>
            {showTelegram
              ? "Профиль и безопасность: обновите имя, почту и Telegram или смените пароль."
              : showAvatar
                ? "Профиль и безопасность: обновите фото, имя и почту или смените пароль."
                : "Профиль и безопасность: обновите имя и почту или смените пароль."}
          </p>
        </header>

        <div className={styles.sections}>
          {/* Профиль */}
          <section className={styles.section}>
            <div>
              <h2 className={styles.sectionTitle}>Профиль</h2>
              <p className={styles.sectionDesc}>
                {showTelegram
                  ? "Имя, почта и Telegram для связи по сделкам."
                  : showAvatar
                    ? "Фото, имя и почта аккаунта. Фото видят авторы в чате по сделкам."
                    : "Имя и почта аккаунта. Общение по сделкам — в чате платформы."}
              </p>
            </div>
            <div className={styles.sectionBody}>
              {profileNotice && (
                <div
                  className={profileNotice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
                  style={{ marginBottom: 16 }}
                >
                  {profileNotice.text}
                </div>
              )}
              {showAvatar && (
                <div className={styles.avatarRow}>
                  <button
                    type="button"
                    className={styles.avatarBtn}
                    data-uploading={uploading || undefined}
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    aria-label={me?.photo_url ? "Заменить фото профиля" : "Загрузить фото профиля"}
                  >
                    <Portrait
                      name={me?.name ?? form.name}
                      photoUrl={me?.photo_url}
                      className={styles.avatarImg}
                      monoSize={22}
                    />
                    <span className={styles.avatarOverlay} aria-hidden="true">
                      <Camera size={15} />
                    </span>
                  </button>
                  <div className={styles.avatarMeta}>
                    <button
                      type="button"
                      className={`${ui.btnLine} ${ui.btnSmall}`}
                      style={{ gap: 7 }}
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Camera size={14} />{" "}
                      {uploading ? "Загружаем…" : me?.photo_url ? "Заменить фото" : "Загрузить фото"}
                    </button>
                    <span className={styles.avatarHint}>JPG или PNG, лучше квадратное — сохраняется сразу.</span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    aria-label="Загрузить фото профиля"
                    onChange={(e) => void handleAvatar(e.target.files?.[0])}
                  />
                </div>
              )}
              <form className={ui.form} onSubmit={submitProfile}>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Имя и фамилия</span>
                  <input
                    className={ui.input}
                    value={form.name}
                    maxLength={255}
                    required
                    autoComplete="name"
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </label>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Электронная почта</span>
                  <input
                    className={ui.input}
                    type="email"
                    value={form.email}
                    maxLength={320}
                    required
                    autoComplete="email"
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </label>
                {showTelegram && (
                  <label className={ui.field}>
                    <span className={ui.fieldLabel}>Telegram</span>
                    <input
                      className={ui.input}
                      value={form.telegram}
                      maxLength={255}
                      placeholder="@username"
                      onChange={(e) => setForm((p) => ({ ...p, telegram: e.target.value }))}
                    />
                  </label>
                )}
                <div className={styles.formActions}>
                  <button className={ui.btnPrimary} type="submit" disabled={profileMutation.isPending}>
                    {profileMutation.isPending ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Безопасность */}
          <section className={styles.section}>
            <div>
              <h2 className={styles.sectionTitle}>Безопасность</h2>
              <p className={styles.sectionDesc}>Смена пароля. Понадобится текущий пароль.</p>
            </div>
            <div className={styles.sectionBody}>
              {pwNotice && (
                <div
                  className={pwNotice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
                  style={{ marginBottom: 16 }}
                >
                  {pwNotice.text}
                </div>
              )}
              <form className={ui.form} onSubmit={submitPassword}>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Текущий пароль</span>
                  <input
                    className={ui.input}
                    type="password"
                    autoComplete="current-password"
                    required
                    value={pw.current_password}
                    onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))}
                  />
                </label>
                <label className={ui.field}>
                  <span className={ui.fieldLabel}>Новый пароль</span>
                  <input
                    className={ui.input}
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={pw.password}
                    onChange={(e) => setPw((p) => ({ ...p, password: e.target.value }))}
                  />
                </label>
                <div className={styles.formActions}>
                  <button className={ui.btnLine} type="submit" disabled={passwordMutation.isPending}>
                    {passwordMutation.isPending ? "Меняем…" : "Изменить пароль"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Уведомления */}
          <section className={styles.section}>
            <div>
              <h2 className={styles.sectionTitle}>Уведомления</h2>
              <p className={styles.sectionDesc}>
                Браузерные уведомления, когда вкладка не перед глазами.
              </p>
            </div>
            <div className={styles.sectionBody}>
              {notifyNotice && (
                <div className={ui.noticeDanger} style={{ marginBottom: 16 }}>
                  {notifyNotice.text}
                </div>
              )}
              {notifySupported ? (
                <div className={styles.toggleRow}>
                  <div className={styles.toggleText}>
                    <span className={styles.toggleTitle}>Сообщения в чате</span>
                    <span className={styles.toggleHint}>
                      Показывать уведомление о новых сообщениях, пока вы в другой вкладке.
                    </span>
                  </div>
                  <Switch
                    checked={notifyOn}
                    onChange={(next) => void toggleNotify(next)}
                    ariaLabel="Уведомления о сообщениях в чате"
                  />
                </div>
              ) : (
                <div className={ui.notice}>Ваш браузер не поддерживает уведомления.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </MarketShell>
  );
}
