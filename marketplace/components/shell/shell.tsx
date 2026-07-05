"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogOut, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { appConfig } from "@/lib/config";

import styles from "./shell.module.css";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.6} /> : <Moon size={16} strokeWidth={1.6} />}
    </button>
  );
};

type NavItem = { href: string; label: string };

export const MarketShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const { isHydrated, isAuthenticated, isBlogger, isClient, userName, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

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

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  const navItems: NavItem[] = [
    { href: "/catalog", label: "Каталог" },
    { href: "/#how", label: "Как это работает" },
  ];
  if (isHydrated && isAuthenticated && isClient) {
    navItems.push({ href: "/orders", label: "Мои заказы" });
    navItems.push({ href: "/support", label: "Поддержка" });
  }
  if (isHydrated && isAuthenticated && isBlogger) {
    navItems.push({ href: "/blogger", label: "Заказы блогера" });
  }

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const authed = isHydrated && isAuthenticated;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <Link href="/" className={styles.brand} onClick={closeMenu}>
            <span className={styles.brandMark}>looney moon</span>
            <span className={styles.brandSub}>market</span>
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

          <div className={styles.spacer} />

          <div className={styles.actions}>
            <ThemeToggle />
            {authed ? (
              <span className={styles.userChip}>
                <span>
                  <span className={styles.userRole}>{isBlogger ? "блогер" : "заказчик"}</span>{" "}
                  <span className={styles.userName}>{userName ?? "Аккаунт"}</span>
                </span>
                <button
                  type="button"
                  className={styles.logoutBtn}
                  onClick={handleLogout}
                  aria-label="Выйти"
                  title="Выйти"
                >
                  <LogOut size={14} strokeWidth={1.8} />
                </button>
              </span>
            ) : (
              <Link href="/auth/login" className={`${styles.cta} ${styles.ctaDesktop}`}>
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
              transition={{ duration: 0.3, ease: [0.2, 0.6, 0.2, 1] }}
            >
              <ul className={styles.mobileList}>
                {navItems.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className={styles.mobileLink} onClick={closeMenu}>
                      {label}
                    </Link>
                  </li>
                ))}
                {!authed && (
                  <li>
                    <Link href="/auth/login" className={styles.mobileCta} onClick={closeMenu}>
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
          <div className={styles.footerBrandBlock}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark}>looney moon</span>
              <span className={styles.brandSub}>market</span>
            </Link>
            <p className={styles.footerText}>
              Кураторский маркетплейс рекламных интеграций. Избранные авторы,
              безопасная сделка, деньги под защитой платформы до подтверждения результата.
            </p>
          </div>
          <div className={styles.footerCol}>
            <span className={styles.footerColTitle}>Маркет</span>
            <Link href="/catalog" className={styles.footerLink}>Каталог блогеров</Link>
            <Link href="/#how" className={styles.footerLink}>Как это работает</Link>
            <Link href="/orders" className={styles.footerLink}>Мои заказы</Link>
            <Link href="/support" className={styles.footerLink}>Поддержка</Link>
          </div>
          <div className={styles.footerCol}>
            <span className={styles.footerColTitle}>Блогерам</span>
            <Link href="/auth/login?role=blogger" className={styles.footerLink}>Вход для блогеров</Link>
            <a href={appConfig.mainAppUrl} className={styles.footerLink} target="_blank" rel="noreferrer">
              Платформа looney moon
            </a>
            <a href={`${appConfig.mainAppUrl}/blogger/profile`} className={styles.footerLink} target="_blank" rel="noreferrer">
              Управление профилем
            </a>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span className={styles.footerFine}>© {new Date().getFullYear()} looney moon. Все права защищены.</span>
          <span className={styles.footerFine}>Оплата проходит через защищённую сделку платформы</span>
        </div>
      </footer>
    </div>
  );
};
