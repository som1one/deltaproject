"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSessionTarget } from "@/lib/use-session-target";
import styles from "@/components/marketing/agency-nav.module.css";

const NAV_ITEMS = [
  { href: "/#manifest", label: "О платформе" },
  { href: "/faq", label: "FAQ" },
  { href: "/contacts", label: "Контакты" },
];

export const AgencyNav = () => {
  const session = useSessionTarget();
  const isLoggedIn = session.ready && session.isAuthenticated && Boolean(session.href);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  const cta = isLoggedIn
    ? { href: session.href as string, label: session.label as string }
    : { href: "/register", label: "Войти" };

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={styles.topBar}>
      <div className={styles.topBarRow}>
        <Link href="/" className={styles.brand} onClick={closeMenu}>
          <span className={styles.brandMark}>looney moon</span>
          <span className={styles.brandSub}>агентство</span>
        </Link>

        <nav className={styles.links} aria-label="Основная навигация">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <Link href={cta.href}>{cta.label}</Link>
        </nav>

        <button
          type="button"
          className={styles.burger}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          data-open={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={styles.burgerBox}>
            <span className={styles.burgerLine} />
            <span className={styles.burgerLine} />
            <span className={styles.burgerLine} />
          </span>
        </button>
      </div>

      <div
        className={`${styles.mobilePanel}${menuOpen ? ` ${styles.mobilePanelOpen}` : ""}`}
        aria-hidden={!menuOpen}
      >
        <nav className={styles.mobileLinks} aria-label="Мобильная навигация">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link key={href} href={href} onClick={closeMenu}>
              {label}
            </Link>
          ))}
          <Link href={cta.href} className={styles.mobileCta} onClick={closeMenu}>
            {cta.label}
          </Link>
        </nav>
      </div>
    </header>
  );
};
