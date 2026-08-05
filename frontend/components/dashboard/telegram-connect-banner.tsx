"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import styles from "./telegram-connect-banner.module.css";

/* =========================================================
   Приглашение подключить Telegram-бота — показывается воркеру
   при входе в кабинет, пока бот не подключён. «Позже» прячет
   до следующего визита (sessionStorage); после подключения
   баннер исчезает сам — queryKey общий с TelegramConnectRow,
   возврат из бота перепроверяет статус (refetchOnWindowFocus).
   ========================================================= */

const DISMISS_KEY = "tg-connect-banner-dismissed";

export const TelegramConnectBanner = () => {
  // Стартуем скрытыми, чтобы баннер не мигал до чтения sessionStorage
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const connectQuery = useQuery({
    queryKey: ["me", "telegram-connect"],
    queryFn: api.getTelegramConnect,
  });

  const data = connectQuery.data;
  if (dismissed || !data || data.connected) return null;

  return (
    <section className={styles.banner} aria-label="Подключение Telegram-уведомлений">
      <div className={styles.textCol}>
        <p className={styles.title}>Подключите Telegram-бота</p>
        <p className={styles.text}>
          Бот сообщит, когда по вашей ссылке зарегистрируется заказчик и когда
          придёт комиссия — не придётся проверять кабинет вручную.
        </p>
        <p className={styles.hint}>Откроется Telegram — нажмите Start, придёт подтверждение.</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.connectBtn}
          onClick={() => window.open(data.connect_url, "_blank", "noopener")}
        >
          Подключить бота
        </button>
        <button
          type="button"
          className={styles.laterBtn}
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          Позже
        </button>
      </div>
    </section>
  );
};
