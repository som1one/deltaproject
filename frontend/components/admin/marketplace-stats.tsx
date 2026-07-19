"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api";
import { formatMoney, formatNumber, pluralRu } from "@/lib/format";
import { LoadingSpinner } from "@/components/marketplace/loading-spinner";
import type { DailyCountPoint } from "@/lib/types";

import panelStyles from "./marketplace-panel.module.css";
import chartStyles from "./stat-charts.module.css";
import {
  ActivityHeatmap,
  ChartRangeSwitch,
  ColumnHistogram,
  DailyBarsChart,
  DonutChart,
  FunnelChart,
  HBarList,
  MoneyAreaChart,
  MoneyBarsChart,
  StackedDailyBarsChart,
  formatShortMoney,
  type ChartRange,
  type DailyMoneyPoint,
} from "./stat-charts";

/* ---------- Типы ответа /admin/marketplace/stats ---------- */

type DailyNewUsersPoint = { date: string; clients: number; bloggers: number };
type StatusSlice = { status: string; count: number; amount_kopeks: number };
type FunnelStage = { key: string; count: number };
type RatingBucket = { rating: number; count: number };
type AmountBucket = { label: string; count: number };
type TopBlogger = {
  user_id: string;
  name: string;
  orders: number;
  turnover_kopeks: number;
  completed: number;
  rating: number | null;
};
type TopClient = { user_id: string; name: string; orders: number; spend_kopeks: number };
type ServiceSlice = { name: string; orders: number; turnover_kopeks: number };

type StatsSummary = {
  gmv_total_kopeks: number;
  gmv_period_kopeks: number;
  platform_income_total_kopeks: number;
  platform_income_period_kopeks: number;
  escrow_now_kopeks: number;
  balances_owed_kopeks: number;
  refunded_period_kopeks: number;
  refunded_period_count: number;
  avg_check_period_kopeks: number;
  orders_total: number;
  orders_period: number;
  paid_period: number;
  completed_total: number;
  completed_period: number;
  conversion_paid_pct: number;
  avg_accept_hours: number | null;
  avg_completion_hours: number | null;
  clients_total: number;
  new_clients_period: number;
  buyers_period: number;
  repeat_buyers_period: number;
  bloggers_total: number;
  active_bloggers: number;
  new_bloggers_period: number;
  messages_period: number;
  offers_period: number;
  reviews_total: number;
  reviews_period: number;
  avg_rating: number | null;
  tickets_open: number;
  disputes_open: number;
  premium_new: number;
  moderation_pending: number;
  withdrawals_pending_count: number;
  withdrawals_pending_kopeks: number;
  withdrawals_completed_kopeks: number;
};

type StatsResponse = {
  range_days: number;
  generated_at: string;
  summary: StatsSummary;
  orders_daily: DailyCountPoint[];
  gmv_daily: DailyMoneyPoint[];
  completed_daily: DailyMoneyPoint[];
  platform_income_daily: DailyMoneyPoint[];
  new_users_daily: DailyNewUsersPoint[];
  messages_daily: DailyCountPoint[];
  reviews_daily: DailyCountPoint[];
  status_distribution: StatusSlice[];
  funnel: FunnelStage[];
  ratings: RatingBucket[];
  amounts_histogram: AmountBucket[];
  top_bloggers: TopBlogger[];
  top_clients: TopClient[];
  service_types: ServiceSlice[];
  activity_heatmap: number[][];
};

/* ---------- Словари ---------- */

// Фиксированный порядок статусов (живой цикл → терминальные) — от него же
// считается прозрачность сегментов доната, поэтому порядок не менять.
const STATUS_ORDER = [
  "COMPLETED",
  "ESCROW_HELD",
  "BLOGGER_CONFIRMED",
  "PENDING_PAYMENT",
  "OFFER_PENDING",
  "OFFER_DECLINED",
  "PAYMENT_FAILED",
  "REFUNDED",
  "CANCELLED",
];

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Завершён",
  ESCROW_HELD: "В работе (эскроу)",
  BLOGGER_CONFIRMED: "Сдан, ждёт приёмки",
  PENDING_PAYMENT: "Ожидает оплаты",
  OFFER_PENDING: "Оффер отправлен",
  OFFER_DECLINED: "Оффер отклонён",
  PAYMENT_FAILED: "Ошибка оплаты",
  REFUNDED: "Возврат",
  CANCELLED: "Отменён",
};

const FUNNEL_LABELS: Record<string, string> = {
  created: "Создано",
  accepted: "Принято",
  paid: "Оплачено",
  submitted: "Сдано",
  completed: "Завершено",
};

const formatHours = (hours: number | null): string => {
  if (hours === null) return "—";
  if (hours >= 48) return `${(hours / 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн`;
  return `${hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
};

/* ---------- Мелкие блоки ---------- */

const StatCard = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className={panelStyles.statCard}>
    <span className={panelStyles.statLabel}>{label}</span>
    <span className={panelStyles.statValue}>{value}</span>
    {hint ? <span className={chartStyles.statHint}>{hint}</span> : null}
  </div>
);

const ChartCard = ({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) => (
  <section className={panelStyles.section}>
    <h3 className={panelStyles.sectionTitle}>{title}</h3>
    {lead ? <p className={chartStyles.sectionLead}>{lead}</p> : null}
    {children}
  </section>
);

/* ---------- Вкладка «Статистика» ---------- */

export function MarketplaceStatsTab() {
  const [range, setRange] = useState<ChartRange>(30);

  const { data, isLoading, isError } = useQuery<StatsResponse>({
    queryKey: ["admin-marketplace-stats", range],
    queryFn: () =>
      apiRequest<StatsResponse>(`/admin/marketplace/stats?days=${range}`, { auth: true }),
  });

  if (isLoading) return <LoadingSpinner size="small" />;
  if (isError || !data) {
    return <p className={panelStyles.errorMsg}>Не удалось загрузить статистику маркетплейса.</p>;
  }

  const s = data.summary;

  const statusSlices = STATUS_ORDER.map((status) => {
    const slice = data.status_distribution.find((item) => item.status === status);
    return slice
      ? { label: STATUS_LABELS[status] ?? status, value: slice.count, hint: formatShortMoney(slice.amount_kopeks) }
      : null;
  }).filter((slice): slice is { label: string; value: number; hint: string } => slice !== null && slice.value > 0);

  const funnelStages = data.funnel.map((stage) => ({
    label: FUNNEL_LABELS[stage.key] ?? stage.key,
    count: stage.count,
  }));

  const newUsersPoints = data.new_users_daily.map((point) => ({
    date: point.date,
    primary: point.clients,
    secondary: point.bloggers,
  }));

  const ratingItems = [...data.ratings]
    .sort((a, b) => b.rating - a.rating)
    .map((bucket) => ({
      label: `${bucket.rating} ★`,
      value: bucket.count,
      valueLabel:
        s.reviews_total > 0
          ? `${formatNumber(bucket.count)} · ${Math.round((bucket.count / s.reviews_total) * 100)}%`
          : formatNumber(bucket.count),
    }));

  const topBloggerItems = data.top_bloggers.map((item) => ({
    label: item.name,
    value: item.turnover_kopeks,
    valueLabel: formatShortMoney(item.turnover_kopeks),
    hint: `· ${item.orders} ${pluralRu(item.orders, ["сделка", "сделки", "сделок"])}${
      item.rating !== null ? ` · ★ ${item.rating.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}` : ""
    }`,
  }));

  const topClientItems = data.top_clients.map((item) => ({
    label: item.name,
    value: item.spend_kopeks,
    valueLabel: formatShortMoney(item.spend_kopeks),
    hint: `· ${item.orders} ${pluralRu(item.orders, ["заказ", "заказа", "заказов"])}`,
  }));

  const serviceItems = data.service_types.map((item) => ({
    label: item.name,
    value: item.orders,
    valueLabel:
      item.turnover_kopeks > 0
        ? `${formatNumber(item.orders)} · ${formatShortMoney(item.turnover_kopeks)}`
        : formatNumber(item.orders),
  }));

  const updatedAt = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(data.generated_at));

  return (
    <>
      <div className={chartStyles.rangeHeader}>
        <ChartRangeSwitch value={range} onChange={setRange} />
        <span className={chartStyles.updatedNote}>Обновлено {updatedAt} мск</span>
      </div>

      {/* Ключевые показатели периода */}
      <div className={panelStyles.statsGrid}>
        <StatCard
          label="Оборот за период"
          value={formatMoney(s.gmv_period_kopeks)}
          hint={`за всё время ${formatMoney(s.gmv_total_kopeks)}`}
        />
        <StatCard
          label="Доход платформы"
          value={formatMoney(s.platform_income_period_kopeks)}
          hint={`за всё время ${formatMoney(s.platform_income_total_kopeks)}`}
        />
        <StatCard
          label="Средний чек"
          value={s.paid_period > 0 ? formatMoney(s.avg_check_period_kopeks) : "—"}
          hint={`${formatNumber(s.paid_period)} ${pluralRu(s.paid_period, ["оплата", "оплаты", "оплат"])} за период`}
        />
        <StatCard
          label="Конверсия в оплату"
          value={s.orders_period > 0 ? `${s.conversion_paid_pct.toLocaleString("ru-RU")}%` : "—"}
          hint={`из ${formatNumber(s.orders_period)} ${pluralRu(s.orders_period, ["заказа", "заказов", "заказов"])} за период`}
        />
        <StatCard
          label="Завершено сделок"
          value={formatNumber(s.completed_period)}
          hint={`за всё время ${formatNumber(s.completed_total)}`}
        />
        <StatCard
          label="Скорость сделки"
          value={formatHours(s.avg_completion_hours)}
          hint={`от оплаты до завершения · принятие ${formatHours(s.avg_accept_hours)}`}
        />
      </div>

      {/* Деньги */}
      <ChartCard
        title="Оборот по дням"
        lead={`Оплаченные заказы (эскроу): ${formatShortMoney(s.gmv_period_kopeks)} за ${data.range_days} дней. Наведите на график, чтобы увидеть день.`}
      >
        <MoneyAreaChart points={data.gmv_daily} ariaLabel="Оборот по дням" countNoun="оплат" />
      </ChartCard>

      <div className={chartStyles.chartsGrid}>
        <ChartCard
          title="Доход платформы по дням"
          lead="Фактические начисления комиссии в момент распределения средств."
        >
          <MoneyBarsChart
            points={data.platform_income_daily}
            ariaLabel="Доход платформы по дням"
            countNoun="начислений"
          />
        </ChartCard>
        <ChartCard title="Завершённые сделки по дням" lead="Суммы сделок, доведённых до завершения.">
          <MoneyBarsChart
            points={data.completed_daily}
            ariaLabel="Завершённые сделки по дням"
            countNoun="сделок"
          />
        </ChartCard>
      </div>

      {/* Заказы */}
      <ChartCard
        title="Новые заказы по дням"
        lead={`Создано за период: ${formatNumber(s.orders_period)}, всего в системе: ${formatNumber(s.orders_total)}.`}
      >
        <DailyBarsChart points={data.orders_daily} ariaLabel="Новые заказы по дням" />
      </ChartCard>

      <div className={chartStyles.chartsGrid}>
        <ChartCard title="Статусы заказов" lead="Все заказы за всё время по текущему статусу.">
          <DonutChart slices={statusSlices} centerLabel="заказов" ariaLabel="Распределение заказов по статусам" />
        </ChartCard>
        <ChartCard
          title="Воронка за период"
          lead="Когорта заказов, созданных за период: сколько дошло до каждого шага."
        >
          <FunnelChart stages={funnelStages} emptyText="За период не создано ни одного заказа." />
        </ChartCard>
      </div>

      <div className={chartStyles.chartsGrid}>
        <ChartCard title="Чеки оплаченных заказов" lead="Распределение сумм оплат за период, в рублях.">
          <ColumnHistogram items={data.amounts_histogram} ariaLabel="Гистограмма чеков" />
        </ChartCard>
        <ChartCard title="Услуги" lead="Заказы за период по типам услуг и их оплаченный оборот.">
          <HBarList items={serviceItems} emptyText="За период нет заказов." />
        </ChartCard>
      </div>

      {/* Люди */}
      <div className={panelStyles.statsGrid}>
        <StatCard
          label="Заказчики"
          value={formatNumber(s.clients_total)}
          hint={`новых за период ${formatNumber(s.new_clients_period)}`}
        />
        <StatCard
          label="Покупатели за период"
          value={formatNumber(s.buyers_period)}
          hint={`повторных ${formatNumber(s.repeat_buyers_period)}`}
        />
        <StatCard
          label="Активные авторы"
          value={formatNumber(s.active_bloggers)}
          hint={`всего ${formatNumber(s.bloggers_total)}`}
        />
        <StatCard label="Новые авторы" value={formatNumber(s.new_bloggers_period)} hint="за период" />
      </div>

      <ChartCard
        title="Новые пользователи по дням"
        lead="Регистрации заказчиков и появление новых авторов на площадке."
      >
        <StackedDailyBarsChart
          points={newUsersPoints}
          ariaLabel="Новые пользователи по дням"
          primaryLabel="Заказчики"
          secondaryLabel="Авторы"
        />
      </ChartCard>

      <div className={chartStyles.chartsGrid}>
        <ChartCard title="Топ авторов по обороту" lead="Оплаченные заказы за период.">
          <HBarList items={topBloggerItems} emptyText="За период не было оплат." />
        </ChartCard>
        <ChartCard title="Топ заказчиков по оплатам" lead="Кто принёс площадке больше всего за период.">
          <HBarList items={topClientItems} emptyText="За период не было оплат." />
        </ChartCard>
      </div>

      {/* Активность */}
      <div className={panelStyles.statsGrid}>
        <StatCard label="Сообщений за период" value={formatNumber(s.messages_period)} />
        <StatCard label="Офферов в чатах" value={formatNumber(s.offers_period)} hint="за период" />
        <StatCard
          label="Отзывы"
          value={formatNumber(s.reviews_total)}
          hint={`за период ${formatNumber(s.reviews_period)}`}
        />
        <StatCard
          label="Средняя оценка"
          value={s.avg_rating !== null ? `★ ${s.avg_rating.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}` : "—"}
          hint="по всем отзывам"
        />
      </div>

      <ChartCard
        title="Сообщения в чатах по дням"
        lead="Вся переписка заказчиков и авторов, включая офферы и системные события."
      >
        <DailyBarsChart points={data.messages_daily} ariaLabel="Сообщения по дням" />
      </ChartCard>

      <ChartCard
        title="Активность по часам"
        lead="Сообщения в чатах по дням недели и часам, время московское."
      >
        <ActivityHeatmap grid={data.activity_heatmap} ariaLabel="Теплокарта активности по часам" />
      </ChartCard>

      <div className={chartStyles.chartsGrid}>
        <ChartCard title="Оценки в отзывах" lead="Распределение всех оценок за всё время.">
          <HBarList items={ratingItems} emptyText="Отзывов пока нет." />
        </ChartCard>
        <ChartCard title="Отзывы по дням" lead="Новые отзывы за период.">
          <DailyBarsChart points={data.reviews_daily} ariaLabel="Отзывы по дням" />
        </ChartCard>
      </div>

      {/* Финансы и обслуживание */}
      <ChartCard
        title="Обязательства и обслуживание"
        lead="Снимок на текущий момент: деньги в эскроу, балансы авторов, выводы и очереди."
      >
        <div className={panelStyles.statsGrid}>
          <StatCard label="Сейчас в эскроу" value={formatMoney(s.escrow_now_kopeks)} hint="оплачено, работа идёт" />
          <StatCard label="На балансах" value={formatMoney(s.balances_owed_kopeks)} hint="заработано, не выведено" />
          <StatCard
            label="Выводы в ожидании"
            value={formatNumber(s.withdrawals_pending_count)}
            hint={`на ${formatMoney(s.withdrawals_pending_kopeks)}`}
          />
          <StatCard label="Выплачено всего" value={formatMoney(s.withdrawals_completed_kopeks)} />
          <StatCard
            label="Возвраты за период"
            value={formatNumber(s.refunded_period_count)}
            hint={`на ${formatMoney(s.refunded_period_kopeks)}`}
          />
          <StatCard
            label="Открытые тикеты"
            value={formatNumber(s.tickets_open)}
            hint={`из них споров ${formatNumber(s.disputes_open)}`}
          />
          <StatCard label="Премиум-заявки" value={formatNumber(s.premium_new)} hint="новые" />
          <StatCard label="Модерация статистики" value={formatNumber(s.moderation_pending)} hint="в очереди" />
        </div>
      </ChartCard>
    </>
  );
}
