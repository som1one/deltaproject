"use client";

import { useMemo, useState } from "react";

import { Button, Field, Message, TextInput } from "@/components/common/ui";

import styles from "./payout-card-input.module.css";

/* =========================================================
   Premium card input with live preview + masked formatting.
   - Авто-форматирование «1234 5678 9012 3456»
   - Детекция бренда (Visa / Mastercard / МИР / другая)
   - Luhn-валидация перед сабмитом
   - Поле отображается скрытым (буллетами), пока пользователь
     не нажал «глаз». Бэк принимает только сырые цифры.
   ========================================================= */

type CardBrand = "mir" | "belcart" | "mastercard" | "visa" | "amex" | "unknown";

const detectBrand = (digits: string): CardBrand => {
  if (!digits) return "unknown";
  // МИР — национальные карты РФ. Основной диапазон BIN 2200–2204.
  if (/^220[0-4]/.test(digits)) return "mir";
  // БелКарт — белорусская национальная платёжная система. Стандартный BIN 9112.
  if (/^9112/.test(digits)) return "belcart";
  // Visa
  if (/^4/.test(digits)) return "visa";
  // Mastercard: 51–55 либо 2221–2720.
  if (/^5[1-5]/.test(digits)) return "mastercard";
  if (/^2[2-7]/.test(digits)) {
    if (digits.length >= 4) {
      const head = Number(digits.slice(0, 4));
      if (head >= 2221 && head <= 2720) return "mastercard";
    } else {
      return "mastercard";
    }
  }
  // American Express
  if (/^3[47]/.test(digits)) return "amex";
  return "unknown";
};

const BRAND_LABEL: Record<CardBrand, string> = {
  mir: "МИР",
  belcart: "БЕЛКАРТ",
  mastercard: "Mastercard",
  visa: "Visa",
  amex: "American Express",
  unknown: "Карта",
};

/** Группирует цифры по 4 (для Amex — 4-6-5). */
const formatCardNumber = (digits: string, brand: CardBrand): string => {
  if (!digits) return "";
  if (brand === "amex") {
    const parts = [
      digits.slice(0, 4),
      digits.slice(4, 10),
      digits.slice(10, 15),
    ].filter(Boolean);
    return parts.join(" ");
  }
  return digits.match(/.{1,4}/g)?.join(" ") ?? digits;
};

const luhnValid = (digits: string): boolean => {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

/** Допустимая длина номера карты (после удаления разделителей): 13–19 цифр. */
const MIN_CARD_DIGITS = 13;
const MAX_CARD_DIGITS = 19;

const maskedDisplay = (digits: string, brand: CardBrand): string => {
  if (!digits) return "•••• •••• •••• ••••";
  if (brand === "amex") {
    const padded = digits + "•".repeat(Math.max(0, 15 - digits.length));
    return `${padded.slice(0, 4)} ${padded.slice(4, 10)} ${padded.slice(10, 15)}`;
  }
  
  const expectedLength = Math.max(16, digits.length);
  const padded = digits + "•".repeat(Math.max(0, expectedLength - digits.length));
  
  return padded.match(/.{1,4}/g)?.join(" ") ?? padded;
};

export const PayoutCardInput = ({
  savedLast4,
  pending,
  onSubmit,
}: {
  savedLast4: string | null;
  pending: boolean;
  onSubmit: (rawDigits: string) => void;
}) => {
  const [raw, setRaw] = useState(""); // только цифры
  const [holder, setHolder] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = useMemo(() => detectBrand(raw), [raw]);
  const formatted = useMemo(() => formatCardNumber(raw, brand), [raw, brand]);
  // Валидная длина — любой номер в диапазоне 13–19 цифр (Req 4.1, 4.3).
  const isValidLength = raw.length >= MIN_CARD_DIGITS && raw.length <= MAX_CARD_DIGITS;
  const isLuhnValid = isValidLength && luhnValid(raw);

  const last4 = raw.slice(-4) || savedLast4 || "";
  const previewNumber = raw
    ? maskedDisplay(raw, brand)
    : savedLast4
      ? `•••• •••• •••• ${savedLast4}`
      : maskedDisplay("", brand);

  const handleChange = (value: string) => {
    // Лимит ввода: 19 цифр (для AmEx — 15). Лишние символы не принимаем.
    const maxLen = brand === "amex" ? 15 : MAX_CARD_DIGITS;
    const digits = value.replace(/\D/g, "").slice(0, maxLen);
    setRaw(digits);
    setError(null);
  };

  const handleHolder = (value: string) => {
    // Латиница, пробелы, апостроф и дефис — как на тиснении карты.
    const filtered = value.toUpperCase().replace(/[^A-ZА-ߨ \-']/g, "");
    setHolder(filtered.slice(0, 40));
  };

  const handleSubmit = () => {
    if (!isValidLength) {
      setError("Номер карты должен содержать от 13 до 19 цифр.");
      return;
    }
    if (!isLuhnValid) {
      setError("Номер карты введён с ошибкой — проверьте цифры.");
      return;
    }
    onSubmit(raw);
    setRaw("");
    setHolder("");
    setRevealed(false);
  };

  return (
    <div className={styles.shell}>
      {/* ---- Live card preview ---- */}
      <div className={styles.card} data-brand={brand}>
        <div className={styles.cardChip} aria-hidden />
        <div className={styles.cardBrand}>{BRAND_LABEL[brand]}</div>
        <div className={styles.cardNumber}>{previewNumber}</div>
        <div className={styles.cardFootRow}>
          <div className={styles.cardFootBlock}>
            <span className={styles.cardFootLabel}>Держатель</span>
            <span className={styles.cardFootValue}>
              {holder.trim() ? holder : "ИМЯ ФАМИЛИЯ"}
            </span>
          </div>
          <div className={styles.cardFootBlock}>
            <span className={styles.cardFootLabel}>Last 4</span>
            <span className={styles.cardFootValue}>
              {last4 ? `•••• ${last4}` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Form ---- */}
      <div className={styles.form}>
        <Field
          label="Номер карты"
          help={
            error ??
            (savedLast4
              ? `Сохранено: •••• ${savedLast4}. Платформа хранит хеш и последние 4 цифры.`
              : "Поддерживаются МИР, БЕЛКАРТ, Visa, Mastercard, AmEx. Платформа хранит только хеш и last4.")
          }
        >
          <div className={`${styles.inputRow}${revealed ? "" : ` ${styles.inputRowMasked}`}`}>
            <TextInput
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="2200 0000 0000 0000"
              value={formatted}
              onChange={(event) => handleChange(event.target.value)}
              aria-invalid={Boolean(error)}
              maxLength={brand === "amex" ? 17 : 23}
            />
            <button
              type="button"
              className={styles.eyeButton}
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? "Скрыть номер" : "Показать номер"}
              title={revealed ? "Скрыть номер" : "Показать номер"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {revealed ? (
                  <>
                    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M3 3l18 18" />
                    <path d="M10.6 6.2A9 9 0 0 1 12 6c5.5 0 9 6 9 6a16 16 0 0 1-3.2 3.6" />
                    <path d="M6.2 7.4C4.1 8.9 3 12 3 12s3.5 6 9 6c1 0 2-.2 2.9-.5" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </Field>

        <Field
          label="Держатель карты"
          help="Как на лицевой стороне. Используется только для предпросмотра — на сервер не уходит."
        >
          <TextInput
            placeholder="IVAN IVANOV"
            autoComplete="cc-name"
            value={holder}
            onChange={(event) => handleHolder(event.target.value)}
          />
        </Field>

        {raw && !isValidLength ? (
          <Message tone="default">Введено цифр: {raw.length}. Допустимо 13–19.</Message>
        ) : null}

        <Button
          onClick={handleSubmit}
          disabled={pending}
        >
          {pending ? "Сохраняем…" : savedLast4 ? "Обновить карту" : "Сохранить карту"}
        </Button>
      </div>
    </div>
  );
};

/** Полностью замаскированный formatted-номер (буллеты на месте цифр).
 *  В компоненте больше не используется — маскировка делается через CSS,
 *  чтобы не ломать набор и backspace в скрытом режиме. */
const _maskedFormatted = (formatted: string): string =>
  formatted.replace(/\d/g, "•");
void _maskedFormatted;
