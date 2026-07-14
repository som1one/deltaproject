"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Home,
  LayoutGrid,
  MessageSquare,
  Handshake,
  Briefcase,
  LayoutDashboard,
  Settings,
  LifeBuoy,
  LogOut,
  LogIn,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { Portrait } from "@/components/ui/bits";
import { ThemeToggle } from "./theme-toggle";

import styles from "./shell.module.css";

type NavItem = { href: string; label: string };

// Пункты меню аккаунта (десктоп-дропдаун и мобильная панель используют один список).
const ACCOUNT_LINKS: NavItem[] = [
  { href: "/cabinet", label: "Кабинет" },
  { href: "/settings", label: "Настройки" },
  { href: "/support", label: "Поддержка" },
];

// Иконка на строку мобильного меню — по стабильному маршруту (подпись /orders
// зависит от роли, href — нет).
const NAV_ICONS: Record<string, LucideIcon> = {
  "/": Home,
  "/catalog": LayoutGrid,
  "/chats": MessageSquare,
  "/orders": Handshake,
  "/worker": Briefcase,
  "/cabinet": LayoutDashboard,
  "/settings": Settings,
  "/support": LifeBuoy,
};

// Одна строка мобильного меню: иконка слева, подпись, активное состояние.
// Единый компонент и для навигации, и для аккаунт-секции.
const MobileRow = ({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) => {
  const Icon = NAV_ICONS[href] ?? Home;
  return (
    <li>
      <Link
        href={href}
        className={active ? styles.mobileRowActive : styles.mobileRow}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
      >
        <span className={styles.mobileRowIcon} aria-hidden="true">
          <Icon size={19} strokeWidth={2} />
        </span>
        <span className={styles.mobileRowLabel}>{label}</span>
      </Link>
    </li>
  );
};

export const MarketShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const { isHydrated, isAuthenticated, isBlogger, isClient, isWorker, userName, userPhoto, logout } =
    useAuth();
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

  // Верхнее меню держим коротким и стабильным: общий с гостем префикс
  // (Главная, Каталог) не двигается при входе — просто добавляются
  // «Чаты» и «Сделки». Кабинет/Настройки/Поддержка — в меню аккаунта.
  let navItems: NavItem[];
  if (isHydrated && isAuthenticated && (isBlogger || isClient)) {
    navItems = [
      { href: "/", label: "Главная" },
      { href: "/catalog", label: "Каталог" },
      { href: "/chats", label: "Чаты" },
      { href: "/orders", label: isBlogger ? "Сделки" : "Мои сделки" },
    ];
  } else if (isHydrated && isAuthenticated && isWorker) {
    navItems = [
      { href: "/", label: "Главная" },
      { href: "/catalog", label: "Каталог" },
      { href: "/worker", label: "Кабинет воркера" },
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
  const roleLabel = isBlogger ? "Автор" : isWorker ? "Воркер" : "Заказчик";

  return (
    <div className={styles.shell}>
      <header
        className={`${styles.header} ${scrolled ? styles.headerScrolled : ""} ${
          menuOpen ? styles.headerMenuOpen : ""
        }`}
      >
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
                  <Portrait
                    name={userName ?? "Аккаунт"}
                    photoUrl={userPhoto}
                    className={styles.accountAvatar}
                    monoSize={13}
                  />
                  <span className={styles.accountText}>
                    <span className={styles.accountName}>{userName ?? "Аккаунт"}</span>
                    <span className={styles.accountRole}>{roleLabel}</span>
                  </span>
                  <ChevronDown size={15} className={styles.accountCaret} data-open={acctOpen} />
                </button>
                {acctOpen && (
                  <div className={styles.accountMenu} role="menu">
                    <div className={styles.accountMenuHead}>
                      <span className={styles.accountMenuName}>{userName ?? "Аккаунт"}</span>
                      <span className={styles.accountMenuRole}>{roleLabel}</span>
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
                    <div className={styles.accountMenuSep} aria-hidden="true" />
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
              <div className={styles.mobileInner}>
                {authed && (
                  <div className={styles.mobileIdentity}>
                    <Portrait
                      name={userName ?? "Аккаунт"}
                      photoUrl={userPhoto}
                      className={styles.mobileIdentityAvatar}
                      monoSize={19}
                    />
                    <span className={styles.mobileIdentityText}>
                      <span className={styles.mobileIdentityName}>{userName ?? "Аккаунт"}</span>
                      <span className={styles.mobileIdentityRole}>{roleLabel}</span>
                    </span>
                  </div>
                )}

                <ul className={styles.mobileGroup}>
                  {navItems.map(({ href, label }) => (
                    <MobileRow
                      key={href}
                      href={href}
                      label={label}
                      active={pathname === href}
                      onClick={closeMenu}
                    />
                  ))}
                </ul>

                <div className={styles.mobileDivider} aria-hidden="true" />

                {authed ? (
                  <>
                    <p className={styles.mobileSectionLabel}>Аккаунт</p>
                    <ul className={styles.mobileGroup}>
                      {ACCOUNT_LINKS.map(({ href, label }) => (
                        <MobileRow
                          key={href}
                          href={href}
                          label={label}
                          active={pathname === href}
                          onClick={closeMenu}
                        />
                      ))}
                    </ul>
                    <button type="button" className={styles.mobileLogout} onClick={handleLogout}>
                      <span className={styles.mobileRowIcon} aria-hidden="true">
                        <LogOut size={19} strokeWidth={2} />
                      </span>
                      <span className={styles.mobileRowLabel}>Выйти</span>
                    </button>
                  </>
                ) : (
                  <Link href="/auth/login" className={styles.mobileLogin} onClick={closeMenu}>
                    <LogIn size={18} strokeWidth={2.2} aria-hidden="true" />
                    <span>Войти</span>
                  </Link>
                )}
              </div>
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
