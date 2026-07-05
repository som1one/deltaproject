"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import { appConfig } from "@/lib/config";

import styles from "./shell.module.css";

type NavItem = { href: string; label: string };

export const MarketShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const { isHydrated, isAuthenticated, isBlogger, isClient, userName, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  const navItems: NavItem[] = [
    { href: "/catalog", label: "Каталог" },
    { href: "/#how", label: "Как это работает" },
  ];
  if (isHydrated && isAuthenticated && isClient) {
    navItems.push({ href: "/orders", label: "Мои сделки" });
    navItems.push({ href: "/support", label: "Поддержка" });
  }
  if (isHydrated && isAuthenticated && isBlogger) {
    navItems.push({ href: "/blogger", label: "Входящие" });
  }

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const authed = isHydrated && isAuthenticated;

  return (
    <div className={styles.shell}>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
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

          <div className={styles.actions}>
            {authed ? (
              <span className={styles.userChip}>
                <span className={styles.userRole}>{isBlogger ? "автор" : "заказчик"}</span>
                <span className={styles.userName}>{userName ?? "Аккаунт"}</span>
                <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
                  Выйти
                </button>
              </span>
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
                {!authed && (
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
          <div className={styles.footerTop}>
            <div className={styles.footerBrandBlock}>
              <Link href="/" className={styles.footerBrand}>
                <span className={styles.footerBrandMark}>looney moon</span>
                <span className={styles.footerBrandSub}>market</span>
              </Link>
              <p className={styles.footerText}>
                Кураторский реестр рекламных размещений. Ручной отбор авторов,
                безопасная сделка: оплата удерживается платформой до подтверждения публикации.
              </p>
            </div>
            <div className={styles.footerCol}>
              <span className={styles.footerColTitle}>Маркет</span>
              <Link href="/catalog" className={styles.footerLink}>Каталог авторов</Link>
              <Link href="/#how" className={styles.footerLink}>Как проходит сделка</Link>
              <Link href="/orders" className={styles.footerLink}>Мои сделки</Link>
              <Link href="/support" className={styles.footerLink}>Поддержка</Link>
            </div>
            <div className={styles.footerCol}>
              <span className={styles.footerColTitle}>Авторам</span>
              <Link href="/auth/login?role=blogger" className={styles.footerLink}>Вход для авторов</Link>
              <a href={appConfig.mainAppUrl} className={styles.footerLink} target="_blank" rel="noreferrer">
                Платформа looney moon
              </a>
              <a
                href={`${appConfig.mainAppUrl}/blogger/profile`}
                className={styles.footerLink}
                target="_blank"
                rel="noreferrer"
              >
                Управление профилем
              </a>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span className={styles.footerFine}>© {new Date().getFullYear()} looney moon · сделки под защитой платформы</span>
            <span className={styles.footerFine}>marketplace.looneymoon.ru</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
