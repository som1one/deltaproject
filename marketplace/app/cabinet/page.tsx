"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, Gift, LayoutGrid, LifeBuoy, Receipt, Settings } from "lucide-react";

import { MarketShell } from "@/components/shell/shell";
import { CopyButton, StampBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";
import { dealNo } from "@/lib/registry";
import type { Order, OrdersResponse, UserMeRead } from "@/lib/types";

import shell from "@/components/shell/shell.module.css";
import ui from "@/components/ui/ui.module.css";
import s from "@/components/landing/landing.module.css";
import styles from "./cabinet.module.css";

/** Живые сделки, деньги на счёте платформы, завершённые/терминальные. */
const ACTIVE = new Set(["PENDING_PAYMENT", "ESCROW_HELD", "BLOGGER_CONFIRMED"]);
const IN_ESCROW = new Set(["ESCROW_HELD", "BLOGGER_CONFIRMED"]);
const TERMINAL = new Set(["COMPLETED", "REFUNDED", "CANCELLED"]);

type Tone = "violet" | "sky" | "amber" | "green";
const TONE: Record<Tone, { bg: string; fg: string }> = {
  violet: { bg: "var(--violet-soft)", fg: "var(--violet)" },
  sky: { bg: "var(--sky-soft)", fg: "var(--sky)" },
  amber: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  green: { bg: "var(--green-soft)", fg: "var(--green)" },
};

function Action({
  href,
  icon,
  title,
  sub,
  tone,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  sub: string;
  tone: Tone;
}) {
  const t = TONE[tone];
  return (
    <Link href={href} className={styles.action}>
      <span className={styles.actionIcon} style={{ background: t.bg, color: t.fg }}>
        {icon}
      </span>
      <span className={styles.actionText}>
        <span className={styles.actionTitle}>{title}</span>
        <span className={styles.actionSub}>{sub}</span>
      </span>
      <ArrowRight size={16} className={styles.actionArrow} />
    </Link>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className={ui.defRow}>
      <span className={ui.defKey}>{k}</span>
      <span className={ui.defValue}>{v}</span>
    </div>
  );
}

export default function CabinetPage() {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isBlogger, userName } = useAuth();

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/auth/login?next=/cabinet");
  }, [isAuthenticated, isHydrated, router]);

  const authed = isHydrated && isAuthenticated;

  const { data: me } = useQuery<UserMeRead>({
    queryKey: ["marketplace-me"],
    queryFn: api.getMe,
    enabled: authed,
  });

  const { data: ordersResp, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: ["marketplace-orders"],
    queryFn: () => api.getOrders("?page_size=50"),
    enabled: authed,
  });

  const { data: tickets } = useQuery({
    queryKey: ["marketplace-support-tickets"],
    queryFn: () => api.getTickets("?page_size=50"),
    enabled: authed,
  });

  const orders = useMemo(() => {
    const items = ordersResp?.items ?? [];
    return [...items].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [ordersResp]);

  const activeDeals = useMemo(() => orders.filter((o) => ACTIVE.has(o.status)), [orders]);
  const historyDeals = useMemo(() => orders.filter((o) => TERMINAL.has(o.status)), [orders]);

  const stats = useMemo(() => {
    const escrow = orders.filter((o) => IN_ESCROW.has(o.status)).reduce((sum, o) => sum + o.amount_kopeks, 0);
    const spent = orders.filter((o) => o.status === "COMPLETED").reduce((sum, o) => sum + o.amount_kopeks, 0);
    const completed = orders.filter((o) => o.status === "COMPLETED").length;
    return { escrow, spent, completed };
  }, [orders]);

  const openTickets = tickets?.items.filter((t) => t.status === "open").length ?? 0;
  const displayName = me?.name ?? userName ?? "Аккаунт";

  const statTiles: { value: string; label: string; hint?: string }[] = isBlogger
    ? [
        { value: String(activeDeals.length), label: "Активных сделок" },
        {
          value: formatMoney(me?.balance_pending_confirmation_kopeks ?? 0),
          label: "Ожидает выплаты",
          hint: "переведём после подтверждения",
        },
        { value: String(stats.completed), label: "Завершено сделок" },
      ]
    : [
        { value: String(activeDeals.length), label: "Сделок в работе" },
        { value: formatMoney(stats.escrow), label: "На счёте платформы", hint: "деньги под защитой до результата" },
        { value: formatMoney(stats.spent), label: "Потрачено всего", hint: "по завершённым сделкам" },
        { value: String(stats.completed), label: "Завершено сделок" },
      ];

  const renderDeal = (o: Order) => (
    <Link key={o.id} href={`/orders/${o.id}`} className={styles.dealRow}>
      <span className={`${ui.mono} ${styles.dealNo}`}>№&nbsp;{dealNo(o.id, o.created_at)}</span>
      <span className={styles.dealWho}>
        <span className={styles.dealName}>{isBlogger ? o.client_name ?? "Заказчик" : o.blogger_name ?? "Автор"}</span>
        <span className={styles.dealBrief}>{o.message}</span>
      </span>
      <span className={styles.dealRight}>
        <span className={styles.dealAmount}>{formatMoney(o.amount_kopeks)}</span>
        <StampBadge status={o.status} />
      </span>
    </Link>
  );

  // До гидрации/редиректа показываем мягкий скелет вместо гостевого мигания.
  if (!authed) {
    return (
      <MarketShell>
        <div className={shell.pageContainer}>
          <div className={styles.head}>
            <div className={ui.skeleton} style={{ height: 128, width: "100%", maxWidth: 460 }} />
          </div>
        </div>
      </MarketShell>
    );
  }

  return (
    <MarketShell>
      <div className={shell.pageContainer}>
        <header className={styles.head}>
          <div>
            <span className={ui.brow}>Личный кабинет</span>
            <h1 className={styles.greeting}>
              С возвращением, <span className={s.mark}>{displayName}</span>
            </h1>
            <p className={styles.sub}>
              {isBlogger
                ? "Входящие сделки, выплаты и всё по вашим публикациям — в одном месте."
                : "Ваши размещения, статус денег на счёте платформы и быстрый доступ к каталогу, истории и поддержке — всё здесь."}
            </p>
          </div>
          <div className={styles.accountChip}>
            <span className={styles.accountRole}>{isBlogger ? "автор" : "заказчик"}</span>
            <span className={styles.accountName}>{displayName}</span>
            {me?.email && <span className={styles.accountMeta}>{me.email}</span>}
          </div>
        </header>

        <div className={styles.statsRow}>
          {statTiles.map((t) => (
            <div key={t.label} className={styles.statCard}>
              <div className={styles.statValue}>{t.value}</div>
              <div className={styles.statLabel}>{t.label}</div>
              {t.hint && <div className={styles.statHint}>{t.hint}</div>}
            </div>
          ))}
        </div>

        <div className={styles.layout}>
          {/* Нынешняя реклама + история */}
          <div className={styles.col}>
            <section className={ui.card} style={{ padding: "22px 24px" }}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>{isBlogger ? "Активные сделки" : "Активные размещения"}</h2>
                {activeDeals.length > 0 && <span className={styles.countPill}>{activeDeals.length}</span>}
              </div>
              {ordersLoading ? (
                <div className={ui.skeleton} style={{ height: 140 }} />
              ) : activeDeals.length === 0 ? (
                <div style={{ padding: "4px 0 2px" }}>
                  <p className={ui.muted} style={{ margin: "0 0 16px", fontSize: 14.5 }}>
                    {isBlogger
                      ? "Сейчас нет активных сделок — они появятся, когда заказчик оплатит заказ."
                      : "Нет активных размещений. Выберите автора в каталоге и оформите сделку."}
                  </p>
                  {!isBlogger && (
                    <Link href="/catalog" className={ui.btnPrimary}>
                      Открыть каталог
                    </Link>
                  )}
                </div>
              ) : (
                <div className={styles.dealList}>{activeDeals.slice(0, 5).map(renderDeal)}</div>
              )}
            </section>

            <section className={ui.card} style={{ padding: "22px 24px" }}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>{isBlogger ? "История сделок" : "История покупок"}</h2>
                <Link href="/orders" className={styles.seeAll}>
                  Все сделки <ArrowRight size={14} />
                </Link>
              </div>
              {ordersLoading ? (
                <div className={ui.skeleton} style={{ height: 100 }} />
              ) : historyDeals.length === 0 ? (
                <p className={ui.muted} style={{ margin: "2px 0", fontSize: 14 }}>
                  Завершённых сделок пока нет.
                </p>
              ) : (
                <div className={styles.dealList}>{historyDeals.slice(0, 5).map(renderDeal)}</div>
              )}
            </section>
          </div>

          {/* Действия · аккаунт · реферал */}
          <aside className={styles.col}>
            <section className={ui.card} style={{ padding: "18px 20px" }}>
              <h2 className={styles.panelTitle} style={{ marginBottom: 14 }}>
                Быстрые действия
              </h2>
              <div className={styles.actionGrid}>
                {isBlogger ? (
                  <Action href="/orders" icon={<Receipt size={18} />} tone="violet" title="Мои сделки" sub="Входящие и история" />
                ) : (
                  <>
                    <Action
                      href="/catalog"
                      icon={<LayoutGrid size={18} />}
                      tone="violet"
                      title="Каталог авторов"
                      sub="Найти блогера и оформить сделку"
                    />
                    <Action href="/orders" icon={<Receipt size={18} />} tone="sky" title="Мои сделки" sub="Статусы и оплата" />
                  </>
                )}
                <Action
                  href="/support"
                  icon={<LifeBuoy size={18} />}
                  tone="amber"
                  title="Поддержка и споры"
                  sub={openTickets > 0 ? `${openTickets} в работе` : "Помощь по сделке"}
                />
              </div>
            </section>

            <section className={ui.card} style={{ padding: "18px 20px" }}>
              <h2 className={styles.panelTitle} style={{ marginBottom: 14 }}>
                Аккаунт
              </h2>
              <div className={ui.defList}>
                <Row k="Имя" v={displayName} />
                {me?.email && <Row k="Почта" v={me.email} />}
                {me?.nickname && <Row k="Ник" v={`@${me.nickname}`} />}
                {me?.telegram && <Row k="Telegram" v={me.telegram} />}
                <Row k="Роль" v={isBlogger ? "Автор" : "Заказчик"} />
              </div>
              {isBlogger && me?.payout_card_last4 && (
                <div className={styles.payoutCard}>
                  <CreditCard size={16} />
                  <span>
                    {me.payout_card_brand ?? "Карта"} ·· {me.payout_card_last4}
                    {me.payout_card_bank ? ` · ${me.payout_card_bank}` : ""}
                  </span>
                </div>
              )}
              <Link
                href="/settings"
                className={`${ui.btnLine} ${ui.btnSmall} ${ui.btnBlock}`}
                style={{ marginTop: 16, gap: 8 }}
              >
                <Settings size={15} /> Настроить аккаунт
              </Link>
            </section>

            {me?.referral_invite_url && (
              <section className={ui.card} style={{ padding: "18px 20px" }}>
                <div className={styles.referralHead}>
                  <span className={styles.referralIcon}>
                    <Gift size={18} />
                  </span>
                  <h2 className={styles.panelTitle}>Пригласить друга</h2>
                </div>
                <p className={ui.muted} style={{ margin: "0 0 12px", fontSize: 13.5 }}>
                  Поделитесь ссылкой — и получайте бонусы за приглашённых.
                </p>
                <div className={styles.referralRow}>
                  <input
                    className={`${ui.input} ${ui.mono}`}
                    readOnly
                    value={me.referral_invite_url}
                    style={{ fontSize: 12.5 }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <CopyButton value={me.referral_invite_url} label="Копировать" />
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </MarketShell>
  );
}
