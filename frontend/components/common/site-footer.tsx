"use client";

import Link from "next/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.inner}>
        <div className={styles.top}>
          <span className={styles.logo}>moneymaxxxing</span>
          <div className={styles.links}>
            <Link href="/privacy">Политика конфиденциальности</Link>
            <Link href="/terms">Условия использования</Link>
          </div>
        </div>

        <div className={styles.bottom}>
          <span className={styles.copy}>
            © {new Date().getFullYear()} moneymaxxxing. Все права защищены.
          </span>
        </div>
      </div>
    </footer>
  );
}
