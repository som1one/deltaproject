"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { UserMeRead } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import styles from "./settings.module.css";

type Notice = { tone: "success" | "danger"; text: string } | null;

const errText = (err: Error, fallback: string) =>
  err instanceof ApiError && err.message ? err.message : fallback;

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/auth/login?next=/settings");
  }, [isAuthenticated, isHydrated, router]);

  const authed = isHydrated && isAuthenticated;

  const { data: me } = useQuery<UserMeRead>({
    queryKey: ["marketplace-me"],
    queryFn: api.getMe,
    enabled: authed,
  });

  // ── Профиль ──
  const [form, setForm] = useState({ name: "", email: "", telegram: "" });
  const [profileNotice, setProfileNotice] = useState<Notice>(null);

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
            <div className={ui.skeleton} style={{ height: 90, width: "100%", maxWidth: 380 }} />
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
          <span className={ui.brow}>Личный кабинет</span>
          <h1 className={styles.title}>Настройки аккаунта</h1>
        </header>

        <div className={styles.grid}>
          {/* Профиль */}
          <section className={ui.card} style={{ padding: "24px 26px" }}>
            <h2 className={styles.cardTitle}>Профиль</h2>
            <p className={styles.cardSub}>Имя, почта и Telegram для связи по сделкам.</p>
            {profileNotice && (
              <div
                className={profileNotice.tone === "success" ? ui.noticeSuccess : ui.noticeDanger}
                style={{ marginBottom: 16 }}
              >
                {profileNotice.text}
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
              <button className={ui.btnPrimary} type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? "Сохраняем…" : "Сохранить"}
              </button>
            </form>
          </section>

          {/* Смена пароля */}
          <section className={ui.card} style={{ padding: "24px 26px" }}>
            <h2 className={styles.cardTitle}>Безопасность</h2>
            <p className={styles.cardSub}>Смена пароля. Понадобится текущий пароль.</p>
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
              <button className={ui.btnLine} type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? "Меняем…" : "Изменить пароль"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </MarketShell>
  );
}
