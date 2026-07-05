"use client";

import { useState } from "react";

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
  const showImg = photoUrl && !failed;

  return (
    <div className={`${ui.portrait} ${className ?? ""}`.trim()}>
      {showImg ? (
        <img src={photoUrl} alt={name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className={ui.monogram} style={{ fontSize: monoSize, background: pickGradient(name || initial) }} aria-hidden="true">
          {initial}
        </span>
      )}
    </div>
  );
};
