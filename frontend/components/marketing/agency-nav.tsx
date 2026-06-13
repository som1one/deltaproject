"use client";

import Link from "next/link";
import { useSessionTarget } from "@/lib/use-session-target";
import styles from "@/components/marketing/agency-nav.module.css";

export const AgencyNav = () => {
  const session = useSessionTarget();
  const isLoggedIn = session.ready && session.isAuthenticated && Boolean(session.href);

  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark}>looney moon</span>
        <span className={styles.brandSub}>агентство</span>
      </Link>
      <nav className={styles.links}>
        <Link href="#manifest">О платформе</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/contacts">Контакты</Link>
        {isLoggedIn ? (
          <Link href={session.href as string}>{session.label}</Link>
        ) : (
          <Link href="/register">Войти</Link>
        )}
      </nav>
    </header>
  );
};
