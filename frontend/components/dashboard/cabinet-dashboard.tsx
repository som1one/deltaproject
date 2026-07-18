"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { tokenStorage } from "@/lib/storage";
import {
  formatDateTime,
  formatLedgerStatus,
  formatMoney,
  formatNumber,
  formatRole,
} from "@/lib/format";
import type {
  LedgerEntryRead,
  LedgerEntryStatus,
  UserMeRead,
} from "@/lib/types";
import {
  Button,
  DataTable,
  Field,
  Message,
  PageSurface,
  SectionCard,
  SelectInput,
  Stack,
  StatusPill,
  TableWrap,
  TextInput,
  TopNav,
  TwoColumn,
  NavLink,
  NavButton,
} from "@/components/common/ui";
import { CopyButton } from "@/components/common/copy-button";
import { PayoutCardInput } from "@/components/common/payout-card-input";
import { useToast } from "@/components/common/toast";
import { MarketplaceOverview } from "@/components/dashboard/marketplace-overview";
import { BloggerOverview } from "@/components/dashboard/blogger-overview";
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
          <span className={styles.identityMeta}>
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
   Sidebar tabs
   ========================================================= */

type TabDef = {
  id: string;
  label: string;
  iconPath: string;
  badge?: number | string | null;
};

const Sidebar = ({
  tabs,
  active,
  onSelect,
  helpText,
}: {
  tabs: TabDef[];
  active: string;
  onSelect: (id: string) => void;
  helpText?: string;
}) => (
  <aside className={styles.sidebar}>
    <p className={styles.sidebarLabel}>Разделы</p>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onSelect(tab.id)}
        className={`${styles.tabBtn}${active === tab.id ? ` ${styles.tabBtnActive}` : ""}`}
      >
        <span className={styles.tabIcon}>
          <Icon d={tab.iconPath} />
        </span>
        <span>{tab.label}</span>
        {tab.badge != null && tab.badge !== 0 && tab.badge !== "" ? (
          <span className={styles.tabBadge}>{tab.badge}</span>
        ) : null}
      </button>
    ))}
    {helpText ? <p className={styles.sidebarHelp}>{helpText}</p> : null}
  </aside>
);

/* =========================================================
   Profile — shared between Worker and Blogger
   ========================================================= */

const ProfileSection = ({
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
    <SectionCard
      title="Профиль и реквизиты"
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
    </SectionCard>
  );
};

/* =========================================================
   Worker cabinet
   ========================================================= */

type WorkerTab = "overview" | "scripts" | "finance" | "profile";

const WorkerCabinet = ({ me }: { me: UserMeRead }) => {
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();
  const [tab, setTab] = useState<WorkerTab>("overview");
  const [toast, setToast] = useState<Toast>(null);
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<LedgerEntryStatus | "ALL">("ALL");
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [payoutForm, setPayoutForm] = useState({ amount_rub: "" });
  const [payoutError, setPayoutError] = useState<string | null>(null);
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

  const payoutRequestMutation = useMutation({
    mutationFn: () =>
      api.requestPayout({
        amount_kopeks: Math.round(Number(payoutForm.amount_rub.replace(",", ".")) * 100),
        payout_token: null,
      }),
    onSuccess: () => {
      setToast({ tone: "success", text: "Запрос на выплату отправлен администратору." });
      setPayoutForm({ amount_rub: "" });
      setPayoutError(null);
      queryClient.invalidateQueries({ queryKey: ["me", "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setPayoutError(error.message),
  });

  const ledger = ledgerQuery.data?.items || [];
  const filteredLedger = useMemo(
    () => (ledgerStatusFilter === "ALL" ? ledger : ledger.filter((entry) => entry.status === ledgerStatusFilter)),
    [ledger, ledgerStatusFilter],
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

      {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}

      <div className={styles.shell}>
        <Sidebar
          tabs={tabs}
          active={tab}
          onSelect={(id) => setTab(id as WorkerTab)}
          helpText="Копируйте скрипты, отслеживайте выплаты, приглашайте заказчиков."
        />

        <div className={styles.workspace}>
          {tab === "overview" ? (
            <MarketplaceOverview
              me={me}
              referralUrl={referralQuery.data?.referral_url ?? null}
              referralLoading={referralQuery.isLoading}
              onNavigate={(target) => setTab(target as WorkerTab)}
            />
          ) : null}

          {tab === "scripts" ? (
            <SectionCard
              title="Скрипты сообщений"
              lead="Готовые шаблоны для переписки. Нажмите «Скопировать» — текст уйдёт в буфер."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                <TextInput
                  value={scriptSearch}
                  onChange={(e) => setScriptSearch(e.target.value)}
                  placeholder="Поиск по скриптам..."
                />
                {scriptCategoriesQuery.data && scriptCategoriesQuery.data.categories.length > 1 ? (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button
                      kind={scriptCategory === "" ? "primary" : "ghost"}
                      onClick={() => setScriptCategory("")}
                      type="button"
                    >
                      Все
                    </Button>
                    {scriptCategoriesQuery.data.categories.map((cat) => (
                      <Button
                        key={cat}
                        kind={scriptCategory === cat ? "primary" : "ghost"}
                        onClick={() => setScriptCategory(cat)}
                        type="button"
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              {scriptsQuery.isLoading ? (
                <SkeletonTable rows={3} />
              ) : !scriptsQuery.data || scriptsQuery.data.length === 0 ? (
                <EmptyState
                  icon={<Icon d={ICONS.scripts} />}
                  title="Скриптов пока нет"
                  text={scriptSearch || scriptCategory ? "Попробуйте изменить фильтры." : "Скрипты появятся здесь, когда администратор их добавит."}
                />
              ) : (
                <div className={styles.scriptGrid}>
                  {scriptsQuery.data.map((script) => (
                    <article className={styles.scriptCard} key={script.id}>
                      <h3>{script.title}</h3>
                      {script.keywords.length > 0 ? (
                        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                          {script.keywords.map((kw) => (
                            <span key={kw} style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>{kw}</span>
                          ))}
                        </div>
                      ) : null}
                      <p>{script.body}</p>
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
            </SectionCard>
          ) : null}

          {tab === "finance" ? (
            <Stack>
              <SectionCard
                title="Запрос на выплату"
                lead="Сумма уйдёт на привязанную карту после подтверждения администратором."
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
                  <Field
                    label="Сумма, ₽"
                    help={payoutError ?? undefined}
                  >
                    <TextInput
                      inputMode="decimal"
                      value={payoutForm.amount_rub}
                      onChange={(event) => {
                        setPayoutForm({ amount_rub: event.target.value });
                        setPayoutError(null);
                      }}
                      placeholder="5000"
                      aria-invalid={Boolean(payoutError)}
                    />
                  </Field>
                  <div className={styles.payoutActions}>
                    <Button
                      kind="secondary"
                      onClick={() =>
                        setPayoutForm({ amount_rub: me.balance > 0 ? String(me.balance / 100) : "" })
                      }
                      disabled={me.balance <= 0 || payoutRequestMutation.isPending}
                    >
                      Всё
                    </Button>
                    <Button
                      onClick={() => {
                        const amountKopeks = Math.round(
                          Number(payoutForm.amount_rub.replace(",", ".")) * 100,
                        );
                        if (!Number.isFinite(amountKopeks) || amountKopeks <= 0) {
                          setPayoutError("Введите положительную сумму.");
                          return;
                        }
                        if (amountKopeks > me.balance) {
                          setPayoutError("Сумма больше доступного баланса.");
                          return;
                        }
                        if (!me.payout_card_last4) {
                          setPayoutError("Сначала привяжите карту в разделе «Профиль».");
                          return;
                        }
                        payoutRequestMutation.mutate();
                      }}
                      disabled={
                        payoutRequestMutation.isPending ||
                        !payoutForm.amount_rub ||
                        me.balance <= 0
                      }
                    >
                      {payoutRequestMutation.isPending ? "Отправляем…" : "Запросить выплату"}
                    </Button>
                  </div>
                </div>
                {payoutWidgetQuery.data?.enabled ? (
                  <Message tone="default">
                    Доступна автоматическая выплата через виджет ЮKassa. Скоро появится прямо здесь.
                  </Message>
                ) : null}
              </SectionCard>

              <SectionCard
                title="Финансы"
                lead="История начислений, заморозок и выплат."
              >
                <div className={styles.toolbarRow}>
                  <div className={styles.toolbarFilters}>
                    <SelectInput
                      value={ledgerStatusFilter}
                      onChange={(event) => setLedgerStatusFilter(event.target.value as LedgerEntryStatus | "ALL")}
                    >
                      <option value="ALL">Все операции ({ledger.length})</option>
                      <option value="payout_request">Запросы выплат</option>
                      <option value="freeze">Заморозки</option>
                      <option value="pending_confirmation">Ожидают подтверждения</option>
                      <option value="completed">Завершённые</option>
                      <option value="rejected">Отклонённые</option>
                    </SelectInput>
                  </div>
                </div>
                {ledgerQuery.isLoading ? (
                  <SkeletonTable rows={4} />
                ) : filteredLedger.length === 0 ? (
                  <EmptyState
                    icon={<Icon d={ICONS.finance} />}
                    title="История пуста"
                    text="Здесь появятся ваши начисления и выплаты."
                  />
                ) : (
                  <LedgerTable items={filteredLedger} onSelect={(entry) => setActiveLedgerId(entry.id)} />
                )}
              </SectionCard>
            </Stack>
          ) : null}

          {tab === "profile" ? (
            <ProfileSection
              me={me}
              mutationPending={profileMutation.isPending || payoutCardMutation.isPending}
              onSave={(form) => profileMutation.mutate(form)}
              onSetPayoutCard={(cardNumber, holder, brand, bank) => payoutCardMutation.mutate({ cardNumber, holder, brand, bank })}
            />
          ) : null}
        </div>
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
   Ledger table — used by both worker and blogger
   ========================================================= */

const ledgerTone = (status: LedgerEntryStatus): "active" | "success" | "muted" | "danger" | "default" => {
  switch (status) {
    case "completed": return "success";
    case "rejected": return "danger";
    case "freeze":
    case "pending_confirmation":
    case "payout_request":
      return "active";
    default: return "default";
  }
};

const LedgerTable = ({
  items,
  onSelect,
}: {
  items: LedgerEntryRead[];
  onSelect?: (entry: LedgerEntryRead) => void;
}) => (
  <>
    <ul className={styles.ledgerMobileList}>
      {items.map((entry) => (
        <li
          key={`m-${entry.id}`}
          className={`${styles.ledgerMobileCard}${onSelect ? ` ${styles.ledgerMobileCardClickable}` : ""}`}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onClick={onSelect ? () => onSelect(entry) : undefined}
          onKeyDown={
            onSelect
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(entry);
                  }
                }
              : undefined
          }
        >
          <div className={styles.ledgerMobileTop}>
            <span
              className={styles.ledgerMobileAmount}
              data-negative={entry.amount_kopeks < 0 ? "true" : undefined}
            >
              {entry.amount_kopeks < 0 ? "−" : "+"}
              {formatMoney(Math.abs(entry.amount_kopeks))}
            </span>
            <StatusPill tone={ledgerTone(entry.status)}>{formatLedgerStatus(entry.status)}</StatusPill>
          </div>
          <div className={styles.ledgerMobileFoot}>
            <span className={styles.ledgerMobileDate}>{formatDateTime(entry.created_at)}</span>
            {entry.status === "rejected" ? (
              <span
                className={styles.ledgerMobileNote}
                style={entry.note ? undefined : { color: "var(--text-soft)" }}
              >
                {entry.note || "Причина не указана"}
              </span>
            ) : entry.note ? (
              <span className={styles.ledgerMobileNote}>{entry.note}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
    <div className={styles.dealsDesktopTable}>
      <TableWrap>
        <DataTable>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Заметка</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr
                key={entry.id}
                className={onSelect ? styles.dealRowClickable : undefined}
                tabIndex={onSelect ? 0 : undefined}
                role={onSelect ? "button" : undefined}
                aria-label={onSelect ? "Открыть операцию" : undefined}
                onClick={onSelect ? () => onSelect(entry) : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(entry);
                        }
                      }
                    : undefined
                }
              >
                <td>{formatDateTime(entry.created_at)}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: entry.amount_kopeks < 0 ? "var(--status-danger)" : "var(--text-strong)" }}>
                  {entry.amount_kopeks < 0 ? "−" : "+"}
                  {formatMoney(Math.abs(entry.amount_kopeks))}
                </td>
                <td>
                  <StatusPill tone={ledgerTone(entry.status)}>{formatLedgerStatus(entry.status)}</StatusPill>
                </td>
                {entry.status === "rejected" ? (
                  <td style={{ color: entry.note ? "var(--text)" : "var(--text-soft)" }}>
                    {entry.note || "Причина не указана"}
                  </td>
                ) : (
                  <td style={{ color: entry.note ? "var(--text)" : "var(--text-soft)" }}>{entry.note || "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  </>
);

/* =========================================================
   Ledger details modal — opens on row/card click in finance.
   ========================================================= */

const LEDGER_SUPPORT_HANDLE = "looneymoonhelper";

const ledgerStatusSummary = (status: LedgerEntryStatus): string => {
  switch (status) {
    case "completed":
      return "Операция завершена. Деньги уже учтены в балансе.";
    case "payout_request":
      return "Запрос на выплату принят, ждёт обработки администратором.";
    case "freeze":
      return "Сумма заморожена по сделке. Снимется при подтверждении или отклонении.";
    case "pending_confirmation":
      return "Выплата отправлена и ждёт подтверждения банка/провайдера.";
    case "rejected":
      return "Операция отклонена. Деньги остались на балансе.";
    default:
      return "Статус неизвестен.";
  }
};

const LedgerDetailsModal = ({
  entry,
  onClose,
}: {
  entry: LedgerEntryRead;
  onClose: () => void;
}) => {
  // Esc — закрыть, body scroll — заблокировать.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const isNegative = entry.amount_kopeks < 0;
  const supportHref = `https://t.me/${LEDGER_SUPPORT_HANDLE}?text=${encodeURIComponent(
    `Здравствуйте! Вопрос по операции ${entry.id} (${formatLedgerStatus(entry.status)}).`,
  )}`;

  return (
    <div className={styles.dealModalBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dealModalCard} onClick={(event) => event.stopPropagation()}>
        <header className={styles.dealModalHeader}>
          <div className={styles.dealModalHeaderTop}>
            <div className={styles.dealModalIdent}>
              <p className={styles.dealModalEyebrow}>Финансовая операция</p>
              <h2 className={styles.dealModalTitle}>
                <span
                  className={styles.ledgerMobileAmount}
                  data-negative={isNegative ? "true" : undefined}
                >
                  {isNegative ? "−" : "+"}
                  {formatMoney(Math.abs(entry.amount_kopeks))}
                </span>
              </h2>
            </div>
            <div className={styles.dealModalHeaderActions}>
              <a
                className={styles.dealIconButton}
                href={supportHref}
                target="_blank"
                rel="noreferrer"
                title={`Поддержка @${LEDGER_SUPPORT_HANDLE}`}
                aria-label="Связаться с поддержкой"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 21a9 9 0 1 0-9-9v3a3 3 0 0 0 3 3h1v-6H6a9 9 0 0 1 12 0h-1v6h1a3 3 0 0 0 3-3" />
                  <path d="M12 21h2a3 3 0 0 0 3-3" />
                </svg>
              </a>
              <button
                type="button"
                className={styles.dealIconButton}
                onClick={onClose}
                title="Закрыть (Esc)"
                aria-label="Закрыть"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.dealModalSummaryRow}>
            <StatusPill tone={ledgerTone(entry.status)}>{formatLedgerStatus(entry.status)}</StatusPill>
            <span className={styles.dealModalCreated}>{formatDateTime(entry.created_at)}</span>
            <CopyButton
              value={entry.id}
              kind="ghost"
              label={`ID: ${entry.id.slice(0, 8)}…`}
              toastText="ID операции скопирован"
            />
          </div>
        </header>

        <div className={styles.dealModalBody}>
          <div className={styles.dealModalSection}>
            <p className={styles.dealModalLead}>{ledgerStatusSummary(entry.status)}</p>

            <dl className={styles.dealMetaGrid}>
              <div>
                <dt>Тип</dt>
                <dd>{isNegative ? "Списание / выплата" : "Начисление"}</dd>
              </div>
              <div>
                <dt>Создано</dt>
                <dd>{formatDateTime(entry.created_at)}</dd>
              </div>
              <div>
                <dt>Обновлено</dt>
                <dd>{formatDateTime(entry.updated_at)}</dd>
              </div>
              <div>
                <dt>Связанная сделка</dt>
                <dd>{entry.deal_id ? `${entry.deal_id.slice(0, 8)}…` : "—"}</dd>
              </div>
              {entry.yookassa_payout_id ? (
                <div>
                  <dt>ЮKassa payout</dt>
                  <dd>{entry.yookassa_payout_id}</dd>
                </div>
              ) : null}
              {entry.idempotency_key ? (
                <div>
                  <dt>Idempotency</dt>
                  <dd title={entry.idempotency_key}>{entry.idempotency_key.slice(0, 24)}…</dd>
                </div>
              ) : null}
            </dl>

            {entry.status === "rejected" ? (
              <div className={styles.dealModalLedgerNote}>
                <p className={styles.dealModalEyebrow}>Причина отклонения</p>
                <p style={entry.note ? undefined : { color: "var(--text-soft)" }}>
                  {entry.note || "Причина не указана"}
                </p>
              </div>
            ) : entry.note ? (
              <div className={styles.dealModalLedgerNote}>
                <p className={styles.dealModalEyebrow}>Заметка</p>
                <p>{entry.note}</p>
              </div>
            ) : null}
          </div>
        </div>

        <footer className={styles.dealModalFooter}>
          {entry.deal_id ? (
            <CopyButton
              value={entry.deal_id}
              kind="secondary"
              label="ID сделки"
              toastText="ID сделки скопирован"
            />
          ) : null}
          <Button kind="secondary" onClick={onClose}>Закрыть</Button>
        </footer>
      </div>
    </div>
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
  const [payoutForm, setPayoutForm] = useState({ amount_rub: "" });
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<LedgerEntryStatus | "ALL">("ALL");
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);

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

  const payoutRequestMutation = useMutation({
    mutationFn: () =>
      api.requestPayout({
        amount_kopeks: Math.round(Number(payoutForm.amount_rub) * 100),
        payout_token: null,
      }),
    onSuccess: () => {
      setToast({ tone: "success", text: "Запрос на выплату отправлен администратору." });
      setPayoutForm({ amount_rub: "" });
      queryClient.invalidateQueries({ queryKey: ["me", "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const ledger = ledgerQuery.data?.items || [];
  const filteredLedger = useMemo(
    () => (ledgerStatusFilter === "ALL" ? ledger : ledger.filter((e) => e.status === ledgerStatusFilter)),
    [ledger, ledgerStatusFilter],
  );

  const tabs: TabDef[] = [
    { id: "overview", label: "Обзор", iconPath: ICONS.overview },
    { id: "finance", label: "Финансы", iconPath: ICONS.finance },
    { id: "profile", label: "Профиль", iconPath: ICONS.profile },
  ];

  return (
    <>
      <IdentityHeader me={me} />

      {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}

      <div className={styles.shell}>
        <Sidebar
          tabs={tabs}
          active={tab}
          onSelect={(id) => setTab(id as BloggerTab)}
          helpText="Следите за балансом, запрашивайте выплаты, берите заказы на маркетплейсе."
        />

        <div className={styles.workspace}>
          {tab === "overview" ? <BloggerOverview me={me} /> : null}

          {tab === "finance" ? (
            <Stack>
              <SectionCard
                title="Запрос выплаты"
                lead="Укажите сумму в рублях — администратор подтвердит выплату вручную."
              >
                <Stack>
                  <TwoColumn>
                    <Field label="Сумма выплаты, ₽" help={`Доступно: ${formatMoney(me.balance)}`}>
                      <TextInput
                        inputMode="decimal"
                        value={payoutForm.amount_rub}
                        onChange={(event) => setPayoutForm({ amount_rub: event.target.value })}
                        placeholder="5000"
                      />
                    </Field>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <Button
                        onClick={() => payoutRequestMutation.mutate()}
                        disabled={payoutRequestMutation.isPending || !payoutForm.amount_rub}
                      >
                        {payoutRequestMutation.isPending ? "Отправляем…" : "Запросить выплату"}
                      </Button>
                    </div>
                  </TwoColumn>
                  {!me.payout_card_last4 ? (
                    <Message tone="default">
                      Карта для выплат не привязана. Добавьте её в разделе «Профиль», иначе администратор не сможет провести перевод.
                    </Message>
                  ) : null}
                  {payoutWidgetQuery.data?.enabled ? (
                    <Message tone="default">
                      Доступна автоматическая выплата через виджет ЮKassa. Скоро появится прямо здесь.
                    </Message>
                  ) : null}
                </Stack>
              </SectionCard>

              <SectionCard title="История операций" lead="Начисления, заморозки, запросы и завершённые выплаты.">
                <div className={styles.toolbarRow}>
                  <div className={styles.toolbarFilters}>
                    <SelectInput
                      value={ledgerStatusFilter}
                      onChange={(event) => setLedgerStatusFilter(event.target.value as LedgerEntryStatus | "ALL")}
                    >
                      <option value="ALL">Все операции ({ledger.length})</option>
                      <option value="payout_request">Запросы выплат</option>
                      <option value="freeze">Заморозки</option>
                      <option value="pending_confirmation">Ожидают подтверждения</option>
                      <option value="completed">Завершённые</option>
                      <option value="rejected">Отклонённые</option>
                    </SelectInput>
                  </div>
                </div>
                {ledgerQuery.isLoading ? (
                  <SkeletonTable rows={4} />
                ) : filteredLedger.length === 0 ? (
                  <EmptyState
                    icon={<Icon d={ICONS.finance} />}
                    title="История пуста"
                    text="Здесь появятся ваши начисления и выплаты."
                  />
                ) : (
                  <LedgerTable items={filteredLedger} onSelect={(entry) => setActiveLedgerId(entry.id)} />
                )}
              </SectionCard>
            </Stack>
          ) : null}

          {tab === "profile" ? (
            <ProfileSection
              me={me}
              mutationPending={profileMutation.isPending || payoutCardMutation.isPending}
              onSave={(form) => profileMutation.mutate(form)}
              onSetPayoutCard={(cardNumber, holder, brand, bank) => payoutCardMutation.mutate({ cardNumber, holder, brand, bank })}
            />
          ) : null}
        </div>
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
