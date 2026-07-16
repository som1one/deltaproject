"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, MessageSquareText, Settings } from "lucide-react";

import { StampBadge } from "@/components/ui/bits";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatMoney } from "@/lib/format";
import { ACTIVE_ORDER_STATUSES, TERMINAL_ORDER_STATUSES } from "@/lib/order-status";
import { dealNo } from "@/lib/registry";
import type { Order, OrdersResponse, UserMeRead } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import land from "@/components/landing/landing.module.css";
import { ME_KEY, ORDERS_KEY } from "./keys";
import s from "./cabinet.module.css";

/** Деньги «на счёте платформы» — оплаченные, ещё не распределённые сделки. */
const IN_ESCROW = new Set<Order["status"]>(["ESCROW_HELD", "BLOGGER_CONFIRMED"]);

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className={ui.defRow}>
      <span className={ui.defKey}>{k}</span>
      <span className={ui.defValue}>{v}</span>
    </div>
  );
}

/** Кабинет заказчика: сводка по сделкам, история и аккаунт. */
export function ClientCabinet() {
  const { userName } = useAuth();

  const { data: me } = useQuery<UserMeRead>({
    queryKey: ME_KEY,
    queryFn: api.getMe,
  });

  const { data: ordersResp, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: ORDERS_KEY,
    queryFn: () => api.getOrders("?page_size=50"),
  });

  const orders = useMemo(() => {
    const items = ordersResp?.items ?? [];
    return [...items].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [ordersResp]);

  const activeDeals = useMemo(() => orders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status)), [orders]);
  const historyDeals = useMemo(() => orders.filter((o) => TERMINAL_ORDER_STATUSES.has(o.status)), [orders]);

  const stats = useMemo(() => {
    const escrow = orders.filter((o) => IN_ESCROW.has(o.status)).reduce((sum, o) => sum + o.amount_kopeks, 0);
    const spent = orders.filter((o) => o.status === "COMPLETED").reduce((sum, o) => sum + o.amount_kopeks, 0);
    const completed = orders.filter((o) => o.status === "COMPLETED").length;
    return { escrow, spent, completed };
  }, [orders]);

  const displayName = me?.name ?? userName ?? "Аккаунт";

  const statTiles: { value: string; label: string; href: string }[] = [
    { value: String(activeDeals.length), label: "в работе", href: "#active-placements" },
    { value: formatMoney(stats.escrow), label: "на счёте платформы", href: "/orders" },
    { value: formatMoney(stats.spent), label: "потрачено", href: "/orders" },
    { value: String(stats.completed), label: "завершено", href: "#history" },
  ];

  const renderDeal = (o: Order) => (
    <Link key={o.id} href={`/orders/${o.id}`} className={s.dealRow}>
      <span className={`${ui.mono} ${s.dealNo}`}>№&nbsp;{dealNo(o.id, o.created_at)}</span>
      <span className={s.dealWho}>
        <span className={s.dealName}>{o.blogger_name ?? "Автор"}</span>
        <span className={s.dealBrief}>{o.message}</span>
      </span>
      <span className={s.dealRight}>
        <span className={s.dealAmount}>{formatMoney(o.amount_kopeks)}</span>
        <StampBadge status={o.status} />
      </span>
    </Link>
  );

  return (
    <>
      <header className={s.head}>
        <h1 className={s.greeting}>
          С возвращением, <span className={land.mark}>{displayName}</span>
        </h1>
        <p className={s.sub}>
          Ваши размещения, статус денег на счёте платформы и история покупок — всё здесь.
        </p>
      </header>

      <nav className={s.statGrid} aria-label="Сводка по сделкам">
        {statTiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={s.statItem}
            aria-label={`${t.label}: ${t.value}. ${t.href.startsWith("#") ? "Перейти к разделу" : "Открыть реестр"}`}
          >
            <span className={s.statNum}>{t.value}</span>
            <span className={s.statText}>{t.label}</span>
            <ArrowUpRight className={s.statArrow} size={14} aria-hidden="true" />
          </Link>
        ))}
      </nav>

      <div className={s.layout}>
        <div className={s.col}>
          <section id="active-placements" className={`${ui.card} ${s.panel} ${s.anchorSection}`}>
            <div className={s.panelHead}>
              <h2 className={s.panelTitle}>Активные размещения</h2>
              {activeDeals.length > 0 && <span className={s.countPill}>{activeDeals.length}</span>}
            </div>
            {ordersLoading ? (
              <div className={ui.skeleton} style={{ height: 140 }} />
            ) : activeDeals.length === 0 ? (
              <div style={{ padding: "4px 0 2px" }}>
                <p className={ui.muted} style={{ margin: "0 0 16px", fontSize: 14.5 }}>
                  Нет активных размещений. Выберите автора в каталоге и оформите сделку.
                </p>
                <Link href="/catalog" className={ui.btnPrimary}>
                  Открыть каталог
                </Link>
              </div>
            ) : (
              <div className={s.dealList}>{activeDeals.slice(0, 5).map(renderDeal)}</div>
            )}
          </section>

          <section id="history" className={`${ui.card} ${s.panel} ${s.anchorSection}`}>
            <div className={s.panelHead}>
              <h2 className={s.panelTitle}>История покупок</h2>
              <Link href="/orders" className={s.seeAll}>
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
              <div className={s.dealList}>{historyDeals.slice(0, 5).map(renderDeal)}</div>
            )}
          </section>
        </div>

        <aside className={s.col}>
          <section className={`${ui.card} ${s.panel}`}>
            <h2 className={s.panelTitle} style={{ marginBottom: 14 }}>
              Аккаунт
            </h2>
            <div className={ui.defList}>
              <Row k="Имя" v={displayName} />
              {me?.email && <Row k="Почта" v={me.email} />}
              {me?.nickname && <Row k="Ник" v={`@${me.nickname}`} />}
              <Row k="Роль" v="Заказчик" />
            </div>
            <Link
              href="/chats"
              className={`${ui.btnLine} ${ui.btnSmall} ${ui.btnBlock}`}
              style={{ marginTop: 16, gap: 8 }}
            >
              <MessageSquareText size={15} /> Чаты с авторами
            </Link>
            <Link
              href="/settings"
              className={`${ui.btnLine} ${ui.btnSmall} ${ui.btnBlock}`}
              style={{ marginTop: 8, gap: 8 }}
            >
              <Settings size={15} /> Настроить аккаунт
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
