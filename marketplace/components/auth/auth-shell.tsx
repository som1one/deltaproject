"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/shell/shell";

import styles from "@/app/auth/auth.module.css";

export const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className={styles.page}>
    <aside className={styles.aside}>
      <Link href="/" className={styles.asideBrand}>
        <span className={styles.asideBrandMark}>looney moon</span>
        <span className={styles.asideBrandSub}>market</span>
      </Link>
      <div className={styles.asideQuote}>
        <span className={styles.asideQuoteMark} aria-hidden="true">
          “
        </span>
        <p className={styles.asideQuoteText}>
          Хорошая реклама начинается с правильного голоса.
        </p>
      </div>
      <p className={styles.asideFine}>
        Кураторский каталог авторов и безопасная сделка: оплата хранится на счёте
        платформы, пока результат не подтверждён.
      </p>
    </aside>
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.topRow}>
          <Link href="/" className={styles.backLink}>
            ← На главную
          </Link>
          <ThemeToggle />
        </div>
        {children}
      </div>
    </main>
  </div>
);
