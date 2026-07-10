"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "./theme-toggle";

import styles from "./shell.module.css";

type NavItem = { href: string; label: string };

// Пункты меню аккаунта (десктоп-дропдаун и мобильная панель используют один список).
const ACCOUNT_LINKS: NavItem[] = [
  { href: "/cabinet", label: "Кабинет" },
  { href: "/settings", label: "Настройки" },
  { href: "/support", label: "Поддержка" },
];

export const MarketShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const { isHydrated, isAuthenticated, isBlogger, isClient, userName, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  // Меню аккаунта: закрытие по клику вне и Escape.
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcctOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setAcctOpen(false);
  }, [pathname]);

  // Разделы зависят от роли. «Главная» остаётся всегда — это точка возврата
  // и якорь навигации; без неё меню после входа ощущается обрезанным.
  let navItems: NavItem[];
  if (isHydrated && isAuthenticated && isBlogger) {
    navItems = [
      { href: "/", label: "Главная" },
      { href: "/cabinet", label: "Кабинет" },
      { href: "/blogger", label: "Входящие" },
      { href: "/orders", label: "Мои сделки" },
    ];
  } else if (isHydrated && isAuthenticated && isClient) {
    navItems = [
      { href: "/", label: "Главная" },
      { href: "/cabinet", label: "Кабинет" },
      { href: "/catalog", label: "Каталог" },
      { href: "/orders", label: "Мои сделки" },
    ];
  } else {
    navItems = [
      { href: "/", label: "Главная" },
      { href: "/catalog", label: "Каталог" },
    ];
  }

  const handleLogout = async () => {
    setAcctOpen(false);
    closeMenu();
    await logout();
    router.push("/");
  };

  const authed = isHydrated && isAuthenticated;
  const initial = (userName?.trim()?.charAt(0) || "А").toUpperCase();

  return (
    <div className={styles.shell}>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
        <div className={styles.headerRow}>
          <Link href="/" className={styles.brand} onClick={closeMenu}>
            <span className={styles.brandMoon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandMark}>looney moon</span>
              <span className={styles.brandSub}>маркетплейс</span>
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Основная навигация">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={pathname === href ? styles.navLinkActive : styles.navLink}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <ThemeToggle />
            {authed ? (
              <div className={styles.account} ref={acctRef}>
                <button
                  type="button"
                  className={styles.accountTrigger}
                  onClick={() => setAcctOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                >
                  <span className={styles.avatar} aria-hidden="true">{initial}</span>
                  <span className={styles.accountName}>{userName ?? "Аккаунт"}</span>
                  <ChevronDown size={15} className={styles.accountCaret} data-open={acctOpen} />
                </button>
                {acctOpen && (
                  <div className={styles.accountMenu} role="menu">
                    <div className={styles.accountMenuHead}>
                      <span className={styles.accountMenuName}>{userName ?? "Аккаунт"}</span>
                      <span className={styles.accountMenuRole}>{isBlogger ? "автор" : "заказчик"}</span>
                    </div>
                    {ACCOUNT_LINKS.map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        role="menuitem"
                        className={styles.accountMenuItem}
                        onClick={() => setAcctOpen(false)}
                      >
                        {label}
                      </Link>
                    ))}
                    <button type="button" role="menuitem" className={styles.accountMenuLogout} onClick={handleLogout}>
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth/login" className={styles.ctaDesktop}>
                Войти
              </Link>
            )}
            <button
              type="button"
              className={styles.burger}
              data-open={menuOpen}
              aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className={styles.burgerLine} />
              <span className={styles.burgerLine} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen ? (
            <motion.nav
              className={styles.mobilePanel}
              aria-label="Мобильная навигация"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
            >
              <ul className={styles.mobileList}>
                {navItems.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className={styles.mobileLink} onClick={closeMenu}>
                      {label}
                    </Link>
                  </li>
                ))}
                {authed ? (
                  <>
                    <li>
                      <Link href="/settings" className={styles.mobileLink} onClick={closeMenu}>
                        Настройки
                      </Link>
                    </li>
                    <li>
                      <Link href="/support" className={styles.mobileLink} onClick={closeMenu}>
                        Поддержка
                      </Link>
                    </li>
                    <li>
                      <button type="button" className={styles.mobileLogout} onClick={handleLogout}>
                        Выйти
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link href="/auth/login" className={styles.mobileLink} onClick={closeMenu}>
                      Войти
                    </Link>
                  </li>
                )}
              </ul>
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>

      <main className={styles.content}>{children}</main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <nav className={styles.footerLegal} aria-label="Документы и поддержка">
            <Link href="/offer" className={styles.footerLegalLink}>Публичная оферта</Link>
            <Link href="/privacy" className={styles.footerLegalLink}>Политика конфиденциальности</Link>
            <Link href="/terms" className={styles.footerLegalLink}>Условия использования</Link>
            <Link href="/support" className={styles.footerLegalLink}>Поддержка</Link>
          </nav>
          <span className={styles.footerFine}>© {new Date().getFullYear()} looney moon</span>
        </div>
      </footer>
    </div>
  );
};
