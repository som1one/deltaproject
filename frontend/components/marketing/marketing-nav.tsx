"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import styles from "@/components/marketing/marketing-nav.module.css";

export type MarketingNavItem = { href: string; label: string };

type MarketingNavProps = {
  /** Small uppercase label under the brand (e.g. "агентство · faq"). */
  brandSub?: string;
  /** Inline navigation links (excluding the CTA). */
  items: MarketingNavItem[];
  /** Primary action link (the pill button). */
  cta: MarketingNavItem;
};

/**
 * Shared marketing header: sticky bar with brand, desktop inline links and a
 * mobile burger that opens an animated dropdown. No icons — text only.
 */
export const MarketingNav = ({ brandSub = "агентство", items, cta }: MarketingNavProps) => {
  const reduceMotion = useReducedMotion() ?? false;
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Close on Escape + lock body scroll while the panel is open.
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

  return (
    <header className={styles.topBar}>
      <div className={styles.topBarRow}>
        <Link href="/" className={styles.brand} onClick={closeMenu}>
          <span className={styles.brandMark}>looney moon</span>
          {brandSub ? <span className={styles.brandSub}>{brandSub}</span> : null}
        </Link>

        {/* Desktop inline links */}
        <nav className={styles.links} aria-label="Основная навигация">
          {items.map(({ href, label }) => (
            <Link key={href} href={href} className={styles.link}>
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA — pinned to the right edge */}
        <Link href={cta.href} className={styles.cta}>
          {cta.label}
        </Link>

        {/* Burger trigger (mobile) */}
        <button
          type="button"
          className={styles.burger}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          aria-controls="marketing-mobile-menu"
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

      {/* Mobile dropdown menu */}
      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.button
              type="button"
              className={styles.scrim}
              aria-label="Закрыть меню"
              onClick={closeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            />
            <motion.nav
              id="marketing-mobile-menu"
              className={styles.panel}
              aria-label="Мобильная навигация"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, height: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, height: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 0.84, 0.3, 1] }}
            >
              <motion.ul
                className={styles.menuList}
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
                }}
              >
                {items.map(({ href, label }) => (
                  <motion.li
                    key={href}
                    variants={{
                      hidden: { opacity: 0, x: reduceMotion ? 0 : -14 },
                      show: { opacity: 1, x: 0 },
                    }}
                  >
                    <Link href={href} className={styles.menuLink} onClick={closeMenu}>
                      {label}
                    </Link>
                  </motion.li>
                ))}
                <motion.li
                  variants={{
                    hidden: { opacity: 0, x: reduceMotion ? 0 : -14 },
                    show: { opacity: 1, x: 0 },
                  }}
                >
                  <Link href={cta.href} className={styles.menuCta} onClick={closeMenu}>
                    {cta.label}
                  </Link>
                </motion.li>
              </motion.ul>
            </motion.nav>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
};
