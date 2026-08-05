"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import styles from "./telegram-connect-row.module.css";

/* =========================================================
   Уведомления в Telegram — строка «банковской выписки».
   GET /me/telegram-connect: если бот ещё не подключён —
   кнопка с диплинком, иначе тихое «Подключены». Возврат на
   вкладку перепроверяет состояние сам (refetchOnWindowFocus).
   ========================================================= */

export const TelegramConnectRow = () => {
  const connectQuery = useQuery({
    queryKey: ["me", "telegram-connect"],
    queryFn: api.getTelegramConnect,
  });

  const data = connectQuery.data;
  if (!data) return null;

  return (
    <div className={styles.block}>
      <p className={styles.label}>Уведомления в Telegram</p>
      <div className={styles.row}>
        {data.connected ? (
          <>
            <span className={styles.text}>Бот присылает события по заказам и начислениям.</span>
            <span className={styles.connected}>Подключены</span>
          </>
        ) : (
          <>
            <span className={styles.text}>
              Нажмите Start в боте — придёт подтверждение.
            </span>
            <button
              type="button"
              className={styles.connectBtn}
              onClick={() => window.open(data.connect_url, "_blank", "noopener")}
            >
              Подключить бота
            </button>
          </>
        )}
      </div>
    </div>
  );
};
