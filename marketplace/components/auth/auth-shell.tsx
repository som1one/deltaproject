"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import styles from "@/app/auth/auth.module.css";

export const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className={styles.page}>
    <aside className={styles.aside}>
      <Link href="/" className={styles.asideBrand}>
        <span className={styles.asideBrandMark}>looney moon</span>
        <span className={styles.asideBrandSub}>market</span>
      </Link>
      <div className={styles.asideBody}>
        <p className={styles.asideQuote}>
          Хорошая реклама начинается с правильного голоса — и с честной сделки.
        </p>
        <p className={styles.asideFine}>
          Кураторский каталог авторов и безопасная сделка: оплата удерживается на счёте
          платформы, пока публикация не подтверждена.
        </p>
      </div>
      <div className={styles.asideMark} aria-hidden="true">
        № LM-2026
      </div>
    </aside>
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.topRow}>
          <Link href="/" className={styles.backLink}>
            ← На главную
          </Link>
        </div>
        {children}
      </div>
    </main>
  </div>
);
