"use client";

import { useEffect, useState } from "react";
import styles from "./marketplace-ui.module.css";

type LoadingSpinnerProps = {
  /** Delay before showing spinner (ms). Default 200ms per requirement 12.5 */
  delay?: number;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Optional loading text */
  text?: string;
};

/**
 * Loading indicator that appears within 200ms of an async operation.
 * Validates: Requirement 12.5
 */
export function LoadingSpinner({ delay = 200, size = "medium", text }: LoadingSpinnerProps) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  const sizeClass =
    size === "small"
      ? styles.spinnerSmall
      : size === "large"
        ? styles.spinnerLarge
        : "";

  return (
    <div className={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Загрузка">
      <div className={`${styles.spinner} ${sizeClass}`} />
      {text && <p className={styles.loadingText}>{text}</p>}
    </div>
  );
}
