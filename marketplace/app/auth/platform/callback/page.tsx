"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import ui from "@/components/ui/ui.module.css";
import styles from "@/app/auth/auth.module.css";

function PlatformCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useAuth();
  const [status, setStatus] = useState<"pending" | "error">("pending");
  const [errorText, setErrorText] = useState("");
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/blogger";
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setStatus("error");
      setErrorText("Платформа отклонила вход. Попробуйте ещё раз.");
      return;
    }
    if (!code) {
      setStatus("error");
      setErrorText("В ссылке нет кода авторизации.");
      return;
    }

    api
      .platformExchange(code)
      .then((data) => {
        setSession(data.token, data.refresh_token);
        router.replace(next);
      })
      .catch((err: Error) => {
        setStatus("error");
        setErrorText(err.message || "Код уже использован или истёк. Войдите ещё раз.");
      });
  }, [router, searchParams, setSession]);

  return (
    <>
      <h1 className={styles.title}>
        {status === "pending" ? "Завершаем вход…" : "Не получилось войти"}
      </h1>
      {status === "pending" ? (
        <>
          <p className={styles.subtitle}>Обмениваем код платформы на сессию маркета.</p>
          <div className={ui.skeleton} style={{ height: 48 }} />
        </>
      ) : (
        <>
          <div className={ui.noticeDanger} style={{ marginBottom: 20 }}>
            {errorText}
          </div>
          <Link href="/auth/login?role=blogger" className={ui.btnPrimary}>
            Попробовать снова
          </Link>
        </>
      )}
    </>
  );
}

export default function PlatformCallbackPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <PlatformCallback />
      </Suspense>
    </AuthShell>
  );
}
