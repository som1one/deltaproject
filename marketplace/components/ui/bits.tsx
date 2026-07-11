"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Star, X } from "lucide-react";

import { resolveUploadUrl } from "@/lib/config";
import { orderStampLabel, orderStampTone, type StampTone } from "@/lib/order-status";

import ui from "./ui.module.css";

const stampClass: Record<StampTone, string> = {
  active: ui.stampActive,
  done: ui.stampDone,
  alert: ui.stampAlert,
  muted: ui.stampMuted,
};

/** Статус сделки как цветная пилюля. */
export const StampBadge = ({ status }: { status: string }) => (
  <span className={stampClass[orderStampTone(status)]}>{orderStampLabel(status)}</span>
);

/** Номер сделки/заказа в моно. */
export const DealNo = ({ value, className }: { value: string; className?: string }) => (
  <span className={`${ui.mono} ${className ?? ""}`.trim()}>№&nbsp;{value}</span>
);

export const CopyButton = ({ value, label = "Копировать" }: { value: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard может быть недоступен — молча игнорируем */
    }
  };

  return (
    <button type="button" className={ui.copyBtn} onClick={handleCopy}>
      {copied ? "Скопировано" : label}
    </button>
  );
};

/* Цветные градиенты для аватаров-заглушек */
const GRADIENTS = [
  "linear-gradient(135deg, #6d5ef6, #a78bfa)",
  "linear-gradient(135deg, #2aa5f0, #22d3ee)",
  "linear-gradient(135deg, #12a150, #4ade80)",
  "linear-gradient(135deg, #f5a524, #fbbf5a)",
  "linear-gradient(135deg, #ec4899, #f472b6)",
  "linear-gradient(135deg, #f56342, #fb9678)",
  "linear-gradient(135deg, #4f46e5, #818cf8)",
  "linear-gradient(135deg, #0f9d76, #34d399)",
];

const pickGradient = (seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
};

/** Переключатель в стиле маркетплейса (зелёный = включено). */
export const Switch = ({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    className={checked ? ui.switchOn : ui.switch}
    onClick={() => onChange(!checked)}
  >
    <span className={ui.switchKnob} aria-hidden="true" />
  </button>
);

/** Звёзды рейтинга: отображение (readOnly) или ввод. */
export const StarRating = ({
  value,
  onChange,
  size = 18,
  readOnly = false,
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: number;
  readOnly?: boolean;
}) => {
  const [hover, setHover] = useState(0);
  const shown = hover || Math.round(value);

  return (
    <span className={ui.stars} role={readOnly ? "img" : undefined} aria-label={`Рейтинг ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        readOnly ? (
          <span key={n} className={`${ui.starStatic} ${n <= shown ? ui.starOn : ""}`.trim()}>
            <Star size={size} fill={n <= shown ? "currentColor" : "none"} strokeWidth={1.6} />
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={`${ui.starBtn} ${n <= shown ? ui.starOn : ""}`.trim()}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange?.(n)}
            aria-label={`${n} из 5`}
          >
            <Star size={size} fill={n <= shown ? "currentColor" : "none"} strokeWidth={1.6} />
          </button>
        ),
      )}
    </span>
  );
};

/**
 * Модальное окно в фирменном стиле: карточка-«окно macOS»
 * со светофором и моно-заголовком в тайтл-баре.
 */
export const Modal = ({
  open,
  onClose,
  title,
  children,
  maxWidth,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: number;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={ui.modalOverlay} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      {/* data-lenis-prevent: колесо над модалкой скроллит её содержимое, а не страницу */}
      <div
        className={ui.modalCard}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        <div className={ui.modalBar}>
          <span className={ui.modalDots} aria-hidden="true">
            <span className={ui.modalDot} />
            <span className={ui.modalDot} />
            <span className={ui.modalDot} />
          </span>
          <span className={ui.modalTitle}>{title}</span>
          <button type="button" className={ui.modalClose} onClick={onClose} aria-label="Закрыть">
            <X size={15} />
          </button>
        </div>
        <div className={ui.modalBody}>{children}</div>
      </div>
    </div>
  );
};

/** Портрет автора: фото либо яркий градиентный аватар с инициалом. */
export const Portrait = ({
  name,
  photoUrl,
  className,
  monoSize = 40,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
  monoSize?: number;
  /** совместимость со старыми вызовами (не используется) */
  record?: string;
}) => {
  const [failed, setFailed] = useState(false);
  const initial = (name || "•").trim().charAt(0).toUpperCase();
  const resolvedUrl = resolveUploadUrl(photoUrl);
  const showImg = resolvedUrl && !failed;

  return (
    <div className={`${ui.portrait} ${className ?? ""}`.trim()}>
      {showImg ? (
        <img src={resolvedUrl} alt={name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className={ui.monogram} style={{ fontSize: monoSize, background: pickGradient(name || initial) }} aria-hidden="true">
          {initial}
        </span>
      )}
    </div>
  );
};
