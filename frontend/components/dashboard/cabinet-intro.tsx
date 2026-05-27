"use client";

import { useEffect, useMemo, useState } from "react";

import landingStyles from "@/components/marketing/landing.module.css";

/* =========================================================
   Cabinet intro overlay — премиум typewriter-цитата при заходе.
   Шоу один раз за сессию (storage-key per role). На мобиле — те же
   стили, что и у лендингового IntroOverlay (.intro/.introInner/...).
   ========================================================= */

type CabinetIntroProps = {
  role: "Worker" | "Bloger";
  /** Имя пользователя — только для уникальности кэш-ключа сессии. */
  userKey?: string;
};

/* Каждое настроение — короткая, серьёзная фраза в духе лендинга. */
const QUOTES: Record<CabinetIntroProps["role"], { quote: string; author: string }> = {
  Worker: {
    quote: "«Дисциплина — вот мост между целью и достижением».",
    author: "Джим Рон",
  },
  Bloger: {
    quote: "«Доверие — самая твёрдая валюта».",
    author: "Уоррен Баффет",
  },
};

const storageKey = (role: string, userKey?: string) =>
  `cabinet-intro:${role}${userKey ? `:${userKey}` : ""}`;

export const CabinetIntro = ({ role, userKey }: CabinetIntroProps) => {
  const { quote, author } = QUOTES[role];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(storageKey(role, userKey))) return;
    } catch {
      // Если storage заблокирован — всё равно покажем, не критично.
    }
    setVisible(true);
  }, [role, userKey]);

  const tokens = useMemo(() => {
    const parts = quote.split(/(\s+)/);
    let charIndex = 0;
    return parts.map((part) => {
      const isSpace = /^\s+$/.test(part);
      const chars = Array.from(part).map((char) => ({ char, idx: charIndex++ }));
      return { isSpace, chars };
    });
  }, [quote]);

  const totalChars = useMemo(
    () => tokens.reduce((acc, token) => acc + token.chars.length, 0),
    [tokens],
  );

  const quoteRevealMs = 150 + totalChars * 28 + 220;
  const authorDwellMs = 600;
  const exitMs = 520;

  useEffect(() => {
    if (!visible) return;
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
      try {
        window.sessionStorage.setItem(storageKey(role, userKey), "1");
      } catch {
        // ignore
      }
    }, quoteRevealMs + authorDwellMs + exitMs);
    return () => window.clearTimeout(timeoutId);
  }, [visible, role, userKey, quoteRevealMs, authorDwellMs, exitMs]);

  if (!visible) return null;

  const skip = () => {
    setVisible(false);
    try {
      window.sessionStorage.setItem(storageKey(role, userKey), "1");
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={landingStyles.intro}
      style={{
        animationDelay: `${quoteRevealMs + authorDwellMs}ms`,
        animationDuration: `${exitMs}ms`,
      }}
    >
      <button type="button" className={landingStyles.introSkip} onClick={skip}>
        Пропустить
      </button>

      <div className={landingStyles.introInner}>
        <p className={landingStyles.introQuote}>
          {tokens.map((token, tokenIdx) =>
            token.isSpace ? (
              <span key={`space-${tokenIdx}`} className={landingStyles.introSpace}>
                {token.chars.map(({ char }) => char).join("")}
              </span>
            ) : (
              <span key={`word-${tokenIdx}`} className={landingStyles.introWord}>
                {token.chars.map(({ char, idx }) => (
                  <span
                    key={`${char}-${idx}`}
                    className={landingStyles.introChar}
                    style={{ animationDelay: `${150 + idx * 28}ms` }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            ),
          )}
        </p>

        <div className={landingStyles.introAuthorSlot}>
          <div
            className={landingStyles.introAuthorWrap}
            style={{ animationDelay: `${quoteRevealMs}ms` }}
          >
            <span className={landingStyles.introAuthorOrn} aria-hidden />
            <p className={landingStyles.introAuthor}>{author}</p>
            <span className={landingStyles.introAuthorOrn} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
};
