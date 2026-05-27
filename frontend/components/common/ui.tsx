"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import styles from "@/components/common/ui.module.css";

type ButtonProps = {
  children: ReactNode;
  kind?: "primary" | "secondary" | "ghost";
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

export const PageSurface = ({ children }: { children: ReactNode }) => (
  <div className={styles.page}>
    <div className={styles.container}>{children}</div>
  </div>
);

export const TopNav = ({
  children,
  brandSub = "агентство блогеров",
}: {
  children?: ReactNode;
  brandSub?: string;
}) => (
  <nav className={styles.nav}>
    <Link href="/" className={styles.brand}>
      <span className={styles.brandMark}>looney moon</span>
      <span className={styles.brandSub}>{brandSub}</span>
    </Link>
    <div className={styles.navLinks}>{children}</div>
  </nav>
);

export const NavLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className={styles.navLink}>
    {children}
  </Link>
);

export const PageHero = ({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  actions?: ReactNode;
}) => (
  <section className={styles.hero}>
    <span className={styles.eyebrow}>{eyebrow}</span>
    <h1 className={styles.heroTitle}>{title}</h1>
    <p className={styles.heroLead}>{lead}</p>
    {actions ? <div className={styles.heroActions}>{actions}</div> : null}
  </section>
);

export const Button = ({ children, kind = "primary", href, type = "button", disabled, onClick }: ButtonProps) => {
  const className = `${styles.button} ${styles[kind]}`;
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button className={className} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
};

export const SectionCard = ({
  title,
  lead,
  children,
  actions,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <section className={styles.sectionCard}>
    <div className={styles.toolbar}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {lead ? <p className={styles.sectionLead}>{lead}</p> : null}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

export const StatsGrid = ({ children }: { children: ReactNode }) => <div className={styles.statsGrid}>{children}</div>;

export const StatCard = ({ label, value }: { label: string; value: ReactNode }) => (
  <article className={styles.statCard}>
    <p className={styles.statLabel}>{label}</p>
    <p className={styles.statValue}>{value}</p>
  </article>
);

export const Stack = ({ children }: { children: ReactNode }) => <div className={styles.grid}>{children}</div>;

export const TwoColumn = ({ children }: { children: ReactNode }) => <div className={styles.twoColumn}>{children}</div>;

export const Split = ({ children }: { children: ReactNode }) => <div className={styles.split}>{children}</div>;

export const Field = ({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) => (
  <label className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    {children}
    {help ? <span className={styles.helpText}>{help}</span> : null}
  </label>
);

export const TextInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={styles.input} {...props} />
);

export const TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={styles.textarea} {...props} />
);

export const SelectInput = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={styles.select} {...props} />
);

export const Message = ({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "error" | "success";
}) => {
  const toneClass = tone === "default" ? "" : ` ${styles[tone]}`;
  return <p className={`${styles.message}${toneClass}`}>{children}</p>;
};

export const TableWrap = ({ children }: { children: ReactNode }) => <div className={styles.tableWrap}>{children}</div>;

export const DataTable = ({ children }: { children: ReactNode }) => <table className={styles.table}>{children}</table>;

export type StatusTone = "default" | "active" | "success" | "muted" | "danger";

const statusToneClass: Record<StatusTone, string> = {
  default: "",
  active: ` ${styles.statusActive}`,
  success: ` ${styles.statusSuccess}`,
  muted: ` ${styles.statusMuted}`,
  danger: ` ${styles.statusDanger}`,
};

export const StatusPill = ({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) => <span className={`${styles.status}${statusToneClass[tone]}`}>{children}</span>;

export const PillRow = ({ children }: { children: ReactNode }) => <div className={styles.pillRow}>{children}</div>;

export const Pill = ({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent";
}) => (
  <span className={`${styles.pill}${tone === "accent" ? ` ${styles.pillAccent}` : ""}`}>{children}</span>
);

export const InlineButton = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button className={styles.linkButton} type="button" onClick={onClick}>
    {children}
  </button>
);

export const Modal = ({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) => (
  <div className={styles.modalBackdrop} onClick={onClose}>
    <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.grid}>{children}</div>
      <div className={styles.modalActions}>{actions}</div>
    </div>
  </div>
);
