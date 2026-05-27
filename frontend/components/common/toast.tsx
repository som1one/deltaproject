"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import styles from "@/components/common/toast.module.css";

type ToastTone = "success" | "error" | "info";

type ToastPayload = {
  id: number;
  tone: ToastTone;
  text: string;
};

type ToastContextValue = {
  toast: (text: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastPayload[]>([]);

  const toast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = ++counter;
    setItems((current) => [...current, { id, tone, text }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={styles.viewport} role="region" aria-live="polite" aria-label="Уведомления">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              className={`${styles.toast} ${styles[item.tone]}`}
              initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 12, filter: "blur(6px)" }}
              transition={{ duration: 0.4, ease: [0.16, 0.84, 0.3, 1] }}
            >
              <span className={styles.toastDot} aria-hidden />
              <span className={styles.toastText}>{item.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
};
