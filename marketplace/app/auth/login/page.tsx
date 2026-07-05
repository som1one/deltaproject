"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { AuthShell } from "@/components/auth/auth-shell";
import { ApiError, api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";

import ui from "@/components/ui/ui.module.css";
import styles from "@/app/auth/auth.module.css";

type LoginRole = "client" | "blogger";

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3-3.5 3.5z" />
  </svg>
);

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();

  const initialRole: LoginRole = searchParams.get("role") === "blogger" ? "blogger" : "client";
  const [role, setRole] = useState<LoginRole>(initialRole);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const nextPath = searchParams.get("next") || "/catalog";

  const loginMutation = useMutation({
    mutationFn: () => api.login({ email: form.email.trim(), password: form.password }),
    onSuccess: (data) => {
      setSession(data.token, data.refresh_token);
      router.push(nextPath);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setError(err.message || "Неверный email или пароль");
        return;
      }
      setError(err.message || "Ошибка сети. Попробуйте ещё раз.");
    },
  });

  const handleBloggerLogin = () => {
    // SSO через главную платформу: authorize → callback с одноразовым кодом
    const callback = `${window.location.origin}/auth/platform/callback`;
    const target = new URL("/oauth/authorize", appConfig.mainAppUrl);
    target.searchParams.set("redirect_uri", callback);
    target.searchParams.set("next", searchParams.get("next") || "/blogger");
    window.location.href = target.toString();
  };

  return (
    <>
      <div className={styles.roleTabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={role === "client"}
          className={role === "client" ? styles.roleTabActive : styles.roleTab}
          onClick={() => {
            setRole("client");
            setError("");
          }}
        >
          Я заказчик
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={role === "blogger"}
          className={role === "blogger" ? styles.roleTabActive : styles.roleTab}
          onClick={() => {
            setRole("blogger");
            setError("");
          }}
        >
          Я блогер
        </button>
      </div>

      {role === "client" ? (
        <>
          <h1 className={styles.title}>С возвращением</h1>
          <p className={styles.subtitle}>
            Войдите, чтобы управлять заказами и продолжить работу с авторами.
          </p>
          <form
            className={ui.form}
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              loginMutation.mutate();
            }}
          >
            {error && <div className={ui.noticeDanger}>{error}</div>}
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Электронная почта</span>
              <input
                autoComplete="email"
                className={ui.input}
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Пароль</span>
              <input
                autoComplete="current-password"
                className={ui.input}
                required
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
            <button className={ui.btnPrimary} disabled={loginMutation.isPending} type="submit">
              {loginMutation.isPending ? "Входим…" : "Войти"}
            </button>
          </form>
          <p className={styles.switchLine}>
            Нет аккаунта?{" "}
            <Link href={`/auth/register${nextPath !== "/catalog" ? `?next=${encodeURIComponent(nextPath)}` : ""}`}>
              Зарегистрироваться
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className={styles.title}>Вход для блогеров</h1>
          <p className={styles.subtitle}>
            Блогеры входят через единый аккаунт платформы looney moon — без отдельного пароля для маркета.
          </p>
          <div className={styles.oauthBox}>
            <div className={styles.oauthHint}>
              <KeyIcon />
              <span>
                Вы будете перенаправлены на платформу. После входа вернётесь сюда уже
                авторизованным и увидите свои заказы. Профиль в каталоге редактируется
                в кабинете платформы.
              </span>
            </div>
            <button type="button" className={ui.btnPrimary} onClick={handleBloggerLogin}>
              Войти через платформу
            </button>
            <p className={ui.fine} style={{ textAlign: "center" }}>
              Ещё не сотрудничаете с looney moon?{" "}
              <a href={appConfig.mainAppUrl} target="_blank" rel="noreferrer" className={ui.link}>
                Узнать об условиях
              </a>
            </p>
          </div>
        </>
      )}
    </>
  );
}

export default function MarketplaceLoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
