"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { MessageSquareText } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { ThreadList } from "@/components/chat/thread-list";
import { useAuth } from "@/lib/auth-context";
import {
  chatNotifyFlag,
  notificationsSupported,
  requestChatNotifications,
} from "@/lib/chat-notifications";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import land from "@/components/landing/landing.module.css";
import st from "@/components/chat/chat.module.css";

/**
 * Общий каркас страниц /chats: гард авторизации, заголовок с маркером
 * и macOS-окно с двумя панелями — треды слева, диалог (children) справа.
 * data-mode переключает панели на мобильных: список ↔ полноэкранный чат.
 */
export function ChatsShell({
  activePartnerId,
  children,
}: {
  activePartnerId?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger, isClient, userRole } = useAuth();

  const nextPath = activePartnerId ? `/chats/${activePartnerId}` : "/chats";

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
  }, [isAuthenticated, isHydrated, nextPath, router]);

  const authed = isHydrated && isAuthenticated;

  // Пользуется чатом — спрашиваем разрешение на уведомления о сообщениях
  // (один раз; выключить/включить можно в настройках аккаунта).
  useEffect(() => {
    if (!authed || !notificationsSupported()) return;
    if (Notification.permission === "default" && chatNotifyFlag() !== "0") {
      void requestChatNotifications();
    }
  }, [authed]);
  // Роль подтягивается асинхронно: пока null — показываем каркас, не отказ.
  const denied = authed && userRole !== null && !isBlogger && !isClient;

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={st.head}>
          <h1 className={st.headTitle}>
            Сообщения <span className={land.mark}>без посредников</span>
          </h1>
          <p className={st.headSub}>
            Обсуждайте детали, предлагайте услуги и заключайте сделки — не выходя из чата.
          </p>
        </header>

        {denied ? (
          <div className={ui.notice} style={{ marginBottom: 40 }}>
            Чаты доступны заказчикам и авторам. Войдите в аккаунт заказчика или автора,
            чтобы вести переписку.
          </div>
        ) : (
          <div className={st.win} data-mode={activePartnerId ? "dialog" : "list"}>
            <div className={st.winBar}>
              <span className={st.winDots}>
                <span className={st.winDot} />
                <span className={st.winDot} />
                <span className={st.winDot} />
              </span>
              <span className={st.winUrl}>marketplace.looneymoon.ru/chats</span>
            </div>
            <div className={st.winBody}>
              <aside className={st.side}>
                <ThreadList activePartnerId={activePartnerId} />
              </aside>
              <section className={st.pane}>{children}</section>
            </div>
          </div>
        )}
      </div>
    </MarketShell>
  );
}

/** Правая панель на /chats, пока диалог не выбран (десктоп). */
export function ChatPlaceholder() {
  return (
    <div className={st.placeholder}>
      <span className={st.placeholderIcon}>
        <MessageSquareText size={26} strokeWidth={1.8} />
      </span>
      <p className={st.placeholderTitle}>Выберите диалог</p>
      <p className={st.placeholderText}>
        Слева — ваши переписки. Откройте любую, чтобы продолжить разговор.
      </p>
    </div>
  );
}
