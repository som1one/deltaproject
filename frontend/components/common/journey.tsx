"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import styles from "@/components/common/journey.module.css";

type Tone = "light" | "dark";

const panelClass = (tone: Tone) => (tone === "light" ? styles.lightPanel : styles.darkPanel);

export const JourneyShell = ({
  brandSub = "агентство блогеров",
  links,
  children,
}: {
  brandSub?: string;
  links?: { href: string; label: string }[];
  children: ReactNode;
}) => (
  <main className={styles.shell}>
    <header className={styles.shellHeader}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandTitle}>looney moon</span>
        <span className={styles.brandSub}>{brandSub}</span>
      </Link>
      {links && links.length > 0 ? (
        <div className={styles.headerLinks}>
          {links.map((link) => (
            <Link key={`${link.href}-${link.label}`} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
    {children}
  </main>
);

export const JourneyPanel = ({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) => (
  <section className={`${styles.panel} ${panelClass(tone)}`}>
    <div className={styles.panelGlow} aria-hidden />
    <div className={styles.panelContent}>{children}</div>
  </section>
);

export const JourneyEyebrow = ({ children }: { children: ReactNode }) => (
  <span className={styles.eyebrow}>{children}</span>
);

export const JourneyTitle = ({ children }: { children: ReactNode }) => (
  <h1 className={styles.title}>{children}</h1>
);

export const JourneyLead = ({ children }: { children: ReactNode }) => (
  <p className={styles.lead}>{children}</p>
);

export const JourneyList = ({ items }: { items: readonly string[] }) => (
  <ul className={styles.list}>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

export const JourneyActions = ({ children }: { children: ReactNode }) => (
  <div className={styles.actions}>{children}</div>
);

export const JourneyActionsRow = ({ children }: { children: ReactNode }) => (
  <div className={styles.actionsRow}>{children}</div>
);

export const JourneyForm = ({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}) => (
  <form
    className={styles.formCard}
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {children}
  </form>
);

export const JourneyField = ({
  label,
  children,
  helper,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
}) => (
  <label className={styles.formField}>
    <span className={styles.formLabel}>{label}</span>
    {children}
    {helper ? <span className={styles.helper}>{helper}</span> : null}
  </label>
);

export const JourneyInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={styles.formInput} {...props} />
);

export const JourneySubmit = ({
  children,
  disabled,
  type = "submit",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) => (
  <button className={styles.formSubmit} type={type} disabled={disabled} onClick={onClick}>
    {children}
  </button>
);

export const JourneyHelper = ({ children }: { children: ReactNode }) => (
  <p className={styles.helper}>{children}</p>
);

export const JourneyDivider = ({ children }: { children: ReactNode }) => (
  <div className={styles.divider}>{children}</div>
);

export const JourneyReferralBadge = ({ username }: { username: string }) => (
  <span className={styles.referralBadge}>Приглашение от @{username}</span>
);

export const JourneySteps = ({
  steps,
}: {
  steps: readonly { id: string; title: string; text: string }[];
}) => (
  <div className={styles.steps}>
    {steps.map((step) => (
      <article key={step.id} className={styles.stepRow}>
        <div className={styles.stepIndex}>{step.id}</div>
        <div className={styles.stepBody}>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </div>
      </article>
    ))}
  </div>
);

export const JourneyFeatureGrid = ({
  features,
}: {
  features: readonly { icon: string; title: string; text: string }[];
}) => (
  <div className={styles.featureGrid}>
    {features.map((feature) => (
      <article key={feature.title} className={styles.featureCard}>
        <span className={styles.featureIcon} aria-hidden>{feature.icon}</span>
        <h3 className={styles.featureTitle}>{feature.title}</h3>
        <p className={styles.featureText}>{feature.text}</p>
      </article>
    ))}
  </div>
);

export const JourneyFeedback = ({
  tone,
  children,
}: {
  tone: "info" | "success" | "error";
  children: ReactNode;
}) => {
  const toneClass =
    tone === "error"
      ? styles.feedbackError
      : tone === "success"
        ? styles.feedbackSuccess
        : styles.feedbackInfo;
  return <p className={`${styles.feedback} ${toneClass}`}>{children}</p>;
};

export const JourneyLinkRow = ({ children }: { children: ReactNode }) => (
  <div className={styles.linkRow}>{children}</div>
);

/**
 * Ворота обязательной подписки: кнопка-ссылка на Telegram-канал и
 * подтверждение «Я подписался», которое перезапускает проверку.
 */
export const JourneyChannelGate = ({
  channelUrl,
  onConfirm,
  confirming,
}: {
  channelUrl?: string | null;
  onConfirm: () => void;
  confirming?: boolean;
}) => (
  <div className={styles.channelGate}>
    {channelUrl ? (
      <a
        className={styles.channelLink}
        href={channelUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
        Перейти в канал
      </a>
    ) : null}
    <button
      type="button"
      className={styles.channelConfirm}
      onClick={onConfirm}
      disabled={confirming}
    >
      {confirming ? "Проверяем подписку…" : "Я подписался — проверить"}
    </button>
  </div>
);

/**
 * Decorative CSS-only moon used at the top of auth/onboarding screens
 * in place of role-specific illustrations. Inherits the same visual
 * language as the landing hero moon.
 */
export const JourneyMoon = () => (
  <div className={styles.moonStage} aria-hidden>
    <div className={styles.moonHalo} />
    <div className={styles.moon}>
      <span className={styles.moonShade} />
      <span className={styles.moonCraters} />
    </div>
  </div>
);

/**
 * Hand-drawn clipboard icon used as a hero glyph for the worker journey:
 * a worker's tool of trade — list of leads, scripts, deals.
 */
export const JourneyClipboardIcon = () => (
  <div className={styles.glyphStage} aria-hidden>
    <div className={styles.glyphHalo} />
    <svg
      className={styles.glyph}
      viewBox="0 0 120 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Clip at the top */}
      <rect x="46" y="6" width="28" height="14" rx="3" />
      <line x1="52" y1="13" x2="68" y2="13" />
      {/* Board */}
      <rect x="18" y="14" width="84" height="118" rx="6" />
      {/* Inner page */}
      <rect x="26" y="22" width="68" height="102" rx="3" opacity="0.55" />
      {/* Lines of content */}
      <line x1="34" y1="38" x2="86" y2="38" />
      <line x1="34" y1="48" x2="74" y2="48" opacity="0.7" />
      <line x1="34" y1="64" x2="86" y2="64" />
      <line x1="34" y1="74" x2="78" y2="74" opacity="0.7" />
      <line x1="34" y1="90" x2="86" y2="90" />
      <line x1="34" y1="100" x2="68" y2="100" opacity="0.7" />
      {/* Checkmark on the first line */}
      <path d="M34 30 l3 3 l5 -6" opacity="0.85" />
    </svg>
  </div>
);

/**
 * Hand-drawn video camera on a tripod — hero glyph for the blogger journey.
 * Reads as a creator's filming setup: shoulder-mount camcorder + tripod legs.
 */
export const JourneyCameraIcon = () => (
  <div className={styles.glyphStage} aria-hidden>
    <div className={styles.glyphHalo} />
    <svg
      className={styles.glyph}
      viewBox="0 0 140 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Camera body */}
      <rect x="22" y="22" width="78" height="50" rx="6" />
      {/* Lens barrel sticking out to the right */}
      <rect x="100" y="32" width="22" height="30" rx="3" />
      <circle cx="111" cy="47" r="6" opacity="0.7" />
      {/* Top viewfinder + tally light */}
      <rect x="40" y="12" width="22" height="10" rx="2" opacity="0.85" />
      <circle cx="86" cy="17" r="2.4" opacity="0.9" />
      {/* Small grip strap on the side */}
      <path d="M22 38 q-6 2 -6 8 t6 8" opacity="0.7" />
      {/* Tripod head — short stem from camera underside */}
      <line x1="61" y1="72" x2="61" y2="84" />
      <rect x="54" y="84" width="14" height="6" rx="1.5" opacity="0.85" />
      {/* Three tripod legs */}
      <line x1="61" y1="90" x2="22" y2="146" />
      <line x1="61" y1="90" x2="61" y2="146" />
      <line x1="61" y1="90" x2="100" y2="146" />
      {/* Foot caps */}
      <line x1="18" y1="146" x2="30" y2="146" opacity="0.8" />
      <line x1="55" y1="146" x2="67" y2="146" opacity="0.8" />
      <line x1="94" y1="146" x2="106" y2="146" opacity="0.8" />
      {/* Tripod cross-brace */}
      <path d="M40 118 l42 0" opacity="0.5" />
    </svg>
  </div>
);
