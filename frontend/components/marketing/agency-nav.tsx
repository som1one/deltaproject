"use client";

import Link from "next/link";

import { useSessionTarget } from "@/lib/use-session-target";
import styles from "@/components/marketing/agency-nav.module.css";

const NAV_ITEMS = [
  { href: "/#about", label: "О платформе" },
  { href: "/faq", label: "FAQ" },
  { href: "/contacts", label: "Контакты" },
];

export const AgencyNav = () => {
  const session = useSessionTarget();
  const isLoggedIn = session.ready && session.isAuthenticated && Boolean(session.href);

  const cta = isLoggedIn
    ? { href: session.href as string, label: session.label as string }
    : { href: "/register", label: "Войти" };

  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark}>looney moon</span>
        <span className={styles.brandSub}>сообщество</span>
      </Link>

      <nav className={styles.links} aria-label="Основная навигация">
        {NAV_ITEMS.map(({ href, label }) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
        <Link href={cta.href}>{cta.label}</Link>
      </nav>
    </header>
  );
};
