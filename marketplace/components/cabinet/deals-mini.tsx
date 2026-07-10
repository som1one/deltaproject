"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { StampBadge } from "@/components/ui/bits";
import { formatMoney } from "@/lib/format";
import { dealNo } from "@/lib/registry";
import type { Order } from "@/lib/types";

import ui from "@/components/ui/ui.module.css";
import s from "./cabinet.module.css";

/**
 * Компактный блок «Активные сделки»: максимум `limit` строк
 * и ссылка на полный реестр. Живёт в сайдбаре кабинета.
 */
export function DealsMini({
  orders,
  isLoading,
  isBlogger,
  limit = 3,
}: {
  orders: Order[];
  isLoading: boolean;
  isBlogger: boolean;
  limit?: number;
}) {
  return (
    <section className={`${ui.card} ${s.panel}`}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Активные сделки</h2>
        {orders.length > 0 && <span className={s.countPill}>{orders.length}</span>}
      </div>

      {isLoading ? (
        <div className={ui.skeleton} style={{ height: 110 }} />
      ) : orders.length === 0 ? (
        <p className={ui.muted} style={{ margin: "2px 0", fontSize: 13.5 }}>
          {isBlogger
            ? "Сейчас активных сделок нет — новые офферы появятся здесь."
            : "Сейчас активных сделок нет."}
        </p>
      ) : (
        <div className={s.miniList}>
          {orders.slice(0, limit).map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className={s.miniRow}>
              <span className={s.miniWho}>
                <span className={s.miniName}>
                  {isBlogger ? o.client_name ?? "Заказчик" : o.blogger_name ?? "Автор"}
                </span>
                <span className={s.miniNo}>№&nbsp;{dealNo(o.id, o.created_at)}</span>
              </span>
              <span className={s.miniRight}>
                <span className={s.miniAmount}>{formatMoney(o.amount_kopeks)}</span>
                <StampBadge status={o.status} />
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link href="/orders" className={s.seeAll} style={{ marginTop: 12, display: "inline-flex" }}>
        Все сделки <ArrowRight size={14} />
      </Link>
    </section>
  );
}
