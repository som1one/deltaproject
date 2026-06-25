"use client";

import { useEffect, useState } from "react";

type LoadingSpinnerProps = {
  /** Delay before showing spinner (ms). Default 200ms */
  delay?: number;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Optional loading text */
  text?: string;
};

const sizeMap = { small: 20, medium: 32, large: 48 };

/**
 * Simple loading indicator with optional delay before appearing.
 */
export function LoadingSpinner({ delay = 200, size = "medium", text }: LoadingSpinnerProps) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  const px = sizeMap[size];

  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "2rem" }}
      role="status"
      aria-live="polite"
      aria-label="Загрузка"
    >
      <div
        style={{
          width: px,
          height: px,
          border: "3px solid var(--border, rgba(255,255,255,0.1))",
          borderTopColor: "var(--text-strong, currentColor)",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }}
      />
      {text && <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted, inherit)" }}>{text}</p>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
