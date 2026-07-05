"use client";

import { useState } from "react";

import { orderStatusLabel, orderStatusTone, type BadgeTone } from "@/lib/order-status";

import ui from "./ui.module.css";

const toneClass: Record<BadgeTone, string> = {
  neutral: ui.badge,
  success: ui.badgeSuccess,
  warning: ui.badgeWarning,
  danger: ui.badgeDanger,
  info: ui.badgeInfo,
  bronze: ui.badgeBronze,
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={toneClass[orderStatusTone(status)]}>{orderStatusLabel(status)}</span>
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

export const Avatar = ({ name, photoUrl, size = 56 }: { name: string; photoUrl?: string | null; size?: number }) => {
  const [failed, setFailed] = useState(false);
  const initial = (name || "•").trim().charAt(0).toUpperCase();

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={ui.avatar}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={ui.avatarFallback} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </span>
  );
};
