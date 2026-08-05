"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { AuthShell } from "@/components/auth/auth-shell";
import { clearReferralCode, readReferralCode } from "@/components/marketplace/ref-tracker";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import ui from "@/components/ui/ui.module.css";
import styles from "@/app/auth/auth.module.css";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();

  const [referralCode, setReferralCode] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  // Явный next (deep-link, например форма оффера) в приоритете, но только
  // внутренний путь: «//evil.com» и абсолютные URL — это open redirect.
  const explicitNext = searchParams.get("next");
  const nextPath =
    explicitNext && explicitNext.startsWith("/") && !explicitNext.startsWith("//")
      ? explicitNext
      : "/catalog";

  useEffect(() => {
    const urlRef = searchParams.get("ref");
    setReferralCode(urlRef || readReferralCode());
  }, [searchParams]);

  const registerMutation = useMutation({
    mutationFn: () =>
      api.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(referralCode ? { referral_code: referralCode } : {}),
      }),
    onSuccess: (data) => {
      setSession(data.token, data.refresh_token);
      clearReferralCode();
      router.push(nextPath);
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
    <>
      <h1 className={styles.title}>Создать аккаунт</h1>
      <p className={styles.subtitle}>
        Аккаунт заказчика открывает каталог, безопасную сделку и историю заказов.
      </p>

      {referralCode && (
        <div className={ui.noticeSuccess} style={{ marginBottom: 20 }}>
          Приглашение по реферальной ссылке будет закреплено за аккаунтом.
        </div>
      )}

      <form
        className={ui.form}
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          registerMutation.mutate();
        }}
      >
        {error && <div className={ui.noticeDanger}>{error}</div>}
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Имя и фамилия</span>
          <input
            autoComplete="name"
            className={ui.input}
            maxLength={255}
            required
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Электронная почта</span>
          <input
            autoComplete="email"
            className={ui.input}
            maxLength={320}
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Пароль</span>
          <input
            autoComplete="new-password"
            className={ui.input}
            maxLength={100}
            minLength={8}
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </label>
        <p className={ui.fine}>
          Регистрируясь, вы принимаете условия использования платформы и правила безопасной сделки.
        </p>
        <button className={ui.btnPrimary} disabled={registerMutation.isPending} type="submit">
          {registerMutation.isPending ? "Создаём аккаунт…" : "Зарегистрироваться"}
        </button>
      </form>
      <p className={styles.switchLine}>
        Уже есть аккаунт?{" "}
        <Link href={`/auth/login${explicitNext ? `?next=${encodeURIComponent(explicitNext)}` : ""}`}>
          Войти
        </Link>
      </p>
    </>
  );
}

export default function MarketplaceRegisterPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
