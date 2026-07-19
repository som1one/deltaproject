"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { tokenStorage } from "@/lib/storage";
import { formatMoney, formatNumber, formatRole } from "@/lib/format";
import type {
  LedgerEntryRead,
  LedgerEntryStatus,
  MarketplaceWithdrawalRead,
  UserMeRead,
} from "@/lib/types";
import {
  Button,
  Field,
  Message,
  PageSurface,
  SelectInput,
  TextInput,
  TopNav,
  TwoColumn,
  NavLink,
  NavButton,
} from "@/components/common/ui";
import { CopyButton } from "@/components/common/copy-button";
import { PayoutCardInput } from "@/components/common/payout-card-input";
import { MarketplaceOverview } from "@/components/dashboard/marketplace-overview";
import { BloggerOverview } from "@/components/dashboard/blogger-overview";
import { Section } from "@/components/dashboard/section";
import { LedgerTable, LedgerDetailsModal } from "@/components/dashboard/ledger";
import styles from "@/components/dashboard/cabinet.module.css";

/* =========================================================
   Local helpers + small primitives
   ========================================================= */

type ToastTone = "success" | "error" | "info";
type Toast = { tone: ToastTone; text: string } | null;

const buildProfileForm = (me: UserMeRead) => ({
  name: me.name,
  telegram: me.telegram || "",
  email: me.email,
  password: "",
  currentPassword: "",
});

const EmptyState = ({
  title,
  text,
  icon,
  action,
}: {
  title: string;
  text?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) => (
  <div className={styles.emptyState}>
    {icon ? <div className={styles.emptyIcon}>{icon}</div> : null}
    <p className={styles.emptyTitle}>{title}</p>
    {text ? <p className={styles.emptyText}>{text}</p> : null}
    {action ? <div className={styles.actionRow} style={{ marginTop: "0.4rem" }}>{action}</div> : null}
  </div>
);

const SkeletonTable = ({ rows = 4 }: { rows?: number }) => (
  <div className={styles.skeletonGrid} style={{ gridTemplateColumns: "1fr" }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className={styles.skeletonRow} />
    ))}
  </div>
);

/* ---------- Tab icons (inline SVG, monochrome) ---------- */

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  overview: "M4 13l5-5 4 4 7-7M14 5h6v6",
  deals: "M3 7h18M3 12h18M3 17h12",
  scripts: "M4 5h12l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 5v4h4",
  finance: "M3 12h4l3-7 4 14 3-7h4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  copy: "M9 9h10v12H9zM5 5h10v4M5 5v10",
  mail: "M3 7l9 6 9-6M3 7v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1",
  tg: "M21 4L3 11l5 2 2 6 3-3 5 4 3-16z",
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 11h18",
  lock: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z",
  logout: "M16 17l5-5-5-5M21 12H9M9 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5",
} as const;

/* =========================================================
   Identity header — top of every cabinet
   ========================================================= */

type IdentityStat = { label: string; value: string };

const IdentityHeader = ({
  me,
  subtitle,
  stats,
}: {
  me: UserMeRead;
  subtitle?: string;
  stats?: readonly IdentityStat[] | null;
}) => {
  const role = formatRole(me.role);
  const showSub = Boolean(subtitle && subtitle.toLowerCase() !== role.toLowerCase());
  return (
    <header className={styles.identityCard}>
      <div className={styles.identityMain}>
        <span className={styles.identityRole}>
          {role}
          {showSub ? <> · {subtitle}</> : null}
        </span>
        <h1 className={styles.identityName}>{me.name}</h1>
        <div className={styles.identityMetaRow}>
          {me.nickname ? (
            <span className={styles.identityMeta}>
              <Icon d={ICONS.profile} />
              <code>@{me.nickname}</code>
            </span>
          ) : null}
          {/* Контакт-мессенджер показываем только воркеру: с блогерами и
              заказчиками платформа общается во встроенном чате */}
          {me.telegram && me.role === "Worker" ? (
            <span className={styles.identityMeta}>
              <Icon d={ICONS.tg} />
              <code>{me.telegram}</code>
            </span>
          ) : null}
          <span className={`${styles.identityMeta} ${styles.identityMetaCard}`}>
            <Icon d={ICONS.card} />
            {me.payout_card_last4 ? (
              <code>•••• {me.payout_card_last4}</code>
            ) : (
              <span style={{ color: "var(--text-soft)" }}>карта не задана</span>
            )}
          </span>
        </div>
      </div>
      {stats && stats.length > 0 ? (
        <dl className={styles.identityStats}>
          {stats.map((item) => (
            <div key={item.label} className={styles.identityStat}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
};

/* =========================================================
   Tab bar — типографская строка вкладок с подчёркиванием
   ========================================================= */

type TabDef = {
  id: string;
  label: string;
  iconPath: string;
  badge?: number | string | null;
};

const TabBar = ({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
}) => (
  /* 4+ вкладок (воркер) на мобиле не помещаются с иконками —
     dense-режим прячет их и ужимает отступы, чтобы не резать «Профиль». */
  <nav
    className={`${styles.tabBar}${tabs.length > 3 ? ` ${styles.tabBarDense}` : ""}`}
    aria-label="Разделы кабинета"
  >
    <div className={styles.tabBarRow}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          aria-pressed={active === tab.id}
          className={`${styles.tabBtn}${active === tab.id ? ` ${styles.tabBtnActive}` : ""}`}
        >
          <span className={styles.tabIcon}>
            <Icon d={tab.iconPath} />
          </span>
          <span>{tab.label}</span>
          {tab.badge != null && tab.badge !== 0 && tab.badge !== "" ? (
            <span className={styles.tabCount}>{tab.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  </nav>
);

/* =========================================================
   Payout request — общая логика выплаты для обоих кабинетов
   ========================================================= */

const usePayoutRequest = (me: UserMeRead, onToast: (toast: Toast) => void) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountKopeks: number) =>
      api.requestPayout({ amount_kopeks: amountKopeks, payout_token: null }),
    onSuccess: () => {
      onToast({ tone: "success", text: "Запрос на выплату отправлен администратору." });
      setAmount("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["me", "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const changeAmount = (value: string) => {
    setAmount(value);
    setError(null);
  };

  const fillMax = () => {
    setAmount(me.balance > 0 ? String(me.balance / 100) : "");
    setError(null);
  };

  const submit = () => {
    const amountKopeks = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(amountKopeks) || amountKopeks <= 0) {
      setError("Введите положительную сумму.");
      return;
    }
    if (amountKopeks > me.balance) {
      setError("Сумма больше доступного баланса.");
      return;
    }
    if (!me.payout_card_last4) {
      setError("Сначала привяжите карту в разделе «Профиль».");
      return;
    }
    mutation.mutate(amountKopeks);
  };

  return { amount, changeAmount, error, fillMax, submit, pending: mutation.isPending };
};

type PayoutControls = ReturnType<typeof usePayoutRequest>;

/* =========================================================
   Marketplace withdraw — вывод заработка маркетплейса
   (marketplace_balance_kopeks) на привязанную карту.
   Запрос уходит администратору; в «Истории операций» вывод
   показывается общей строкой леджера.
   ========================================================= */

const withdrawalToLedgerEntry = (w: MarketplaceWithdrawalRead): LedgerEntryRead => ({
  id: w.id,
  user_id: w.user_id,
  deal_id: null,
  amount_kopeks: -w.amount_kopeks,
  status: w.status === "completed" ? "completed" : w.status === "failed" ? "rejected" : "payout_request",
  created_at: w.created_at,
  updated_at: w.updated_at,
  idempotency_key: null,
  note: w.status === "failed" ? w.error_message || null : "Вывод на привязанную карту",
  yookassa_payout_id: w.yookassa_payout_id,
});

const mergeLedgerWithWithdrawals = (
  ledger: LedgerEntryRead[],
  withdrawals: MarketplaceWithdrawalRead[],
): LedgerEntryRead[] =>
  [...ledger, ...withdrawals.map(withdrawalToLedgerEntry)].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

const useMarketplaceWithdraw = (me: UserMeRead, onToast: (toast: Toast) => void) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountKopeks: number) => api.createMarketplaceWithdrawal(amountKopeks),
    onSuccess: () => {
      onToast({ tone: "success", text: "Запрос на вывод отправлен — статус будет в истории операций." });
      setAmount("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "withdrawals"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const changeAmount = (value: string) => {
    setAmount(value);
    setError(null);
  };

  const fillMax = () => {
    setAmount(me.marketplace_balance_kopeks > 0 ? String(me.marketplace_balance_kopeks / 100) : "");
    setError(null);
  };

  const submit = () => {
    const amountKopeks = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(amountKopeks) || amountKopeks <= 0) {
      setError("Введите положительную сумму.");
      return;
    }
    if (amountKopeks < 100) {
      setError("Минимальная сумма вывода — 1 ₽.");
      return;
    }
    if (amountKopeks > me.marketplace_balance_kopeks) {
      setError("Сумма больше доступного баланса.");
      return;
    }
    if (!me.payout_card_last4) {
      setError("Сначала привяжите карту в разделе «Профиль».");
      return;
    }
    mutation.mutate(amountKopeks);
  };

  return { amount, changeAmount, error, fillMax, submit, pending: mutation.isPending };
};

type WithdrawControls = ReturnType<typeof useMarketplaceWithdraw>;

/* =========================================================
   Finance tab — выплата + история операций (общая для ролей)
   ========================================================= */

const FinanceTab = ({
  me,
  payout,
  widgetEnabled,
  withdraw,
  ledgerItems,
  ledgerLoading,
  filter,
  onFilterChange,
  onSelectEntry,
}: {
  me: UserMeRead;
  payout: PayoutControls;
  widgetEnabled: boolean;
  withdraw: WithdrawControls;
  ledgerItems: LedgerEntryRead[];
  ledgerLoading: boolean;
  /* Фильтр живёт у родителя, чтобы выбор переживал переключение вкладок. */
  filter: LedgerEntryStatus | "ALL";
  onFilterChange: (value: LedgerEntryStatus | "ALL") => void;
  onSelectEntry: (entry: LedgerEntryRead) => void;
}) => {
  const filtered = useMemo(
    () => (filter === "ALL" ? ledgerItems : ledgerItems.filter((entry) => entry.status === filter)),
    [ledgerItems, filter],
  );

  return (
    <div className={styles.stack}>
      <Section
        label="Вывод средств"
        lead="Заработок на маркетплейсе. Запрос обрабатывает администратор — после подтверждения деньги придут на привязанную карту."
      >
        <div className={styles.payoutRow}>
          <div className={styles.payoutField}>
            <p className={styles.payoutLabel}>Доступно к выводу</p>
            <p className={styles.payoutAvailable}>{formatMoney(me.marketplace_balance_kopeks)}</p>
            {!me.payout_card_last4 ? (
              <p className={styles.payoutHint}>
                Привяжите карту в разделе «Профиль» — выплата уходит только на неё.
              </p>
            ) : (
              <p className={styles.payoutHint}>Карта: •••• {me.payout_card_last4}</p>
            )}
          </div>
          <Field label="Сумма, ₽">
            <TextInput
              inputMode="decimal"
              value={withdraw.amount}
              onChange={(event) => withdraw.changeAmount(event.target.value)}
              placeholder="5000"
              aria-invalid={Boolean(withdraw.error)}
            />
          </Field>
          <div className={styles.payoutActions}>
            <Button
              kind="ghost"
              onClick={withdraw.fillMax}
              disabled={me.marketplace_balance_kopeks <= 0 || withdraw.pending}
            >
              Всё
            </Button>
            <Button
              onClick={withdraw.submit}
              disabled={withdraw.pending || !withdraw.amount || me.marketplace_balance_kopeks <= 0}
            >
              {withdraw.pending ? "Отправляем…" : "Вывести"}
            </Button>
          </div>
          {withdraw.error ? (
            <p className={styles.payoutError} role="alert">
              {withdraw.error}
            </p>
          ) : null}
        </div>
      </Section>

      {/* Остаток прежней программы начислений: показываем, только если он есть.
          Новые деньги сюда не попадают — это хвост легаси-баланса. */}
      {me.balance > 0 ? (
        <Section
          label="Выплата по прежним начислениям"
          lead="Остаток по старой программе. Сумма уйдёт на карту после подтверждения администратором."
        >
          <div className={styles.payoutRow}>
            <div className={styles.payoutField}>
              <p className={styles.payoutLabel}>Доступно к выводу</p>
              <p className={styles.payoutAvailable}>{formatMoney(me.balance)}</p>
              {!me.payout_card_last4 ? (
                <p className={styles.payoutHint}>
                  Привяжите карту в разделе «Профиль», иначе администратор не сможет провести перевод.
                </p>
              ) : (
                <p className={styles.payoutHint}>Карта: •••• {me.payout_card_last4}</p>
              )}
            </div>
            <Field label="Сумма, ₽">
              <TextInput
                inputMode="decimal"
                value={payout.amount}
                onChange={(event) => payout.changeAmount(event.target.value)}
                placeholder="5000"
                aria-invalid={Boolean(payout.error)}
              />
            </Field>
            <div className={styles.payoutActions}>
              <Button
                kind="ghost"
                onClick={payout.fillMax}
                disabled={me.balance <= 0 || payout.pending}
              >
                Всё
              </Button>
              <Button
                onClick={payout.submit}
                disabled={payout.pending || !payout.amount || me.balance <= 0}
              >
                {payout.pending ? "Отправляем…" : "Запросить выплату"}
              </Button>
            </div>
            {payout.error ? (
              <p className={styles.payoutError} role="alert">
                {payout.error}
              </p>
            ) : null}
          </div>
          {widgetEnabled ? (
            <Message tone="default">
              Доступна автоматическая выплата через виджет ЮKassa. Скоро появится прямо здесь.
            </Message>
          ) : null}
        </Section>
      ) : null}

      <Section
        label="История операций"
        aside={
          <span className={styles.ledgerFilter}>
            <SelectInput
              value={filter}
              onChange={(event) => onFilterChange(event.target.value as LedgerEntryStatus | "ALL")}
              aria-label="Фильтр операций"
            >
              <option value="ALL">Все операции ({ledgerItems.length})</option>
              <option value="payout_request">Запросы выплат</option>
              <option value="freeze">Заморозки</option>
              <option value="pending_confirmation">Ожидают подтверждения</option>
              <option value="completed">Завершённые</option>
              <option value="rejected">Отклонённые</option>
            </SelectInput>
          </span>
        }
      >
        {ledgerLoading ? (
          <SkeletonTable rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon d={ICONS.finance} />}
            title="История пуста"
            text="Здесь появятся ваши начисления и выплаты."
          />
        ) : (
          <LedgerTable items={filtered} onSelect={onSelectEntry} />
        )}
      </Section>
    </div>
  );
};

/* =========================================================
   Profile — shared between Worker and Blogger
   ========================================================= */

const ProfileTab = ({
  me,
  mutationPending,
  onSave,
  onSetPayoutCard,
}: {
  me: UserMeRead;
  mutationPending: boolean;
  onSave: (form: { name: string; telegram: string; email: string; password: string; currentPassword: string }) => void;
  onSetPayoutCard: (cardNumber: string, holder: string, brand: string, bank: string) => void;
}) => {
  const [profileForm, setProfileForm] = useState(buildProfileForm(me));

  // Telegram в профиле видят только воркеры; блогерам он не показывается —
  // их общение с заказчиками идёт во встроенном чате маркетплейса.
  const showTelegram = me.role === "Worker";

  useEffect(() => {
    setProfileForm(buildProfileForm(me));
  }, [me]);

  return (
    <Section
      label="Профиль и реквизиты"
      lead={
        showTelegram
          ? "Имя редактируете вы, никнейм и Telegram управляются администратором. Карта для выплат хранится в виде хеша — мы видим только последние 4 цифры."
          : "Имя редактируете вы, никнейм управляется администратором. Карта для выплат хранится в виде хеша — мы видим только последние 4 цифры."
      }
    >
      <div className={styles.profileGrid}>
        <div className={styles.profileBlock}>
          <p className={styles.profileBlockTitle}>Контакты</p>
          <TwoColumn>
            <Field label="Имя">
              <TextInput
                value={profileForm.name}
                onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                placeholder="Как вас называть"
              />
            </Field>
            {me.nickname ? (
              <Field label="Никнейм">
                <TextInput value={me.nickname} readOnly disabled />
              </Field>
            ) : showTelegram ? (
              <Field label="Telegram">
                <TextInput value={me.telegram || "—"} readOnly disabled />
              </Field>
            ) : null}
          </TwoColumn>
          {me.nickname && showTelegram ? (
            <Field label="Telegram">
              <TextInput value={me.telegram || "—"} readOnly disabled />
            </Field>
          ) : null}

          <TwoColumn>
            <Field label="Текущий пароль" help="Оставьте пустым, если не меняете пароль.">
              <TextInput
                type="password"
                value={profileForm.currentPassword}
                onChange={(event) => setProfileForm({ ...profileForm, currentPassword: event.target.value })}
                placeholder="Текущий пароль"
                autoComplete="current-password"
              />
            </Field>
            <Field label="Новый пароль" help="Минимум 8 символов.">
              <TextInput
                type="password"
                value={profileForm.password}
                onChange={(event) => setProfileForm({ ...profileForm, password: event.target.value })}
                placeholder="Новый пароль"
                autoComplete="new-password"
              />
            </Field>
          </TwoColumn>

          <div className={styles.actionRow}>
            <Button onClick={() => onSave(profileForm)} disabled={mutationPending}>
              {mutationPending ? "Сохраняем…" : "Сохранить профиль"}
            </Button>
          </div>
        </div>

        <div className={styles.profileBlock}>
          <p className={styles.profileBlockTitle}>Карта для выплат</p>
          <PayoutCardInput
            savedLast4={me.payout_card_last4 ?? null}
            savedBrand={me.payout_card_brand}
            savedHolder={me.payout_card_holder}
            savedBank={me.payout_card_bank}
            pending={mutationPending}
            onSubmit={(rawDigits, holder, brand, bank) => onSetPayoutCard(rawDigits, holder, brand, bank)}
          />
        </div>
      </div>
    </Section>
  );
};

/* =========================================================
   Scripts tab — worker only
   ========================================================= */

const ScriptsTab = ({
  search,
  onSearch,
  category,
  onCategory,
  categories,
  scripts,
  loading,
}: {
  search: string;
  onSearch: (value: string) => void;
  category: string;
  onCategory: (value: string) => void;
  categories: string[];
  scripts: Awaited<ReturnType<typeof api.getWorkerScripts>> | undefined;
  loading: boolean;
}) => (
  <Section
    label="Скрипты сообщений"
    lead="Готовые шаблоны для переписки. Нажмите «Скопировать» — текст уйдёт в буфер."
  >
    <div className={styles.scriptTools}>
      <TextInput
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Поиск по скриптам…"
      />
      {categories.length > 1 ? (
        <div className={styles.chipRow}>
          <button
            type="button"
            className={`${styles.chip}${category === "" ? ` ${styles.chipActive}` : ""}`}
            aria-pressed={category === ""}
            onClick={() => onCategory("")}
          >
            Все
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`${styles.chip}${category === cat ? ` ${styles.chipActive}` : ""}`}
              aria-pressed={category === cat}
              onClick={() => onCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}
    </div>
    {loading ? (
      <SkeletonTable rows={3} />
    ) : !scripts || scripts.length === 0 ? (
      <EmptyState
        icon={<Icon d={ICONS.scripts} />}
        title="Скриптов пока нет"
        text={search || category ? "Попробуйте изменить фильтры." : "Скрипты появятся здесь, когда администратор их добавит."}
      />
    ) : (
      <div className={styles.scriptGrid}>
        {scripts.map((script) => (
          <article className={styles.scriptCard} key={script.id}>
            <div className={styles.scriptHead}>
              <h3>{script.title}</h3>
            </div>
            {script.keywords.length > 0 ? (
              <p className={styles.scriptKeywords}>{script.keywords.join(" · ")}</p>
            ) : null}
            <p className={styles.scriptBody}>{script.body}</p>
            <div className={styles.scriptActions}>
              <CopyButton
                value={script.body}
                kind="secondary"
                label="Скопировать"
                toastText={`Скрипт «${script.title}» скопирован`}
              />
            </div>
          </article>
        ))}
      </div>
    )}
  </Section>
);

/* =========================================================
   Worker cabinet
   ========================================================= */

type WorkerTab = "overview" | "scripts" | "finance" | "profile";

const WorkerCabinet = ({ me }: { me: UserMeRead }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkerTab>("overview");
  const [toast, setToast] = useState<Toast>(null);
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerEntryStatus | "ALL">("ALL");
  const [scriptCategory, setScriptCategory] = useState<string>("");
  const [scriptSearch, setScriptSearch] = useState("");

  const statsQuery = useQuery({ queryKey: ["me", "stats"], queryFn: api.getMeStats });
  const scriptsQuery = useQuery({
    queryKey: ["me", "scripts", scriptCategory, scriptSearch],
    queryFn: () => api.getWorkerScripts({
      category: scriptCategory || undefined,
      search: scriptSearch || undefined,
    }),
  });
  const scriptCategoriesQuery = useQuery({
    queryKey: ["me", "script-categories"],
    queryFn: api.getWorkerScriptCategories,
  });
  const ledgerQuery = useQuery({ queryKey: ["me", "ledger"], queryFn: () => api.getLedger() });
  const payoutWidgetQuery = useQuery({ queryKey: ["me", "payout-widget"], queryFn: api.getPayoutWidgetConfig });

  // Marketplace referral link
  const referralQuery = useQuery({
    queryKey: ["marketplace", "worker", "referral-link"],
    queryFn: async () => {
      const res = await fetch(`${appConfig.apiBaseUrl}/marketplace/worker/referral-link`, {
        headers: { Authorization: `Bearer ${tokenStorage.readAccessToken()}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ referral_url: string }>;
    },
  });

  const profileMutation = useMutation({
    mutationFn: (form: { name: string; telegram: string; email: string; password: string; currentPassword: string }) => {
      const payload: Record<string, string> = {
        name: form.name,
        telegram: form.telegram,
      };
      if (form.password) {
        payload.password = form.password;
        payload.current_password = form.currentPassword;
      }
      return api.patchMe(payload);
    },
    onSuccess: () => {
      setToast({ tone: "success", text: "Профиль обновлён." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const payoutCardMutation = useMutation({
    mutationFn: ({ cardNumber, holder, brand, bank }: { cardNumber: string, holder: string, brand: string, bank: string }) => api.setPayoutCard(cardNumber, holder, brand, bank),
    onSuccess: () => {
      setToast({ tone: "success", text: "Карта для выплат обновлена." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const payout = usePayoutRequest(me, setToast);
  const withdraw = useMarketplaceWithdraw(me, setToast);
  const withdrawalsQuery = useQuery({
    queryKey: ["marketplace", "withdrawals"],
    queryFn: api.getMarketplaceWithdrawals,
  });

  /* Выводы маркетплейса — часть общей истории операций. */
  const withdrawalItems = withdrawalsQuery.data?.items;
  const ledger = useMemo(
    () => mergeLedgerWithWithdrawals(ledgerQuery.data?.items || [], withdrawalItems || []),
    [ledgerQuery.data, withdrawalItems],
  );

  const tabs: TabDef[] = [
    { id: "overview", label: "Обзор", iconPath: ICONS.overview },
    { id: "scripts", label: "Скрипты", iconPath: ICONS.scripts, badge: scriptsQuery.data?.length || null },
    { id: "finance", label: "Финансы", iconPath: ICONS.finance },
    { id: "profile", label: "Профиль", iconPath: ICONS.profile },
  ];

  const workerStats = statsQuery.data?.role === "Worker" ? statsQuery.data : null;
  const headerStats: IdentityStat[] | null = workerStats
    ? [
        { label: "Сделок", value: formatNumber(workerStats.deals) },
        { label: "Оплачено", value: formatNumber(workerStats.paid) },
        { label: "Заработано", value: formatMoney(workerStats.earn) },
      ]
    : null;

  return (
    <>
      <IdentityHeader me={me} stats={headerStats} />

      <div role="status" aria-live="polite">
        {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}
      </div>

      <TabBar tabs={tabs} active={tab} onSelect={(id) => setTab(id as WorkerTab)} />

      <div key={tab} className={styles.workspace}>
        {tab === "overview" ? (
          <MarketplaceOverview
            me={me}
            referralUrl={referralQuery.data?.referral_url ?? null}
            referralLoading={referralQuery.isLoading}
            onNavigate={(target) => setTab(target as WorkerTab)}
          />
        ) : null}

        {tab === "scripts" ? (
          <ScriptsTab
            search={scriptSearch}
            onSearch={setScriptSearch}
            category={scriptCategory}
            onCategory={setScriptCategory}
            categories={scriptCategoriesQuery.data?.categories ?? []}
            scripts={scriptsQuery.data}
            loading={scriptsQuery.isLoading}
          />
        ) : null}

        {tab === "finance" ? (
          <FinanceTab
            me={me}
            payout={payout}
            widgetEnabled={Boolean(payoutWidgetQuery.data?.enabled)}
            withdraw={withdraw}
            ledgerItems={ledger}
            ledgerLoading={ledgerQuery.isLoading || withdrawalsQuery.isLoading}
            filter={ledgerFilter}
            onFilterChange={setLedgerFilter}
            onSelectEntry={(entry) => setActiveLedgerId(entry.id)}
          />
        ) : null}

        {tab === "profile" ? (
          <ProfileTab
            me={me}
            mutationPending={profileMutation.isPending || payoutCardMutation.isPending}
            onSave={(form) => profileMutation.mutate(form)}
            onSetPayoutCard={(cardNumber, holder, brand, bank) => payoutCardMutation.mutate({ cardNumber, holder, brand, bank })}
          />
        ) : null}
      </div>

      {activeLedgerId
        ? (() => {
            const activeEntry = ledger.find((e) => e.id === activeLedgerId);
            if (!activeEntry) return null;
            return (
              <LedgerDetailsModal
                entry={activeEntry}
                onClose={() => setActiveLedgerId(null)}
              />
            );
          })()
        : null}
    </>
  );
};

/* =========================================================
   Blogger cabinet
   ========================================================= */

type BloggerTab = "overview" | "finance" | "profile";

const BloggerCabinet = ({ me }: { me: UserMeRead }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BloggerTab>("overview");
  const [toast, setToast] = useState<Toast>(null);
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerEntryStatus | "ALL">("ALL");

  const ledgerQuery = useQuery({ queryKey: ["me", "ledger"], queryFn: () => api.getLedger() });
  const payoutWidgetQuery = useQuery({ queryKey: ["me", "payout-widget"], queryFn: api.getPayoutWidgetConfig });

  const profileMutation = useMutation({
    mutationFn: (form: { name: string; telegram: string; email: string; password: string; currentPassword: string }) => {
      const payload: Record<string, string> = {
        name: form.name,
        telegram: form.telegram,
      };
      if (form.password) {
        payload.password = form.password;
        payload.current_password = form.currentPassword;
      }
      return api.patchMe(payload);
    },
    onSuccess: () => {
      setToast({ tone: "success", text: "Профиль обновлён." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const payoutCardMutation = useMutation({
    mutationFn: ({ cardNumber, holder, brand, bank }: { cardNumber: string, holder: string, brand: string, bank: string }) => api.setPayoutCard(cardNumber, holder, brand, bank),
    onSuccess: () => {
      setToast({ tone: "success", text: "Карта для выплат обновлена." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const payout = usePayoutRequest(me, setToast);
  const withdraw = useMarketplaceWithdraw(me, setToast);
  const withdrawalsQuery = useQuery({
    queryKey: ["marketplace", "withdrawals"],
    queryFn: api.getMarketplaceWithdrawals,
  });

  /* Выводы маркетплейса — часть общей истории операций. */
  const withdrawalItems = withdrawalsQuery.data?.items;
  const ledger = useMemo(
    () => mergeLedgerWithWithdrawals(ledgerQuery.data?.items || [], withdrawalItems || []),
    [ledgerQuery.data, withdrawalItems],
  );

  const tabs: TabDef[] = [
    { id: "overview", label: "Обзор", iconPath: ICONS.overview },
    { id: "finance", label: "Финансы", iconPath: ICONS.finance },
    { id: "profile", label: "Профиль", iconPath: ICONS.profile },
  ];

  return (
    <>
      <IdentityHeader me={me} />

      <div role="status" aria-live="polite">
        {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}
      </div>

      <TabBar tabs={tabs} active={tab} onSelect={(id) => setTab(id as BloggerTab)} />

      <div key={tab} className={styles.workspace}>
        {tab === "overview" ? (
          <BloggerOverview
            me={me}
            ledger={ledger}
            ledgerLoading={ledgerQuery.isLoading}
            onNavigate={(target) => setTab(target as BloggerTab)}
            onSelectEntry={(entry) => setActiveLedgerId(entry.id)}
          />
        ) : null}

        {tab === "finance" ? (
          <FinanceTab
            me={me}
            payout={payout}
            widgetEnabled={Boolean(payoutWidgetQuery.data?.enabled)}
            withdraw={withdraw}
            ledgerItems={ledger}
            ledgerLoading={ledgerQuery.isLoading || withdrawalsQuery.isLoading}
            filter={ledgerFilter}
            onFilterChange={setLedgerFilter}
            onSelectEntry={(entry) => setActiveLedgerId(entry.id)}
          />
        ) : null}

        {tab === "profile" ? (
          <ProfileTab
            me={me}
            mutationPending={profileMutation.isPending || payoutCardMutation.isPending}
            onSave={(form) => profileMutation.mutate(form)}
            onSetPayoutCard={(cardNumber, holder, brand, bank) => payoutCardMutation.mutate({ cardNumber, holder, brand, bank })}
          />
        ) : null}
      </div>

      {activeLedgerId
        ? (() => {
            const activeEntry = ledger.find((e) => e.id === activeLedgerId);
            if (!activeEntry) return null;
            return (
              <LedgerDetailsModal
                entry={activeEntry}
                onClose={() => setActiveLedgerId(null)}
              />
            );
          })()
        : null}
    </>
  );
};

/* =========================================================
   Blogger PIN unlock screen
   ========================================================= */

const BloggerUnlockCard = ({
  isPending,
  errorText,
  onUnlock,
}: {
  isPending: boolean;
  errorText: string;
  onUnlock: (pin: string) => void;
}) => {
  const [pin, setPin] = useState("");

  return (
    <div className={styles.unlockShell}>
      <div className={styles.unlockCard}>
        <div className={styles.unlockIcon}>
          <Icon d={ICONS.lock} />
        </div>
        <h2>Введите PIN кабинета</h2>
        <p>PIN задаёт администратор. Без него чувствительные данные кабинета блогера остаются скрытыми.</p>
        <Field label="PIN">
          <TextInput
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="••••"
            autoFocus
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Enter" && pin.trim()) onUnlock(pin);
            }}
          />
        </Field>
        <Button onClick={() => onUnlock(pin)} disabled={isPending || !pin.trim()}>
          {isPending ? "Проверяем…" : "Открыть кабинет"}
        </Button>
        {errorText ? <Message tone="error">{errorText}</Message> : null}
      </div>
    </div>
  );
};

/* =========================================================
   Top-level orchestrator
   ========================================================= */

export default function CabinetDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, logout } = useAuth();
  const [unlockError, setUnlockError] = useState("");

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: isHydrated && isAuthenticated,
  });

  useEffect(() => {
    if (isHydrated && !isAuthenticated) router.replace("/");
  }, [isHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (meQuery.data?.role === "Admin") router.replace("/admin");
  }, [meQuery.data?.role, router]);

  const unlockMutation = useMutation({
    mutationFn: (pin: string) => api.unlockCabinet(pin),
    onSuccess: async () => {
      setUnlockError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["me", "ledger"] }),
      ]);
    },
    onError: (error: Error) => setUnlockError(error.message),
  });

  let content: ReactNode;

  if (!isHydrated || meQuery.isLoading) {
    content = (
      <div className={styles.fullscreenState}>
        <div className={styles.fullscreenStateInner}>
          <Message>Загружаем кабинет…</Message>
        </div>
      </div>
    );
  } else if (meQuery.isError) {
    content = (
      <div className={styles.fullscreenState}>
        <div className={styles.fullscreenStateInner}>
          <Message tone="error">{(meQuery.error as Error).message}</Message>
        </div>
      </div>
    );
  } else if (!meQuery.data) {
    content = (
      <div className={styles.fullscreenState}>
        <div className={styles.fullscreenStateInner}>
          <Message>Подключаем сессию…</Message>
        </div>
      </div>
    );
  } else if (meQuery.data.role === "Bloger" && meQuery.data.blogger_cabinet_locked) {
    content = (
      <BloggerUnlockCard
        isPending={unlockMutation.isPending}
        errorText={unlockError}
        onUnlock={(pin) => unlockMutation.mutate(pin)}
      />
    );
  } else if (meQuery.data.role === "Worker") {
    content = <WorkerCabinet me={meQuery.data} />;
  } else if (meQuery.data.role === "Bloger") {
    content = <BloggerCabinet me={meQuery.data} />;
  } else {
    content = <Message tone="error">Неизвестная роль пользователя.</Message>;
  }

  return (
    <PageSurface>
      <TopNav brandSub={meQuery.data?.role === "Bloger" ? "кабинет блогера" : "кабинет воркера"}>
        <NavLink href="/">На главную</NavLink>
        {meQuery.data ? (
          <NavButton onClick={() => void logout()}>
            Выйти
          </NavButton>
        ) : null}
      </TopNav>
      {content}
    </PageSurface>
  );
}
