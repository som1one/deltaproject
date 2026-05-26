"use client";

import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import styles from "@/components/common/copy-button.module.css";
import { useToast } from "@/components/common/toast";

/**
 * Копирование с graceful fallback: если `navigator.clipboard` недоступен
 * (например, страница открыта по http://, iframe-permission denied, старый
 * браузер) — используем document.execCommand("copy") через скрытый textarea.
 */
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (typeof window === "undefined" || !text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // переход к fallback ниже
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

type Kind = "primary" | "secondary" | "ghost" | "inline";

const iconCopy = "M9 9h10v12H9zM5 5h10v4M5 5v10";
const iconCheck = "M5 12l4 4L19 7";

const Icon = ({ d }: { d: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    width="14"
    height="14"
  >
    <path d={d} />
  </svg>
);

export const CopyButton = ({
  value,
  label = "Скопировать",
  toastText = "Скопировано в буфер",
  kind = "secondary",
  className,
  children,
}: {
  value: string;
  label?: string;
  toastText?: string;
  kind?: Kind;
  className?: string;
  children?: ReactNode;
}) => {
  const { toast } = useToast();
  const [done, setDone] = useState(false);

  const onClick = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setDone(true);
      toast(toastText, "success");
      window.setTimeout(() => setDone(false), 1600);
    } else {
      toast("Не удалось скопировать", "error");
    }
  };

  const cls = `${styles.btn} ${styles[kind]}${className ? ` ${className}` : ""}`;

  return (
    <button type="button" onClick={onClick} className={cls} disabled={!value}>
      <motion.span
        key={done ? "ok" : "copy"}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 0.84, 0.3, 1] }}
        className={styles.iconWrap}
      >
        <Icon d={done ? iconCheck : iconCopy} />
      </motion.span>
      <span>{children ?? (done ? "Готово" : label)}</span>
    </button>
  );
};
