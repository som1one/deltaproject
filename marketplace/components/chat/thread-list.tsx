"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";

import { Portrait } from "@/components/ui/bits";
import { previewText, roleCaption, threadTime } from "@/components/chat/chat-utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ThreadsList as ThreadsListData } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import st from "@/components/chat/chat.module.css";

/** Список тредов: собеседник, последнее сообщение, непрочитанные. */
export function ThreadList({ activePartnerId }: { activePartnerId?: string }) {
  const { isHydrated, isAuthenticated, isBlogger } = useAuth();
  const enabled = isHydrated && isAuthenticated;

  const { data, isLoading, error } = useQuery<ThreadsListData>({
    queryKey: ["chat-threads"],
    queryFn: api.getThreads,
    enabled,
    refetchInterval: 5000,
  });

  const threads = data?.items ?? [];

  return (
    <>
      <div className={st.sideHead}>
        <span>Диалоги</span>
        {data != null && data.total_unread > 0 && (
          <span className={st.unread}>{data.total_unread > 99 ? "99+" : data.total_unread}</span>
        )}
      </div>

      {isLoading || !enabled ? (
        <div className={st.sideList} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={st.threadSkeleton}>
              <span className={ui.skeleton} style={{ width: 44, height: 44, borderRadius: "50%" }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <span className={ui.skeleton} style={{ height: 13, width: "60%" }} />
                <span className={ui.skeleton} style={{ height: 12, width: "85%" }} />
              </span>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={st.sideEmpty}>
          <p className={st.sideEmptyTitle}>Не получилось загрузить</p>
          <p className={st.sideEmptyText}>Обновите страницу — и переписки вернутся.</p>
        </div>
      ) : threads.length === 0 ? (
        <div className={st.sideEmpty}>
          <span className={st.sideEmptyIcon}>
            <MessagesSquare size={22} strokeWidth={1.8} />
          </span>
          <p className={st.sideEmptyTitle}>Пока нет диалогов</p>
          <p className={st.sideEmptyText}>
            {isBlogger
              ? "Когда заказчик напишет вам, переписка появится здесь."
              : "Напишите автору — переписка появится здесь."}
          </p>
          {!isBlogger && (
            <Link href="/catalog" className={`${ui.btnLine} ${ui.btnSmall}`}>
              Найти автора в каталоге
            </Link>
          )}
        </div>
      ) : (
        <nav className={st.sideList} aria-label="Диалоги">
          {threads.map((t) => {
            const active = t.partner.id === activePartnerId;
            const fromMe = t.last_message.sender_id !== t.partner.id;
            return (
              <Link
                key={t.partner.id}
                href={`/chats/${t.partner.id}`}
                className={active ? `${st.thread} ${st.threadActive}` : st.thread}
                aria-current={active ? "page" : undefined}
              >
                <Portrait
                  name={t.partner.name}
                  photoUrl={t.partner.photo_url}
                  className={st.threadAvatar}
                  monoSize={18}
                />
                <span className={st.threadBody}>
                  <span className={st.threadTop}>
                    <span className={st.threadName}>
                      {t.partner.name} <span className={st.threadRole}>· {roleCaption(t.partner)}</span>
                    </span>
                    <span className={st.threadTime}>{threadTime(t.last_message.created_at)}</span>
                  </span>
                  <span className={st.threadBottom}>
                    <span className={st.threadPreview}>
                      {fromMe ? "Вы: " : ""}
                      {previewText(t.last_message)}
                    </span>
                    {t.unread_count > 0 && (
                      <span className={st.unread}>{t.unread_count > 99 ? "99+" : t.unread_count}</span>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
