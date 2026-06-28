"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { stitchStyles as styles } from "@/components/marketplace/stitch-marketplace";
import { ApiError } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
};

type LoginRole = "client" | "blogger";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const [role, setRole] = useState<LoginRole>("client");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (): Promise<TokenResponse> => {
      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(typeof data.detail === "string" ? data.detail : "Не удалось войти", response.status);
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSession(data.access_token, data.refresh_token);
      router.push(searchParams.get("next") || "/");
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 401) {
        setError("Неверный email или пароль");
        return;
      }
      setError(err.message || "Ошибка сети. Попробуйте ещё раз.");
    },
  });

  const handleBloggerLogin = () => {
    // Redirect to main platform Telegram OAuth with role=BLOGGER
    // The main platform handles the OAuth flow and redirects to its own cabinet
    const mainUrl = appConfig.mainAppUrl;
    window.location.href = `${mainUrl}/auth/login`;
  };

  return (
    <div className={styles.form}>
      {/* Role selector */}
      <div className={styles.roleSelector}>
        <button
          type="button"
          className={role === "client" ? styles.roleBtnActive : styles.roleBtn}
          onClick={() => { setRole("client"); setError(""); }}
        >
          Заказчик
        </button>
        <button
          type="button"
          className={role === "blogger" ? styles.roleBtnActive : styles.roleBtn}
          onClick={() => { setRole("blogger"); setError(""); }}
        >
          Блогер
        </button>
      </div>

      {role === "client" ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            loginMutation.mutate();
          }}
        >
          <div>
            <h2 className={styles.authTitle}>Вход для заказчика</h2>
            <p className={styles.muted}>Введите ваши данные для доступа к маркетплейсу.</p>
          </div>
          {error && <p className={styles.errorText}>{error}</p>}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Электронная почта</span>
            <input
              autoComplete="email"
              className={styles.lineInput}
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Пароль</span>
            <input
              autoComplete="current-password"
              className={styles.lineInput}
              required
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
          <button className={styles.primaryButton} disabled={loginMutation.isPending} type="submit">
            {loginMutation.isPending ? "Входим..." : "Войти"}
          </button>
          <p className={styles.muted}>
            Нет аккаунта? <Link href="/auth/register">Зарегистрироваться</Link>
          </p>
        </form>
      ) : (
        <div>
          <div>
            <h2 className={styles.authTitle}>Вход для блогера</h2>
            <p className={styles.muted}>
              Блогеры входят через основную платформу Looney Moon. После авторизации вы попадёте в свой кабинет.
            </p>
          </div>
          <button
            className={styles.primaryButton}
            onClick={handleBloggerLogin}
            type="button"
            style={{ marginTop: "24px" }}
          >
            Перейти на платформу для входа
          </button>
          <p className={styles.muted} style={{ marginTop: "16px" }}>
            Вы будете перенаправлены на {appConfig.mainAppUrl}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MarketplaceLoginPage() {
  return (
    <div className={`${styles.root} ${styles.authPage}`}>

      <main className={styles.authPanel}>
        <div className={styles.authCard}>
          <div className={styles.mobileBrand}>
            <Link className={styles.brand} href="/">looney moon</Link>
          </div>
          <div className={styles.tabs}>
            <span className={styles.tabActive}>Вход</span>
            <Link className={styles.tab} href="/auth/register">Регистрация</Link>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
