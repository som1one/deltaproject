"use client";

import { formatDealStatus, formatMoney, formatNumber, pluralRu } from "@/lib/format";
import type { PlatformFinanceDashboard, ReportingPeriod } from "@/lib/types";
import { Button, Message, Pill, PillRow, SectionCard, Stack } from "@/components/common/ui";

import styles from "@/components/admin/admin.module.css";
import chartStyles from "@/components/admin/stat-charts.module.css";
import {
  ActivityHeatmap,
  ColumnHistogram,
  DonutChart,
  FunnelChart,
  HBarList,
  MoneyAreaChart,
  MoneyBarsChart,
  StackedDailyBarsChart,
  formatShortMoney,
} from "@/components/admin/stat-charts";

/**
 * Раздел «Финансовая аналитика» админки: период → деньги → сделки → люди.
 * Компонент только рисует; все агрегаты приходят готовыми из
 * services/finance_stats_service.py (группы A–H).
 */

const PERIOD_OPTIONS: { value: ReportingPeriod; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "all", label: "Всё время" },
];

/** Подпись периода для пояснений под цифрами. */
const PERIOD_NOUN: Record<ReportingPeriod, string> = {
  today: "сегодня",
  week: "за 7 дней",
  month: "за 30 дней",
  all: "за всё время",
};

/** Что показывает сравнение с предыдущим отрезком такой же длины. */
const PREVIOUS_NOUN: Record<ReportingPeriod, string> = {
  today: "вчера к этому часу",
  week: "к прошлой неделе",
  month: "к прошлым 30 дням",
  all: "",
};

// Порядок статусов в донате: живой цикл → терминальные. От него же зависит
// прозрачность сегментов, поэтому порядок не менять.
const STATUS_ORDER = [
  "COMPLETED",
  "PAID",
  "ESCROW_HELD",
  "CONFIRMED",
  "REVIEW",
  "NEW",
  "REJECTED",
  "REFUNDED",
];

const FUNNEL_LABELS: Record<string, string> = {
  created: "Создано",
  review: "Проверка",
  confirmed: "Подтверждено",
  escrow: "Эскроу",
  paid: "Оплачено",
  completed: "Выполнено",
};

const ROLE_LABELS: Record<string, string> = {
  worker: "Воркер",
  bloger: "Блогер",
  blogger: "Блогер",
  upline: "Аплайн",
  platform: "Платформа",
};

const roleLabel = (key: string): string => ROLE_LABELS[key.toLowerCase()] ?? key;

const formatPct = (value: number): string =>
  `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

/** Часы в человеческом виде: минуты до часа, дни после двух суток. */
const formatHours = (hours: number | null): string => {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} мин`;
  if (hours >= 48) return `${(hours / 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн`;
  return `${hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
};

/**
 * Дельта к предыдущему отрезку. Рост с нуля процентом не выражается — в этом
 * случае показываем абсолютную прибавку, иначе получилось бы «+∞%».
 */
const deltaHint = (
  current: number,
  previous: number | null | undefined,
  suffix: string,
  render: (value: number) => string,
): { text: string; tone: "up" | "down" | "flat" } | null => {
  if (previous === null || previous === undefined || !suffix) return null;
  const diff = current - previous;
  if (diff === 0) return { text: `без изменений ${suffix}`, tone: "flat" };
  const sign = diff > 0 ? "+" : "−";
  const body =
    previous > 0
      ? `${sign}${Math.abs(Math.round((diff / previous) * 100))}%`
      : `${sign}${render(Math.abs(diff))}`;
  return { text: `${body} ${suffix}`, tone: diff > 0 ? "up" : "down" };
};

const Metric = ({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { text: string; tone: "up" | "down" | "flat" } | null;
}) => (
  <div className={styles.metric}>
    <span className={styles.metricLabel}>{label}</span>
    <span className={styles.metricValue}>{value}</span>
    {delta ? (
      <span
        className={`${styles.metricHint}${
          delta.tone === "up" ? ` ${styles.deltaUp}` : delta.tone === "down" ? ` ${styles.deltaDown}` : ""
        }`}
      >
        {delta.text}
      </span>
    ) : hint ? (
      <span className={styles.metricHint}>{hint}</span>
    ) : null}
  </div>
);

const MetricGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className={styles.metricGroup}>
    <h3 className={styles.metricGroupTitle}>{title}</h3>
    <div className={styles.metricRow}>{children}</div>
  </section>
);

export function FinanceAnalyticsTab({
  dash,
  period,
  onPeriodChange,
  isLoading,
  isError,
  onSelectUser,
}: {
  dash: PlatformFinanceDashboard | undefined;
  period: ReportingPeriod;
  onPeriodChange: (next: ReportingPeriod) => void;
  isLoading: boolean;
  isError: boolean;
  onSelectUser: (userId: string) => void;
}) {
  const periodSwitch = (
    <SectionCard title="Период" lead="Фильтрация аналитики по выбранному периоду.">
      <PillRow>
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            kind={period === option.value ? "primary" : "ghost"}
            onClick={() => onPeriodChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </PillRow>
    </SectionCard>
  );

  if (!dash) {
    return (
      <Stack>
        {periodSwitch}
        {isError ? (
          <Message tone="error">Не удалось загрузить аналитику.</Message>
        ) : (
          <Message>{isLoading ? "Загружаем аналитику…" : "Нет данных."}</Message>
        )}
      </Stack>
    );
  }

  const prev = dash.previous_period;
  const periodNoun = PERIOD_NOUN[period];
  const prevNoun = PREVIOUS_NOUN[period];

  // Дневные ряды: денежные графики ждут {date, count, amount_kopeks}.
  // Оборот и доход платформы — по дате распределения долей, чтобы их можно
  // было делить друг на друга; когорта по дате создания живёт в блоке воронки.
  const turnoverPoints = dash.time_series.map((point) => ({
    date: point.date,
    count: point.payments_count,
    amount_kopeks: point.turnover_paid_kopeks,
  }));
  const sharePoints = dash.time_series.map((point) => ({
    date: point.date,
    count: point.payments_count,
    amount_kopeks: point.accrued_platform_share_kopeks,
  }));
  // Оплаченные лежат в основании столбика, остальные — сверху: видно и объём, и долю.
  const dealPoints = dash.time_series.map((point) => ({
    date: point.date,
    primary: point.paid_deals_count,
    secondary: Math.max(point.deals_created - point.paid_deals_count, 0),
  }));

  const statusSlices = STATUS_ORDER.map((statusKey) => {
    const count = dash.deal_counts_by_status[statusKey] ?? 0;
    return count > 0
      ? {
          label: formatDealStatus(statusKey),
          value: count,
          hint: formatShortMoney(dash.turnover_by_status_kopeks[statusKey] ?? 0),
        }
      : null;
  }).filter((slice): slice is { label: string; value: number; hint: string } => slice !== null);

  const funnelStages = dash.funnel.map((stage) => ({
    label: FUNNEL_LABELS[stage.key] ?? stage.key,
    count: stage.count,
  }));

  const histogramItems = dash.amounts_histogram.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
  }));

  const roleEarningItems = Object.entries(dash.earnings_by_role_period_kopeks)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([role, amount]) => ({
      label: roleLabel(role),
      value: amount,
      valueLabel: formatMoney(amount),
    }));

  const expectedShareItems = Object.entries(dash.expected_future_shares_kopeks)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([role, amount]) => ({
      label: roleLabel(role),
      value: amount,
      valueLabel: formatMoney(amount),
    }));

  const participantName = (item: { name: string; nickname: string | null; user_id: string }): string =>
    item.name || item.nickname || `${item.user_id.slice(0, 8)}…`;

  const topBloggerItems = dash.top_bloggers.map((item) => ({
    label: participantName(item),
    value: item.earnings_kopeks,
    valueLabel: formatMoney(item.earnings_kopeks),
    hint: `· ${item.paid_deals_count} ${pluralRu(item.paid_deals_count, ["сделка", "сделки", "сделок"])}`,
    onSelect: () => onSelectUser(item.user_id),
  }));

  const topWorkerItems = dash.top_workers.map((item) => ({
    label: participantName(item),
    value: item.earnings_kopeks,
    valueLabel: formatMoney(item.earnings_kopeks),
    hint: `· ${item.paid_deals_count} ${pluralRu(item.paid_deals_count, ["сделка", "сделки", "сделок"])}`,
    onSelect: () => onSelectUser(item.user_id),
  }));

  const referralItems = dash.referral_share_by_blogger.map((row) => ({
    label: row.name || row.nickname || `${row.upline_blogger_id.slice(0, 8)}…`,
    value: row.amount_kopeks,
    valueLabel: formatMoney(row.amount_kopeks),
    onSelect: () => onSelectUser(row.upline_blogger_id),
  }));

  const statusTurnoverItems = STATUS_ORDER.map((statusKey) => {
    const amount = dash.turnover_by_status_kopeks[statusKey] ?? 0;
    const count = dash.deal_counts_by_status[statusKey] ?? 0;
    return amount > 0 || count > 0
      ? {
          label: formatDealStatus(statusKey),
          value: amount,
          valueLabel: `${formatMoney(amount)} · ${formatNumber(count)}`,
        }
      : null;
  }).filter((item): item is { label: string; value: number; valueLabel: string } => item !== null);

  return (
    <Stack>
      {periodSwitch}

      <div className={styles.financeHero}>
        <div className={styles.financeHeroMain}>
          <p className={styles.financeHeroLabel}>Чистая прибыль</p>
          <p className={styles.financeHeroValue}>{formatMoney(dash.net_profit_kopeks)}</p>
          <p className={styles.financeHeroHint}>
            За всё время: накоплено {formatMoney(dash.accrued_platform_share_kopeks)} · выведено{" "}
            {formatMoney(dash.platform_withdrawn_kopeks)}
          </p>
        </div>
        <div className={styles.financeHeroAside}>
          <div className={styles.financeHeroStat}>
            <span className={styles.financeMiniLabel}>Баланс платформы</span>
            <span className={styles.financeMiniValue}>{formatMoney(dash.platform_balance_kopeks)}</span>
          </div>
          <div className={styles.financeHeroStat}>
            <span className={styles.financeMiniLabel}>Свободные средства</span>
            <span className={styles.financeMiniValue}>{formatMoney(dash.net_free_funds_kopeks)}</span>
          </div>
        </div>
      </div>

      <SectionCard
        title={`Показатели периода — ${periodNoun}`}
        lead={`Деньги — по дате распределения долей: ${formatMoney(
          dash.turnover_paid_period_kopeks,
        )} за ${formatNumber(dash.payments_period_count)} ${pluralRu(dash.payments_period_count, [
          "сделку",
          "сделки",
          "сделок",
        ])}. Сделки — по дате создания. ${
          prev
            ? "Дельты считаются к предыдущему отрезку такой же длины."
            : "Период «всё время» сравнивать не с чем — дельты не показываем."
        }`}
      >
        <div className={styles.metricRowAuto}>
          <Metric
            label="Оборот"
            value={formatMoney(dash.turnover_paid_period_kopeks)}
            delta={deltaHint(
              dash.turnover_paid_period_kopeks,
              prev?.turnover_paid_kopeks,
              prevNoun,
              formatShortMoney,
            )}
          />
          <Metric
            label="Доход платформы"
            value={formatMoney(dash.period_platform_share_kopeks)}
            delta={deltaHint(
              dash.period_platform_share_kopeks,
              prev?.platform_share_kopeks,
              prevNoun,
              formatShortMoney,
            )}
          />
          <Metric
            label="Создано сделок"
            value={formatNumber(dash.deals_created_period)}
            delta={deltaHint(dash.deals_created_period, prev?.deals_created, prevNoun, formatNumber)}
          />
          <Metric
            label="Оплачено сделок"
            value={formatNumber(dash.paid_deals_period)}
            delta={deltaHint(dash.paid_deals_period, prev?.paid_deals_count, prevNoun, formatNumber)}
          />
          <Metric
            label="Средний чек"
            value={dash.paid_deals_period > 0 ? formatMoney(dash.average_order_value_kopeks) : "—"}
            hint={
              dash.paid_deals_period > 0
                ? `медиана ${formatShortMoney(dash.median_order_value_kopeks)}`
                : "нет оплат"
            }
          />
          <Metric
            label="Комиссия платформы"
            value={formatPct(dash.take_rate_pct)}
            hint={`в среднем ${formatMoney(dash.average_platform_commission_kopeks)} со сделки`}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Оборот по дням"
        lead={`Суммы сделок в день распределения долей — ${formatShortMoney(
          dash.turnover_paid_period_kopeks,
        )} ${periodNoun}. Наведите на график, чтобы увидеть день.`}
      >
        <MoneyAreaChart points={turnoverPoints} ariaLabel="Оборот по дням" countNoun="сделок" />
      </SectionCard>

      <div className={chartStyles.chartsGrid}>
        <SectionCard title="Доход платформы по дням" lead="Начисления доли платформы в момент распределения.">
          <MoneyBarsChart
            points={sharePoints}
            ariaLabel="Доход платформы по дням"
            countNoun="начислений"
          />
        </SectionCard>
        <SectionCard title="Сделки по дням" lead="Все созданные сделки; закрашенная часть дошла до оплаты.">
          <StackedDailyBarsChart
            points={dealPoints}
            ariaLabel="Сделки по дням"
            primaryLabel="Оплачено"
            secondaryLabel="Прочие"
          />
        </SectionCard>
      </div>

      <div className={chartStyles.chartsGrid}>
        <SectionCard
          title="Воронка сделок"
          lead={`Сделки, созданные ${periodNoun}, на ${formatShortMoney(
            dash.turnover_total_kopeks,
          )} оплаченного оборота. Шаги — по текущему статусу, поэтому отклонённые и возвраты видны только в «создано».`}
        >
          <FunnelChart stages={funnelStages} emptyText="За период не создано ни одной сделки." />
        </SectionCard>
        <SectionCard title="Статусы сделок" lead="Те же сделки когорты по текущему статусу, справа — их сумма.">
          <DonutChart slices={statusSlices} centerLabel="сделок" ariaLabel="Распределение сделок по статусам" />
        </SectionCard>
      </div>

      <div className={chartStyles.chartsGrid}>
        <SectionCard title="Чеки оплаченных сделок" lead="Распределение сумм по диапазонам, в рублях.">
          <ColumnHistogram items={histogramItems} ariaLabel="Гистограмма чеков" />
        </SectionCard>
        <SectionCard title="Оборот по статусам" lead="Сколько денег стоит за каждым статусом и сколько это сделок.">
          <HBarList items={statusTurnoverItems} emptyText="За период нет сделок." />
        </SectionCard>
      </div>

      <div className={styles.metricGroups}>
        <MetricGroup title="Конверсия и качество">
          <Metric
            label="Доходят до оплаты"
            value={formatPct(dash.conversion_to_paid_pct)}
            hint={`${formatNumber(dash.paid_deals_period)} из ${formatNumber(dash.deals_created_period)}`}
          />
          <Metric label="Отклонено" value={formatPct(dash.rejection_rate_pct)} hint="от созданных за период" />
          <Metric label="Возвраты" value={formatPct(dash.refund_rate_pct)} hint="от созданных за период" />
          <Metric label="Максимальный чек" value={formatMoney(dash.max_order_value_kopeks)} hint="за период" />
        </MetricGroup>

        <MetricGroup title="Скорость">
          <Metric
            label="До контакта с клиентом"
            value={formatHours(dash.avg_hours_to_first_contact)}
            hint="в среднем от создания сделки"
          />
          <Metric
            label="До распределения долей"
            value={formatHours(dash.avg_hours_to_payment)}
            hint="в среднем от создания до PAID"
          />
        </MetricGroup>
      </div>

      <div className={chartStyles.chartsGrid}>
        <SectionCard title="Начислено по ролям" lead={`Посделочные начисления ${periodNoun}, по дате начисления.`}>
          <HBarList items={roleEarningItems} emptyText="За период начислений не было." />
        </SectionCard>
        <SectionCard
          title="Ожидаемые начисления"
          lead={`Сделки в статусе «Подтверждена» на ${formatMoney(
            dash.expected_accruals_total_kopeks,
          )} — как разойдётся при распределении.`}
        >
          <HBarList items={expectedShareItems} emptyText="Подтверждённых сделок в ожидании нет." />
        </SectionCard>
      </div>

      <SectionCard
        title="Когда создаются сделки"
        lead="Теплокарта по дням недели и часам, время московское. Помогает понять, когда воркеры реально работают."
      >
        <ActivityHeatmap grid={dash.deals_heatmap} ariaLabel="Теплокарта создания сделок" />
      </SectionCard>

      <div className={styles.metricGroups}>
        <MetricGroup title="Люди платформы">
          <Metric
            label="Воркеры"
            value={formatNumber(dash.participants.workers_total)}
            hint={`активных ${formatNumber(dash.participants.active_workers)} ${periodNoun}`}
          />
          <Metric
            label="Блогеры"
            value={formatNumber(dash.participants.bloggers_total)}
            hint={`активных ${formatNumber(dash.participants.active_bloggers)} ${periodNoun}`}
          />
          <Metric label="Заказчики" value={formatNumber(dash.participants.clients_total)} hint="аккаунтов на маркетплейсе" />
          <Metric label="В бане" value={formatNumber(dash.participants.banned_total)} hint="заблокированы админом" />
        </MetricGroup>

        <MetricGroup title="Выплаты">
          <Metric
            label="В очереди"
            value={formatNumber(dash.payouts.pending_count)}
            hint={`на ${formatMoney(dash.payouts.pending_kopeks)}`}
          />
          <Metric
            label="Выплачено"
            value={formatMoney(dash.payouts.completed_kopeks)}
            hint={`${formatNumber(dash.payouts.completed_count)} ${pluralRu(dash.payouts.completed_count, [
              "выплата",
              "выплаты",
              "выплат",
            ])} за всё время`}
          />
          <Metric label="Отклонено" value={formatNumber(dash.payouts.rejected_count)} hint="запросов на вывод" />
          <Metric
            label="Обязательства"
            value={formatMoney(dash.platform_liabilities_kopeks)}
            hint={`в ожидании ${formatMoney(dash.platform_pending_funds_kopeks)}`}
          />
        </MetricGroup>
      </div>

      <div className={chartStyles.chartsGrid}>
        <SectionCard title="Топ блогеров" lead="До 10 блогеров по заработку за всё время. Клик — карточка пользователя.">
          <HBarList items={topBloggerItems} emptyText="Начислений блогерам пока нет." />
        </SectionCard>
        <SectionCard title="Топ воркеров" lead="До 10 воркеров по заработку за всё время. Клик — карточка пользователя.">
          <HBarList items={topWorkerItems} emptyText="Начислений воркерам пока нет." />
        </SectionCard>
      </div>

      <SectionCard
        title="Реферальная аналитика"
        lead="Начисленная реферальная доля аплайнам за всё время и активные связи."
      >
        <Stack>
          <PillRow>
            <Pill tone="accent">
              Всего аплайнам: {formatMoney(dash.total_referral_share_to_uplines_kopeks)}
            </Pill>
            <Pill>Блогеров с аплайном: {formatNumber(dash.active_referral_links.bloggers_with_upline)}</Pill>
            <Pill>Воркеров со связью: {formatNumber(dash.active_referral_links.workers_with_link)}</Pill>
          </PillRow>
          <HBarList items={referralItems} emptyText="Реферальных начислений пока нет." />
        </Stack>
      </SectionCard>
    </Stack>
  );
}
