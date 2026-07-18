"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "@/lib/format";
import type { UserMeRead } from "@/lib/types";

import styles from "./blogger-overview.module.css";

/* =========================================================
   Blogger overview — premium balance card + marketplace CTA.
   Заменяет старую сетку из 4 плиток: одна «карта» с балансом
   (скрываемым, в нескольких валютах) + призыв к работе на
   маркетплейсе.
   ========================================================= */

type CurrencyCode = "RUB" | "USD" | "EUR" | "CNY";

const CURRENCIES: readonly { code: CurrencyCode; symbol: string; locale: string }[] = [
  { code: "RUB", symbol: "₽", locale: "ru-RU" },
  { code: "USD", symbol: "$", locale: "en-US" },
  { code: "EUR", symbol: "€", locale: "de-DE" },
  { code: "CNY", symbol: "¥", locale: "zh-CN" },
];

// Индикативные курсы (единиц валюты за 1 ₽). Приблизительные — значения на
// карте помечаются знаком «≈». Только для наглядности, не для расчётов.
const RUB_TO: Record<CurrencyCode, number> = {
  RUB: 1,
  USD: 1 / 91,
  EUR: 1 / 99,
  CNY: 1 / 12.7,
};

const HIDE_KEY = "delta_balance_hidden";
const CURRENCY_KEY = "delta_balance_currency";

const convert = (kopeks: number, code: CurrencyCode): string => {
  const meta = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
  if (code === "RUB") return formatMoney(kopeks);
  const amount = (kopeks / 100) * RUB_TO[code];
  const formatted = new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(amount);
  return `≈ ${formatted}`;
};

/* ---------- Inline icons ---------- */

const EyeIcon = ({ off }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off ? (
      <>
        <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c5 0 9 5 9 8a12 12 0 0 1-2.2 3.1M6.6 6.6C3.9 8.2 2 10.7 2 12c0 3 4 8 10 8a9.3 9.3 0 0 0 4.4-1.1" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* =========================================================
   Balance card
   ========================================================= */

const BalanceCard = ({ me }: { me: UserMeRead }) => {
  const [hidden, setHidden] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>("RUB");

  // Гидрируем предпочтения из localStorage после маунта (без SSR-mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    const saved = window.localStorage.getItem(CURRENCY_KEY);
    if (saved && CURRENCIES.some((c) => c.code === saved)) {
      setCurrency(saved as CurrencyCode);
    }
  }, []);

  const toggleHidden = () => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDE_KEY, next ? "1" : "0");
      } catch {
        /* приватный режим — просто не запоминаем */
      }
      return next;
    });
  };

  const selectCurrency = (code: CurrencyCode) => {
    setCurrency(code);
    try {
      window.localStorage.setItem(CURRENCY_KEY, code);
    } catch {
      /* noop */
    }
  };

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "₽";
  const balanceText = useMemo(() => convert(me.balance, currency), [me.balance, currency]);
  const hasPending = me.balance_pending_confirmation_kopeks > 0;
  const holder = me.nickname ? `@${me.nickname}` : me.name;

  return (
    <section className={styles.card} aria-label="Баланс">
      <div className={styles.cardHead}>
        <p className={styles.cardEyebrow}>Баланс</p>
        <button
          type="button"
          className={styles.eyeBtn}
          onClick={toggleHidden}
          aria-pressed={hidden}
          aria-label={hidden ? "Показать баланс" : "Скрыть баланс"}
          title={hidden ? "Показать баланс" : "Скрыть баланс"}
        >
          <EyeIcon off={hidden} />
        </button>
      </div>

      {/* «Номер карты» показываем только при привязанной карте выплат:
          маскированные группы + реальные last4. Декоративный — статус
          карты озвучивает футер. */}
      {me.payout_card_last4 ? (
        <p className={styles.cardNumber} aria-hidden="true">
          <span>••••</span>
          <span>••••</span>
          <span>••••</span>
          <span className={styles.cardNumberKnown}>{me.payout_card_last4}</span>
        </p>
      ) : null}

      <div className={styles.cardBody}>
        <p className={styles.cardLabel}>Доступно к выводу</p>
        <p className={styles.cardBalance} data-hidden={hidden ? "true" : undefined}>
          {hidden ? (
            <span className={styles.masked}>
              •&thinsp;•&thinsp;•&thinsp;•&thinsp;•&thinsp;• {symbol}
            </span>
          ) : (
            balanceText
          )}
        </p>
        <p className={styles.cardPending} data-empty={hasPending ? undefined : "true"}>
          {hasPending
            ? `+ ${hidden ? "••••" : formatMoney(me.balance_pending_confirmation_kopeks)} на подтверждении`
            : "Свободных средств на подтверждении нет"}
        </p>
      </div>

      <div className={styles.currencyRow} role="group" aria-label="Валюта отображения">
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            type="button"
            className={`${styles.currencyBtn}${currency === c.code ? ` ${styles.currencyBtnActive}` : ""}`}
            onClick={() => selectCurrency(c.code)}
            aria-pressed={currency === c.code}
          >
            {c.symbol}
          </button>
        ))}
      </div>

      <footer className={styles.cardFoot}>
        <div className={styles.cardFootItem}>
          <span className={styles.cardFootLabel}>Держатель</span>
          <span className={styles.cardFootValue}>{holder}</span>
        </div>
        <div className={styles.cardFootItem}>
          <span className={styles.cardFootLabel}>Ставка</span>
          <span className={styles.cardFootValue}>{me.percent}%</span>
        </div>
        <div className={`${styles.cardFootItem} ${styles.cardFootItemEnd}`}>
          <span className={styles.cardFootLabel}>Карта выплат</span>
          <span className={styles.cardFootValue}>
            {me.payout_card_last4 ? `•••• ${me.payout_card_last4}` : "не задана"}
          </span>
        </div>
      </footer>
    </section>
  );
};

/* =========================================================
   Marketplace CTA
   ========================================================= */

const MarketplaceCta = () => (
  <section className={styles.cta} aria-label="Маркетплейс">
    <span className={styles.ctaGlyph} aria-hidden="true">
      <ArrowIcon />
    </span>
    <div className={styles.ctaTop}>
      <p className={styles.ctaEyebrow}>Маркетплейс</p>
      <h3 className={styles.ctaTitle}>Больше заказов — на&nbsp;маркетплейсе</h3>
      <p className={styles.ctaText}>
        Берите рекламные интеграции с прямой оплатой через площадку. Деньги
        держатся в эскроу и приходят после выполнения — без переписок о предоплате.
      </p>
    </div>
    <ul className={styles.ctaPoints}>
      <li className={styles.ctaPoint}>Оплата в эскроу</li>
      <li className={styles.ctaPoint}>Заказы от клиентов</li>
      <li className={styles.ctaPoint}>Вывод на карту</li>
    </ul>
    <a className={styles.ctaBtn} href="/blogger/marketplace">
      Открыть маркетплейс
      <ArrowIcon />
    </a>
  </section>
);

/* =========================================================
   Public component
   ========================================================= */

export const BloggerOverview = ({ me }: { me: UserMeRead }) => (
  <div className={styles.root}>
    <div className={styles.topGrid}>
      <BalanceCard me={me} />
      <MarketplaceCta />
    </div>
  </div>
);
