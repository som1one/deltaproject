"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  PackagePlus,
  Paperclip,
  SendHorizontal,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";

import { Modal, Portrait, StarRating } from "@/components/ui/bits";
import { categoryLabel } from "@/components/catalog/blogger-card";
import { OfferCard } from "@/components/chat/offer-card";
import { OfferModal } from "@/components/chat/offer-modal";
import { dayKey, dayLabel, plural, roleCaption, timeShort } from "@/components/chat/chat-utils";
import { api, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { resolveUploadUrl } from "@/lib/config";
import type { ChatMessage, Conversation as ConversationData, UserPeek } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import st from "@/components/chat/chat.module.css";

const SAFETY_KEY = "mp-chat-safety-dismissed";
const MAX_COMPOSER_HEIGHT = 132; // ~6 строк

const appear = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

/** Диалог с собеседником: лента, оффер-карточки, композер. */
export function Conversation({ partnerId }: { partnerId: string }) {
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated } = useAuth();
  const enabled = isHydrated && isAuthenticated;

  const convKey = useMemo(() => ["chat-conversation", partnerId] as const, [partnerId]);

  const { data, isLoading, error } = useQuery<ConversationData>({
    queryKey: convKey,
    queryFn: () => api.getConversation(partnerId, "?page_size=100"),
    enabled,
    refetchInterval: 3000,
  });

  const partner = data?.partner ?? null;
  const items = useMemo(() => data?.items ?? [], [data?.items]);

  /* ── Прочитанность: при открытии и при новых входящих ───── */
  const markedOnceRef = useRef(false);
  const hasUnreadIncoming = items.some((m) => m.sender_id === partnerId && !m.is_read);

  useEffect(() => {
    markedOnceRef.current = false;
  }, [partnerId]);

  useEffect(() => {
    if (!data) return;
    if (markedOnceRef.current && !hasUnreadIncoming) return;
    markedOnceRef.current = true;
    api
      .markThreadRead(partnerId)
      .then(() => {
        // Локально гасим флажки, чтобы не дёргать read на каждый рефетч.
        queryClient.setQueryData<ConversationData>(["chat-conversation", partnerId], (old) =>
          old
            ? {
                ...old,
                items: old.items.map((m) =>
                  m.sender_id === partnerId ? { ...m, is_read: true } : m,
                ),
              }
            : old,
        );
        queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      })
      .catch(() => {
        markedOnceRef.current = false;
      });
  }, [data, hasUnreadIncoming, partnerId, queryClient]);

  /* ── Автоскролл: держимся у низа, пока пользователь там ─── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  useEffect(() => {
    didInitialScrollRef.current = false;
    stickRef.current = true;
  }, [partnerId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const lastMessageId = items.length > 0 ? items[items.length - 1].id : null;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    if (!didInitialScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
      return;
    }
    if (stickRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId, items.length]);

  /* ── Плашка безопасности ──────────────────────────────────── */
  const [safetyDismissed, setSafetyDismissed] = useState(true);
  useEffect(() => {
    setSafetyDismissed(window.localStorage.getItem(SAFETY_KEY) === "1");
  }, []);
  const dismissSafety = () => {
    window.localStorage.setItem(SAFETY_KEY, "1");
    setSafetyDismissed(true);
  };

  /* ── Отправка с оптимистичным сообщением ─────────────────── */
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autogrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  };

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.sendMessage({ recipient_id: partnerId, text: body }),
    onMutate: async (body: string) => {
      await queryClient.cancelQueries({ queryKey: convKey });
      const previous = queryClient.getQueryData<ConversationData>(convKey);
      const temp: ChatMessage = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender_id: "me",
        recipient_id: partnerId,
        text: body,
        kind: "text",
        order_id: null,
        payload: null,
        is_read: false,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<ConversationData>(convKey, (old) =>
        old
          ? { ...old, items: [...old.items, temp], total: old.total + 1 }
          : { items: [temp], total: 1, page: 1, page_size: 100, partner: null },
      );
      return { previous };
    },
    onError: (_err, _body, context) => {
      if (context?.previous) queryClient.setQueryData(convKey, context.previous);
      setSendError("Сообщение не отправилось. Проверьте связь и попробуйте ещё раз.");
    },
    onSuccess: () => setSendError(null),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: convKey });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setSendError(null);
    stickRef.current = true;
    sendMutation.mutate(body);
    setText("");
    requestAnimationFrame(autogrow);
  };

  const onComposerKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* ── Вложения: загрузка картинки → сообщение kind=image ──── */
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const sendAttachment = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setSendError("Можно отправлять только изображения: JPEG, PNG, WebP, GIF.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSendError(`Файл больше ${MAX_UPLOAD_MB} МБ — сожмите изображение и попробуйте снова.`);
      return;
    }
    setSendError(null);
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      // Текст из композера уходит подписью к фото
      const caption = text.trim();
      await api.sendMessage({ recipient_id: partnerId, text: caption, attachment_url: url });
      if (caption) {
        setText("");
        requestAnimationFrame(autogrow);
      }
      stickRef.current = true;
      queryClient.invalidateQueries({ queryKey: convKey });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    } catch (e) {
      setSendError(e instanceof Error && e.message ? e.message : "Не удалось отправить файл.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ── Модалки ──────────────────────────────────────────────── */
  const [peekOpen, setPeekOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  /* ── Группировка по дням ─────────────────────────────────── */
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ChatMessage[] }[] = [];
    for (const m of items) {
      const key = dayKey(m.created_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(m);
      else out.push({ key, label: dayLabel(m.created_at), items: [m] });
    }
    return out;
  }, [items]);

  return (
    <>
      {/* Шапка диалога */}
      <div className={st.paneHead}>
        <Link href="/chats" className={st.backBtn} aria-label="К списку диалогов">
          <ArrowLeft size={18} />
        </Link>
        {partner ? (
          <button type="button" className={st.peerBtn} onClick={() => setPeekOpen(true)}>
            <Portrait
              name={partner.name}
              photoUrl={partner.photo_url}
              className={st.peerAvatar}
              monoSize={16}
            />
            <span className={st.peerMeta}>
              <span className={st.peerName}>{partner.name}</span>
              <span className={st.peerRole}>{roleCaption(partner)}</span>
            </span>
          </button>
        ) : (
          <span className={st.peerBtn} aria-hidden="true">
            <span className={ui.skeleton} style={{ width: 38, height: 38, borderRadius: "50%" }} />
            <span className={st.peerMeta} style={{ gap: 6 }}>
              <span className={ui.skeleton} style={{ height: 13, width: 120 }} />
              <span className={ui.skeleton} style={{ height: 11, width: 64 }} />
            </span>
          </span>
        )}
      </div>

      {/* Плашка безопасности */}
      {!safetyDismissed && (
        <div className={`${ui.noticeWarning} ${st.safety}`} role="note">
          <span className={st.safetyIcon}>
            <ShieldAlert size={17} strokeWidth={2} />
          </span>
          <span>
            Оставайтесь в чате платформы: сделки и оплата защищены только здесь. Не
            переходите в сторонние мессенджеры.
          </span>
          <button type="button" className={st.safetyClose} onClick={dismissSafety} aria-label="Скрыть">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Лента */}
      {isLoading || !enabled ? (
        <div className={st.msgSkeletons} aria-hidden="true">
          <span className={ui.skeleton} style={{ height: 38, width: "45%", borderRadius: 18 }} />
          <span
            className={ui.skeleton}
            style={{ height: 38, width: "55%", borderRadius: 18, alignSelf: "flex-end" }}
          />
          <span className={ui.skeleton} style={{ height: 56, width: "60%", borderRadius: 18 }} />
          <span
            className={ui.skeleton}
            style={{ height: 38, width: "40%", borderRadius: 18, alignSelf: "flex-end" }}
          />
        </div>
      ) : error ? (
        <div className={st.scroll}>
          <div className={`${ui.noticeDanger} ${st.paneNotice}`}>
            Не удалось загрузить переписку. Обновите страницу.
          </div>
        </div>
      ) : (
        // data-lenis-prevent: глобальный плавный скролл не перехватывает колесо над лентой
        <div className={st.scroll} ref={scrollRef} onScroll={handleScroll} data-lenis-prevent>
          {items.length === 0 && (
            <div className={st.placeholder}>
              <p className={st.placeholderTitle}>Сообщений пока нет</p>
              <p className={st.placeholderText}>
                Поздоровайтесь и расскажите о задаче — или сразу предложите условия кнопкой «плюс».
              </p>
            </div>
          )}
          {groups.map((group) => (
            <Fragment key={group.key}>
              <div className={st.dayRow}>
                <span className={st.dayPill}>{group.label}</span>
              </div>
              {group.items.map((m) => (
                <MessageRow key={m.id} msg={m} partnerId={partnerId} />
              ))}
            </Fragment>
          ))}
        </div>
      )}

      {/* Композер */}
      <div className={st.composerBox}>
        {sendError && <div className={`${ui.noticeDanger} ${st.sendError}`}>{sendError}</div>}
        <div className={st.composer}>
          <button
            type="button"
            className={st.plusBtn}
            onClick={() => setOfferOpen(true)}
            aria-label="Предложить услугу"
            title="Предложить услугу"
          >
            <PackagePlus size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={st.plusBtn}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Прикрепить изображение"
            title="Прикрепить изображение"
          >
            {uploading ? (
              <Loader2 size={18} strokeWidth={2} className={st.spin} />
            ) : (
              <Paperclip size={18} strokeWidth={2} />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void sendAttachment(file);
            }}
          />
          <textarea
            ref={textareaRef}
            className={st.composerInput}
            rows={1}
            maxLength={2000}
            data-lenis-prevent
            value={text}
            placeholder="Сообщение…"
            onChange={(e) => setText(e.target.value)}
            onInput={autogrow}
            onKeyDown={onComposerKeyDown}
            aria-label="Текст сообщения"
          />
          <button
            type="button"
            className={st.sendBtn}
            onClick={send}
            disabled={text.trim() === ""}
            aria-label="Отправить"
          >
            <SendHorizontal size={17} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Модалки */}
      <PeekModal partnerId={partnerId} open={peekOpen} onClose={() => setPeekOpen(false)} />
      <OfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        partnerId={partnerId}
        partnerIsBlogger={partner?.is_blogger ?? false}
      />
    </>
  );
}

/* ── Одно сообщение ленты ───────────────────────────────────── */

function MessageRow({ msg, partnerId }: { msg: ChatMessage; partnerId: string }) {
  const mine = msg.sender_id !== partnerId;
  const pending = msg.id.startsWith("temp-");

  if (msg.kind === "system") {
    return (
      <motion.div className={st.sysRow} {...appear}>
        <span className={st.sysPill}>
          {msg.text}
          {msg.order_id && (
            <>
              {" · "}
              <Link href={`/orders/${msg.order_id}`} className={st.sysLink}>
                Открыть сделку
              </Link>
            </>
          )}
        </span>
      </motion.div>
    );
  }

  if (msg.kind === "offer") {
    return (
      <motion.div {...appear}>
        <OfferCard msg={msg} partnerId={partnerId} />
      </motion.div>
    );
  }

  if (msg.kind === "image") {
    const src = resolveUploadUrl(msg.payload?.attachment_url ?? null);
    return (
      <motion.div className={`${st.msgRow} ${mine ? st.msgRowOut : ""}`.trim()} {...appear}>
        <div
          className={`${st.bubble} ${st.bubbleImg} ${mine ? st.bubbleOut : st.bubbleIn} ${pending ? st.pending : ""}`.trim()}
        >
          {src && (
            <a href={src} target="_blank" rel="noopener noreferrer" className={st.msgImageLink}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Изображение из чата" className={st.msgImage} loading="lazy" />
            </a>
          )}
          {msg.text && <span className={st.msgImageCaption}>{msg.text}</span>}
          <span className={`${st.bubbleTime} ${msg.text ? "" : st.bubbleTimeOverlay}`.trim()}>
            {timeShort(msg.created_at)}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className={`${st.msgRow} ${mine ? st.msgRowOut : ""}`.trim()} {...appear}>
      <div
        className={`${st.bubble} ${mine ? st.bubbleOut : st.bubbleIn} ${pending ? st.pending : ""}`.trim()}
      >
        {msg.text}
        <span className={st.bubbleTime}>{timeShort(msg.created_at)}</span>
      </div>
    </motion.div>
  );
}

/* ── Модалка «Профиль» собеседника ──────────────────────────── */

function PeekModal({
  partnerId,
  open,
  onClose,
}: {
  partnerId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<UserPeek>({
    queryKey: ["chat-peek", partnerId],
    queryFn: () => api.peekUser(partnerId),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <Modal open={open} onClose={onClose} title="Профиль" maxWidth={420}>
      {isLoading ? (
        <div className={st.peek} aria-hidden="true">
          <span className={ui.skeleton} style={{ width: 84, height: 84, borderRadius: "50%" }} />
          <span className={ui.skeleton} style={{ height: 20, width: 150, marginTop: 16 }} />
          <span className={ui.skeleton} style={{ height: 14, width: 110, marginTop: 8 }} />
          <span className={ui.skeleton} style={{ height: 48, width: "100%", marginTop: 24 }} />
        </div>
      ) : error || !data ? (
        <div className={ui.noticeDanger}>Не удалось загрузить профиль. Попробуйте ещё раз.</div>
      ) : (
        <div className={st.peek}>
          <Portrait
            name={data.name}
            photoUrl={data.photo_url}
            className={st.peekAvatar}
            monoSize={32}
          />
          <span className={st.peekName}>{data.name}</span>
          <span
            className={data.is_blogger ? `${st.peekRole} ${st.peekRoleAuthor}` : st.peekRole}
          >
            {data.is_blogger ? (
              <BadgeCheck size={14} strokeWidth={2.2} />
            ) : (
              <UserRound size={14} strokeWidth={2.2} />
            )}
            <span>{data.is_blogger ? "Автор" : "Заказчик"}</span>
            {data.category && (
              <span className={st.peekRoleDim}>· {categoryLabel(data.category)}</span>
            )}
          </span>

          {data.reviews_count > 0 ? (
            <span className={st.peekStars}>
              <StarRating value={data.rating ?? 0} readOnly size={16} />
              <span>
                {data.reviews_count} {plural(data.reviews_count, ["отзыв", "отзыва", "отзывов"])}
              </span>
            </span>
          ) : (
            <span className={st.peekNoReviews}>Отзывов пока нет</span>
          )}

          <div className={st.peekRule} aria-hidden="true" />

          <div className={st.peekStats}>
            <div className={st.peekStat}>
              <span
                className={
                  data.completed_orders === 0
                    ? `${st.peekStatValue} ${st.peekStatZero}`
                    : st.peekStatValue
                }
              >
                {data.completed_orders}
              </span>
              <span className={st.peekStatLabel}>
                {plural(data.completed_orders, [
                  "сделка завершена",
                  "сделки завершено",
                  "сделок завершено",
                ])}
              </span>
            </div>
            <span className={st.peekStatDivider} aria-hidden="true" />
            <div className={st.peekStat}>
              <span className={st.peekStatValue}>
                {data.registered_at
                  ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
                      .format(new Date(data.registered_at))
                      .replace(" г.", "")
                  : "недавно"}
              </span>
              <span className={st.peekStatLabel}>на платформе</span>
            </div>
          </div>

          {data.is_blogger && (
            <Link href={`/bloggers/${data.id}`} className={`${ui.btnPrimary} ${st.peekCta}`}>
              Открыть карточку
            </Link>
          )}
        </div>
      )}
    </Modal>
  );
}
