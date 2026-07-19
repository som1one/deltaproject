import type { ReactNode } from "react";

import styles from "./section.module.css";

/* =========================================================
   Section — типографический раздел кабинета.
   Вместо «коробки»: ярлык капителью + hairline-линейка,
   справа опциональные контролы (aside), ниже — lead и контент.
   ========================================================= */

export const Section = ({
  label,
  lead,
  aside,
  children,
}: {
  label: string;
  lead?: string;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <section className={styles.section}>
    <header className={styles.head}>
      <div className={styles.headRow}>
        <h2 className={styles.label}>{label}</h2>
        <span className={styles.rule} aria-hidden="true" />
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </div>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
    </header>
    {children}
  </section>
);
