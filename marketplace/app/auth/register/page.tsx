"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
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

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  
  const [referralCode, setReferralCode] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    // URL parameter takes precedence, then localStorage
    const urlRef = searchParams.get("ref");
    const storageRef = typeof window !== "undefined" ? window.localStorage.getItem("marketplace_referral_code") : null;
    const finalRef = urlRef || storageRef || "";
    setReferralCode(finalRef);
  }, [searchParams]);

  const registerMutation = useMutation({
    mutationFn: async (): Promise<TokenResponse> => {
      const body: Record<string, string> = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      };
      if (referralCode) body.referral_code = referralCode;

      const response = await fetch(`${appConfig.apiBaseUrl}/marketplace/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(typeof data.detail === "string" ? data.detail : "Не удалось зарегистрироваться", response.status);
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSession(data.access_token, data.refresh_token);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("marketplace_referral_code");
      }
      router.push("/");
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setError("Пользователь с таким email уже существует");
        return;
      }
      setError(err.message || "Ошибка сети. Попробуйте ещё раз.");
    },
  });

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        registerMutation.mutate();
      }}
    >
      <div>
        <h2 className={styles.authTitle}>Создать аккаунт</h2>
        <p className={styles.muted}>Присоединяйтесь к сети рекламодателей и оформляйте проекты с блогерами.</p>
      </div>
      {referralCode && <p className={styles.successText}>Приглашение по реферальной ссылке будет закреплено за аккаунтом.</p>}
      {error && <p className={styles.errorText}>{error}</p>}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Имя и фамилия</span>
        <input
          autoComplete="name"
          className={styles.lineInput}
          maxLength={255}
          required
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Электронная почта</span>
        <input
          autoComplete="email"
          className={styles.lineInput}
          maxLength={320}
          required
          type="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Пароль</span>
        <input
          autoComplete="new-password"
          className={styles.lineInput}
          maxLength={100}
          minLength={8}
          required
          type="password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
        />
      </label>
      <p className={styles.muted}>
        Регистрируясь, вы принимаете условия использования платформы и правила безопасной сделки.
      </p>
      <button className={styles.primaryButton} disabled={registerMutation.isPending} type="submit">
        {registerMutation.isPending ? "Регистрируем..." : "Зарегистрироваться"}
      </button>
      <p className={styles.muted}>
        Уже есть аккаунт? <Link href="/auth/login">Войти</Link>
      </p>
    </form>
  );
}

export default function MarketplaceRegisterPage() {
  return (
    <div className={`${styles.root} ${styles.authPage}`}>

      <main className={styles.authPanel}>
        <div className={styles.authCard}>
          <div className={styles.mobileBrand}>
            <Link className={styles.brand} href="/">looney moon</Link>
          </div>
          <div className={styles.tabs}>
            <Link className={styles.tab} href="/auth/login">Вход</Link>
            <span className={styles.tabActive}>Регистрация</span>
          </div>
          <Suspense fallback={null}>
            <RegisterForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
