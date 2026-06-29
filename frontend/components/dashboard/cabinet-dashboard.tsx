"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { tokenStorage } from "@/lib/storage";
import {
  dealStatusTone,
  formatDateTime,
  formatDealStatus,
  formatLedgerStatus,
  formatMoney,
  formatNumber,
  formatRole,
  formatShortDate,
} from "@/lib/format";
import type {
  DealRead,
  DealStatus,
  LedgerEntryRead,
  LedgerEntryStatus,
  UserMeRead,
} from "@/lib/types";
import {
  Button,
  DataTable,
  Field,
  Message,
  Modal,
  PageSurface,
  SectionCard,
  SelectInput,
  Stack,
  StatusPill,
  TableWrap,
  TextArea,
  TextInput,
  TopNav,
  TwoColumn,
  NavLink,
  NavButton,
} from "@/components/common/ui";
import { CopyButton } from "@/components/common/copy-button";
import { PayoutCardInput } from "@/components/common/payout-card-input";
import { useToast } from "@/components/common/toast";
import { OverviewCharts } from "@/components/dashboard/overview-charts";
import { MarketplaceOverview } from "@/components/dashboard/marketplace-overview";
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

const StatusCell = ({ deal }: { deal: DealRead }) => (
  <StatusPill tone={dealStatusTone(deal.status)}>{formatDealStatus(deal.status)}</StatusPill>
);

const Masked = ({ children = "Скрыто" }: { children?: ReactNode }) => (
  <span className={styles.maskedCell}>{children}</span>
);

/** Превращает относительную ссылку (`/ref/<nick>`) в абсолютный URL.
 *  База берётся из текущего origin в браузере (чтобы ссылка всегда
 *  совпадала с хостом, откуда зашёл пользователь), с фолбэком на
 *  NEXT_PUBLIC_APP_URL для SSR. */
const absolutizeUrl = (raw: string | null | undefined): string => {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base =
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : appConfig.appUrl || ""
    ).replace(/\/+$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
};

/** Мобильная карточка сделки. На ≥720px спрятана через CSS. */
const DealMobileCard = ({
  deal,
  onOpen,
  trailing,
}: {
  deal: DealRead;
  onOpen: () => void;
  /** Доп. кнопка справа внизу (например, «Принять» у блогера). */
  trailing?: ReactNode;
}) => (
  <article
    className={styles.dealMobileCard}
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    }}
    aria-label={`Открыть сделку ${deal.item_name}`}
  >
    <div className={styles.dealMobileTop}>
      <span className={styles.dealMobileTitle}>{deal.item_name}</span>
      <StatusPill tone={dealStatusTone(deal.status)}>{formatDealStatus(deal.status)}</StatusPill>
    </div>
    <div className={styles.dealMobileFoot}>
      <span className={styles.dealMobilePrice}>
        {deal.sensitive_masked ? "—" : formatMoney(deal.effective_price_kopeks || deal.price)}
      </span>
      <span className={styles.dealMobileDate}>{formatShortDate(deal.created_at)}</span>
      {trailing ? <div className={styles.dealMobileAction}>{trailing}</div> : null}
    </div>
  </article>
);

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

/* =========================================================
   Deal details modal — full custom UX, not reusing the generic
   Modal helper. Tabs: «Сводка» / «Финансы» / «Контакты» /
   «Редактировать». Fixed header (status, money, ID, support,
   close), independent body scroll, sticky action footer.
   ========================================================= */

const DEAL_SUPPORT_HANDLE = "looneymoonhelper";

const dealStatusSummary = (status: DealStatus): string => {
  switch (status) {
    case "NEW":
      return "Заявка отправлена блогеру. Ждём, когда он примет её в работу.";
    case "REVIEW":
      return "Сделка на проверке у администратора. Контакты и финансы пока скрыты.";
    case "CONFIRMED":
      return "Сделка подтверждена. Согласована цена, можно работать с продавцом.";
    case "ESCROW_HELD":
      return "Площадка подтвердила получение средств. Доли будут распределены администратором.";
    case "PAID":
      return "Оплата проведена. Сумма зачислена в баланс по схеме.";
    case "COMPLETED":
      return "Сделка закрыта. Все начисления уже отражены в финансах.";
    case "REJECTED":
      return "Сделка отклонена администратором или блогером. Начислений нет.";
    case "REFUNDED":
      return "Средства возвращены плательщику до распределения. Начислений нет.";
    default:
      return "Статус неизвестен.";
  }
};

type DealEditFormState = {
  item_name: string;
  shop_link: string;
  seller_tg: string;
  seller_number: string;
  price_rub: string;
};

const dealToEditForm = (deal: DealRead): DealEditFormState => ({
  item_name: deal.item_name,
  shop_link: deal.shop_link,
  seller_tg: deal.seller_tg,
  seller_number: deal.seller_number,
  price_rub: deal.price > 0 ? String(deal.price / 100) : "",
});

type DealEditErrors = Partial<Record<keyof DealEditFormState, string>>;

const validateDealEdit = (form: DealEditFormState): DealEditErrors => {
  const errors: DealEditErrors = {};

  const itemName = form.item_name.trim();
  if (!itemName) errors.item_name = "Укажите название товара.";
  else if (itemName.length > 512) errors.item_name = "Название слишком длинное (макс. 512).";

  const link = form.shop_link.trim();
  if (!link) {
    errors.shop_link = "Добавьте ссылку на магазин.";
  } else if (link.length > 2048) {
    errors.shop_link = "Ссылка слишком длинная (макс. 2048).";
  } else {
    try {
      const url = new URL(link);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.shop_link = "Ссылка должна начинаться с http:// или https://";
      }
    } catch {
      errors.shop_link = "Это не похоже на корректную ссылку.";
    }
  }

  const tg = form.seller_tg.trim();
  if (!tg) {
    errors.seller_tg = "Укажите Telegram продавца.";
  } else if (tg.length > 255) {
    errors.seller_tg = "Слишком длинный ник (макс. 255).";
  } else if (!/^@?[A-Za-z0-9_]{3,}$/.test(tg)) {
    errors.seller_tg = "Только латиница, цифры и _ (от 3 символов).";
  }

  const phone = form.seller_number.trim();
  if (!phone) {
    errors.seller_number = "Укажите телефон продавца.";
  } else if (phone.length > 64) {
    errors.seller_number = "Слишком длинный номер (макс. 64).";
  } else {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) errors.seller_number = "В номере должно быть минимум 7 цифр.";
    else if (!/^[+\d][\d\s()\-]*$/.test(phone))
      errors.seller_number = "Допустимы цифры, +, пробелы, скобки и дефисы.";
  }

  const priceRaw = form.price_rub.trim().replace(",", ".");
  if (!priceRaw) {
    errors.price_rub = "Укажите цену в рублях.";
  } else {
    const priceNum = Number(priceRaw);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      errors.price_rub = "Цена должна быть положительным числом.";
  }

  return errors;
};

const dealEditChanged = (form: DealEditFormState, deal: DealRead): boolean => {
  const init = dealToEditForm(deal);
  return (
    form.item_name.trim() !== init.item_name ||
    form.shop_link.trim() !== init.shop_link ||
    form.seller_tg.trim() !== init.seller_tg ||
    form.seller_number.trim() !== init.seller_number ||
    form.price_rub.trim().replace(",", ".") !== init.price_rub
  );
};

const buildDealPatchPayload = (
  form: DealEditFormState,
  deal: DealRead,
): Record<string, string | number> => {
  const payload: Record<string, string | number> = {};
  const item = form.item_name.trim();
  if (item !== deal.item_name) payload.item_name = item;
  const link = form.shop_link.trim();
  if (link !== deal.shop_link) payload.shop_link = link;
  const tg = form.seller_tg.trim();
  if (tg !== deal.seller_tg) payload.seller_tg = tg;
  const phone = form.seller_number.trim();
  if (phone !== deal.seller_number) payload.seller_number = phone;
  const priceKopeks = Math.round(Number(form.price_rub.trim().replace(",", ".")) * 100);
  if (priceKopeks > 0 && priceKopeks !== deal.price) payload.price = priceKopeks;
  return payload;
};

type DealTabId = "summary" | "finance" | "contacts" | "edit";

const DealDetailsModal = ({
  deal,
  onClose,
  editable,
  onSaved,
  acceptAction,
  showFinancePreview = true,
}: {
  deal: DealRead;
  onClose: () => void;
  editable?: boolean;
  onSaved?: () => void;
  acceptAction?: { label: string; onAction: () => void; pending?: boolean } | null;
  showFinancePreview?: boolean;
}) => {
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();

  const [activeTab, setActiveTab] = useState<DealTabId>("summary");
  const [form, setForm] = useState<DealEditFormState>(() => dealToEditForm(deal));
  const [touched, setTouched] = useState<Partial<Record<keyof DealEditFormState, boolean>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Сброс формы и активной вкладки при смене сделки.
  useEffect(() => {
    setForm(dealToEditForm(deal));
    setTouched({});
    setServerError(null);
    setActiveTab("summary");
  }, [deal.id, deal.item_name, deal.shop_link, deal.seller_tg, deal.seller_number, deal.price]);

  // Esc — закрыть модалку. Блокируем скролл страницы за модалкой.
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

  const finalPrice = deal.effective_price_kopeks || deal.price;
  const hasFinance =
    showFinancePreview &&
    !deal.sensitive_masked &&
    (deal.preview_worker_kopeks !== null ||
      deal.preview_blogger_kopeks !== null ||
      deal.preview_platform_kopeks !== null);

  const supportHref = `https://t.me/${DEAL_SUPPORT_HANDLE}?text=${encodeURIComponent(
    `Здравствуйте! Нужна помощь по сделке ${deal.id} (${deal.item_name}).`,
  )}`;

  const sellerTgHref = (() => {
    if (!deal.seller_tg || deal.sensitive_masked) return null;
    const handle = deal.seller_tg.replace(/^@/, "");
    return `https://t.me/${handle}`;
  })();

  const sellerPhoneHref = (() => {
    if (!deal.seller_number || deal.sensitive_masked) return null;
    const digits = deal.seller_number.replace(/[^\d+]/g, "");
    return digits ? `tel:${digits}` : null;
  })();

  const updateField = <K extends keyof DealEditFormState>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setServerError(null);
  };

  const markTouched = (key: keyof DealEditFormState) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const liveErrors = useMemo(() => (editable ? validateDealEdit(form) : {}), [editable, form]);
  const dirty = editable && dealEditChanged(form, deal);
  const fieldError = (key: keyof DealEditFormState): string | undefined =>
    editable && touched[key] ? liveErrors[key] : undefined;

  const saveMutation = useMutation({
    mutationFn: () => api.patchDealFields(deal.id, buildDealPatchPayload(form, deal)),
    onSuccess: () => {
      pushToast("Рзменения сохранены.", "success");
      queryClient.invalidateQueries({ queryKey: ["me", "deals"] });
      queryClient.invalidateQueries({ queryKey: ["me", "stats"] });
      onSaved?.();
      onClose();
    },
    onError: (error: Error) => {
      setServerError(error.message);
    },
  });

  const handleSave = () => {
    setTouched({
      item_name: true,
      shop_link: true,
      seller_tg: true,
      seller_number: true,
      price_rub: true,
    });
    const validation = validateDealEdit(form);
    if (Object.keys(validation).length > 0) return;
    if (!dirty) return;
    saveMutation.mutate();
  };

  const handleReset = () => {
    setForm(dealToEditForm(deal));
    setTouched({});
    setServerError(null);
  };

  const tabs: { id: DealTabId; label: string }[] = [
    { id: "summary", label: "Сводка" },
    { id: "finance", label: "Финансы" },
    { id: "contacts", label: "Контакты" },
  ];
  if (editable) tabs.push({ id: "edit", label: "Редактировать" });

  const headerStatusTone = dealStatusTone(deal.status);

  return (
    <div className={styles.dealModalBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dealModalCard} onClick={(event) => event.stopPropagation()}>
        {/* ---------- Header ---------- */}
        <header className={styles.dealModalHeader}>
          <div className={styles.dealModalHeaderTop}>
            <div className={styles.dealModalIdent}>
              <p className={styles.dealModalEyebrow}>Сделка</p>
              <h2 className={styles.dealModalTitle}>{deal.item_name}</h2>
            </div>
            <div className={styles.dealModalHeaderActions}>
              <a
                className={styles.dealIconButton}
                href={supportHref}
                target="_blank"
                rel="noreferrer"
                title={`Поддержка @${DEAL_SUPPORT_HANDLE}`}
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
            <StatusPill tone={headerStatusTone}>{formatDealStatus(deal.status)}</StatusPill>
            <span className={styles.dealModalPrice}>
              {deal.sensitive_masked ? "Цена скрыта" : formatMoney(finalPrice)}
            </span>
            <span className={styles.dealModalCreated}>
              {formatDateTime(deal.created_at)}
            </span>
            <CopyButton
              value={deal.id}
              kind="ghost"
              label={`ID: ${deal.id.slice(0, 8)}…`}
              toastText="ID сделки скопирован"
            />
          </div>

          <nav className={styles.dealModalTabs} role="tablist" aria-label="Разделы сделки">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                className={`${styles.dealModalTab}${activeTab === tab.id ? ` ${styles.dealModalTabActive}` : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {/* ---------- Body ---------- */}
        <div className={styles.dealModalBody}>
          {activeTab === "summary" ? (
            <div className={styles.dealModalSection}>
              <p className={styles.dealModalLead}>{dealStatusSummary(deal.status)}</p>
              <dl className={styles.dealMetaGrid}>
                <div>
                  <dt>Создано</dt>
                  <dd>{formatDateTime(deal.created_at)}</dd>
                </div>
                <div>
                  <dt>Контакт продавца зафиксирован</dt>
                  <dd>{deal.client_contacted_at ? formatDateTime(deal.client_contacted_at) : "Ещё не зафиксировано"}</dd>
                </div>
                <div>
                  <dt>Сумма заявки</dt>
                  <dd>{deal.sensitive_masked ? "—" : formatMoney(deal.price)}</dd>
                </div>
                <div>
                  <dt>Согласованная цена</dt>
                  <dd>
                    {deal.agreed_price_kopeks !== null && !deal.sensitive_masked
                      ? formatMoney(deal.agreed_price_kopeks)
                      : "—"}
                  </dd>
                </div>
              </dl>
              {deal.status === "REJECTED" ? (
                <div className={styles.dealModalLedgerNote}>
                  <p className={styles.dealModalEyebrow}>Причина отклонения</p>
                  <p style={deal.rejection_reason ? undefined : { color: "var(--text-soft)" }}>
                    {deal.rejection_reason || "Причина не указана"}
                  </p>
                </div>
              ) : null}
              {deal.status === "CONFIRMED" && deal.payment_requisites ? (
                deal.payment_requisites.available ? (
                  <div className={styles.dealModalLedgerNote}>
                    <p className={styles.dealModalEyebrow}>Реквизиты приёма платежей</p>
                    {deal.payment_requisites.collection_card_full ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.6rem",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                          Карта: {deal.payment_requisites.collection_card_full}
                        </span>
                        <CopyButton
                          kind="ghost"
                          value={deal.payment_requisites.collection_card_full}
                          label="Копировать"
                          toastText="Номер карты скопирован"
                        />
                      </div>
                    ) : null}
                    {deal.payment_requisites.payment_link ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.6rem",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                          Ссылка: {deal.payment_requisites.payment_link}
                        </span>
                        <CopyButton
                          kind="ghost"
                          value={deal.payment_requisites.payment_link}
                          label="Копировать"
                          toastText="Ссылка скопирована"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.dealModalLedgerNote}>
                    <p className={styles.dealModalEyebrow}>Реквизиты приёма платежей</p>
                    <p style={{ color: "var(--text-soft)" }}>Реквизиты приёма не настроены</p>
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {activeTab === "finance" ? (
            <div className={styles.dealModalSection}>
              {hasFinance ? (
                <ul className={styles.dealFinanceList}>
                  {deal.preview_worker_kopeks !== null ? (
                    <li>
                      <span className={styles.dealFinanceLabel}>Воркер</span>
                      <span className={styles.dealFinanceValue}>{formatMoney(deal.preview_worker_kopeks)}</span>
                    </li>
                  ) : null}
                  {deal.preview_blogger_kopeks !== null ? (
                    <li>
                      <span className={styles.dealFinanceLabel}>Блогер</span>
                      <span className={styles.dealFinanceValue}>{formatMoney(deal.preview_blogger_kopeks)}</span>
                    </li>
                  ) : null}
                  {deal.preview_platform_kopeks !== null ? (
                    <li>
                      <span className={styles.dealFinanceLabel}>Платформа</span>
                      <span className={styles.dealFinanceValue}>{formatMoney(deal.preview_platform_kopeks)}</span>
                    </li>
                  ) : null}
                  <li className={styles.dealFinanceTotal}>
                    <span className={styles.dealFinanceLabel}>Ртого по сделке</span>
                    <span className={styles.dealFinanceValue}>{formatMoney(finalPrice)}</span>
                  </li>
                </ul>
              ) : (
                <p className={styles.dealModalEmpty}>
                  {deal.sensitive_masked
                    ? "Раскладка по сторонам появится после проверки сделки администратором."
                    : "Финансовый расчёт по этой сделке ещё не сформирован."}
                </p>
              )}
            </div>
          ) : null}

          {activeTab === "contacts" ? (
            <div className={styles.dealModalSection}>
              <div className={styles.dealContactRow}>
                <div className={styles.dealContactInfo}>
                  <p className={styles.dealContactLabel}>Магазин</p>
                  <p className={styles.dealContactValue} title={deal.shop_link}>{deal.shop_link}</p>
                </div>
                <div className={styles.dealContactActions}>
                  <a
                    className={styles.dealLinkButton}
                    href={deal.shop_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть
                  </a>
                  <CopyButton
                    value={deal.shop_link}
                    kind="ghost"
                    label="Скопировать"
                    toastText="Ссылка скопирована"
                  />
                </div>
              </div>

              <div className={styles.dealContactRow}>
                <div className={styles.dealContactInfo}>
                  <p className={styles.dealContactLabel}>Telegram продавца</p>
                  <p className={styles.dealContactValue}>
                    {deal.sensitive_masked ? "Скрыто до проверки" : deal.seller_tg}
                  </p>
                </div>
                <div className={styles.dealContactActions}>
                  {sellerTgHref ? (
                    <a
                      className={styles.dealLinkButton}
                      href={sellerTgHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Написать
                    </a>
                  ) : null}
                  {!deal.sensitive_masked && deal.seller_tg ? (
                    <CopyButton
                      value={deal.seller_tg}
                      kind="ghost"
                      label="Скопировать"
                      toastText="Telegram скопирован"
                    />
                  ) : null}
                </div>
              </div>

              <div className={styles.dealContactRow}>
                <div className={styles.dealContactInfo}>
                  <p className={styles.dealContactLabel}>Телефон продавца</p>
                  <p className={styles.dealContactValue}>
                    {deal.sensitive_masked ? "Скрыто до проверки" : deal.seller_number}
                  </p>
                </div>
                <div className={styles.dealContactActions}>
                  {sellerPhoneHref ? (
                    <a className={styles.dealLinkButton} href={sellerPhoneHref}>
                      Позвонить
                    </a>
                  ) : null}
                  {!deal.sensitive_masked && deal.seller_number ? (
                    <CopyButton
                      value={deal.seller_number}
                      kind="ghost"
                      label="Скопировать"
                      toastText="Телефон скопирован"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "edit" && editable ? (
            <div className={styles.dealModalSection}>
              <Field label="Название товара" help={fieldError("item_name")}>
                <TextInput
                  value={form.item_name}
                  onChange={(event) => updateField("item_name", event.target.value)}
                  onBlur={() => markTouched("item_name")}
                  placeholder="Wireless Earbuds Pro"
                  maxLength={512}
                  aria-invalid={Boolean(fieldError("item_name"))}
                />
              </Field>

              <Field label="Ссылка на магазин" help={fieldError("shop_link")}>
                <TextInput
                  value={form.shop_link}
                  onChange={(event) => updateField("shop_link", event.target.value)}
                  onBlur={() => markTouched("shop_link")}
                  placeholder="https://example-shop.ru/products/..."
                  inputMode="url"
                  aria-invalid={Boolean(fieldError("shop_link"))}
                />
              </Field>

              <TwoColumn>
                <Field label="Telegram продавца" help={fieldError("seller_tg")}>
                  <TextInput
                    value={form.seller_tg}
                    onChange={(event) => updateField("seller_tg", event.target.value)}
                    onBlur={() => markTouched("seller_tg")}
                    placeholder="@shop_owner"
                    aria-invalid={Boolean(fieldError("seller_tg"))}
                  />
                </Field>
                <Field label="Телефон продавца" help={fieldError("seller_number")}>
                  <TextInput
                    value={form.seller_number}
                    onChange={(event) => updateField("seller_number", event.target.value)}
                    onBlur={() => markTouched("seller_number")}
                    placeholder="+79991110011"
                    inputMode="tel"
                    aria-invalid={Boolean(fieldError("seller_number"))}
                  />
                </Field>
              </TwoColumn>

              <Field label="Цена, ₽" help={fieldError("price_rub")}>
                <TextInput
                  value={form.price_rub}
                  onChange={(event) => updateField("price_rub", event.target.value)}
                  onBlur={() => markTouched("price_rub")}
                  placeholder="7990"
                  inputMode="decimal"
                  aria-invalid={Boolean(fieldError("price_rub"))}
                />
              </Field>

              {serverError ? <Message tone="error">{serverError}</Message> : null}
            </div>
          ) : null}
        </div>

        {/* ---------- Footer ---------- */}
        <footer className={styles.dealModalFooter}>
          {acceptAction ? (
            <Button onClick={acceptAction.onAction} disabled={Boolean(acceptAction.pending)}>
              {acceptAction.pending ? "Отправляем…" : acceptAction.label}
            </Button>
          ) : null}
          {activeTab === "edit" && editable ? (
            <>
              <Button
                onClick={handleSave}
                disabled={!dirty || Object.keys(liveErrors).length > 0 || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Сохраняем…" : "Сохранить"}
              </Button>
              <Button kind="ghost" onClick={handleReset} disabled={!dirty || saveMutation.isPending}>
                Сбросить
              </Button>
            </>
          ) : null}
          <Button kind="secondary" onClick={onClose}>Закрыть</Button>
        </footer>
      </div>
    </div>
  );
};

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
  referral: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3l3 3-3 3M19 6h-5",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  copy: "M9 9h10v12H9zM5 5h10v4M5 5v10",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  mail: "M3 7l9 6 9-6M3 7v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1",
  tg: "M21 4L3 11l5 2 2 6 3-3 5 4 3-16z",
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 11h18",
  lock: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z",
  inbox: "M21 13l-4-9H7l-4 9v8a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8zM3 13h6l1 3h4l1-3h6",
  logout: "M16 17l5-5-5-5M21 12H9M9 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5",
} as const;

/* =========================================================
   Identity header — top of every cabinet
   ========================================================= */

const IdentityHeader = ({
  me,
  subtitle,
}: {
  me: UserMeRead;
  subtitle?: string;
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
          {me.telegram ? (
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

  useEffect(() => {
    setProfileForm(buildProfileForm(me));
  }, [me]);

  return (
    <SectionCard
      title="Профиль и реквизиты"
      lead="Рмя редактируете вы, никнейм и Telegram управляются администратором. Карта для выплат хранится в виде хеша — мы видим только последние 4 цифры."
    >
      <div className={styles.profileGrid}>
        <div className={styles.profileBlock}>
          <p className={styles.profileBlockTitle}>Контакты</p>
          <TwoColumn>
            <Field label="Рмя">
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
            ) : (
              <Field label="Telegram">
                <TextInput value={me.telegram || "—"} readOnly disabled />
              </Field>
            )}
          </TwoColumn>
          {me.nickname ? (
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

  return (
    <>
      <IdentityHeader me={me} />

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
                lead="Рстория начислений, заморозок и выплат."
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
                    title="Рстория пуста"
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

type BloggerTab = "overview" | "deals" | "referral" | "finance" | "profile";

const BloggerCabinet = ({ me }: { me: UserMeRead }) => {
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();
  const [tab, setTab] = useState<BloggerTab>("overview");
  const [toast, setToast] = useState<Toast>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ amount_rub: "" });
  const [statusFilter, setStatusFilter] = useState<DealStatus | "ALL">("ALL");
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<LedgerEntryStatus | "ALL">("ALL");
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);

  const statsQuery = useQuery({ queryKey: ["me", "stats"], queryFn: api.getMeStats });
  const dealsQuery = useQuery({ queryKey: ["me", "deals"], queryFn: api.getMyDeals });
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

  const acceptDealMutation = useMutation({
    mutationFn: (dealId: string) => api.acceptDeal(dealId),
    onSuccess: () => {
      setToast({ tone: "success", text: "Заявка принята и отправлена администратору." });
      queryClient.invalidateQueries({ queryKey: ["me", "deals"] });
      queryClient.invalidateQueries({ queryKey: ["me", "stats"] });
      setActiveDealId(null);
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

  const bloggerStats = statsQuery.data?.role === "Bloger" ? statsQuery.data : null;
  void bloggerStats;
  const deals = dealsQuery.data?.deals || [];
  const filteredDeals = useMemo(
    () => (statusFilter === "ALL" ? deals : deals.filter((d) => d.status === statusFilter)),
    [deals, statusFilter],
  );
  const ledger = ledgerQuery.data?.items || [];
  const filteredLedger = useMemo(
    () => (ledgerStatusFilter === "ALL" ? ledger : ledger.filter((e) => e.status === ledgerStatusFilter)),
    [ledger, ledgerStatusFilter],
  );
  const newDealsCount = deals.filter((d) => d.status === "NEW").length;

  const tabs: TabDef[] = [
    { id: "overview", label: "Обзор", iconPath: ICONS.overview },
    { id: "deals", label: "Заявки", iconPath: ICONS.inbox, badge: newDealsCount || null },
    { id: "referral", label: "Реферал", iconPath: ICONS.referral },
    { id: "finance", label: "Финансы", iconPath: ICONS.finance },
    { id: "profile", label: "Профиль", iconPath: ICONS.profile },
  ];

  return (
    <>
      <IdentityHeader me={me} />

      <div className={styles.balanceTiles}>
        <div className={`${styles.balanceTile} ${styles.accent}`}>
          <p className={styles.balanceTileLabel}>Доступно к выводу</p>
          <p className={styles.balanceTileValue}>{formatMoney(me.balance)}</p>
          <p className={styles.balanceTileNote}>Запросите выплату в разделе «Финансы».</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>В обработке</p>
          <p className={styles.balanceTileValue}>{formatMoney(me.balance_pending_confirmation_kopeks)}</p>
          <p className={styles.balanceTileNote}>Подтверждается администратором.</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>Ваша ставка</p>
          <p className={styles.balanceTileValue}>{me.percent}%</p>
          <p className={styles.balanceTileNote}>Доля от каждой сделки.</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>Новые заявки</p>
          <p className={styles.balanceTileValue}>{formatNumber(newDealsCount)}</p>
          <p className={styles.balanceTileNote}>
            {newDealsCount > 0 ? "Требуют вашего принятия." : "Все заявки разобраны."}
          </p>
        </div>
      </div>

      {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}

      <div className={styles.shell}>
        <Sidebar
          tabs={tabs}
          active={tab}
          onSelect={(id) => setTab(id as BloggerTab)}
          helpText="Принимайте заявки воркеров, делитесь ссылкой, запрашивайте выплаты."
        />

        <div className={styles.workspace}>
          {tab === "overview" ? (
            <Stack>
              {dealsQuery.isLoading ? (
                <SkeletonTable rows={3} />
              ) : (
                <OverviewCharts deals={deals} />
              )}
            </Stack>
          ) : null}

          {tab === "deals" ? (
            <SectionCard
              title="Заявки воркеров"
              lead="Новые заявки нужно принять. После проверки администратором откроются контакты и сумма."
            >
              <div className={styles.toolbarRow}>
                <div className={styles.toolbarFilters}>
                  <SelectInput
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as DealStatus | "ALL")}
                  >
                    <option value="ALL">Все статусы ({deals.length})</option>
                    <option value="NEW">Новые ({newDealsCount})</option>
                    <option value="REVIEW">На проверке</option>
                    <option value="CONFIRMED">Подтверждены</option>
                    <option value="ESCROW_HELD">Эскроу</option>
                    <option value="PAID">Оплачены</option>
                    <option value="COMPLETED">Выполнены</option>
                    <option value="REJECTED">Отклонены</option>
                    <option value="REFUNDED">Возврат</option>
                  </SelectInput>
                </div>
              </div>
              {dealsQuery.isLoading ? (
                <SkeletonTable rows={5} />
              ) : filteredDeals.length === 0 ? (
                <EmptyState
                  icon={<Icon d={ICONS.inbox} />}
                  title={statusFilter === "ALL" ? "Заявок пока нет" : "Нет заявок в этом статусе"}
                  text={statusFilter === "ALL" ? "Поделитесь реферальной ссылкой с воркерами." : "Попробуйте сменить фильтр."}
                  action={statusFilter === "ALL" ? <Button onClick={() => setTab("referral")}>К реферальной ссылке</Button> : null}
                />
              ) : (
                <>
                  <ul className={styles.dealsMobileList}>
                    {filteredDeals.map((deal) => (
                      <DealMobileCard
                        key={`m-${deal.id}`}
                        deal={deal}
                        onOpen={() => setActiveDealId(deal.id)}
                        trailing={
                          deal.status === "NEW" ? (
                            <Button
                              kind="secondary"
                              onClick={() => acceptDealMutation.mutate(deal.id)}
                              disabled={acceptDealMutation.isPending}
                            >
                              Принять
                            </Button>
                          ) : null
                        }
                      />
                    ))}
                  </ul>
                  <div className={styles.dealsDesktopTable}>
                    <TableWrap>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Товар</th>
                            <th>Статус</th>
                            <th>Цена</th>
                            <th>Контакт</th>
                            <th>Создано</th>
                            <th>Действие</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDeals.map((deal) => (
                            <tr
                              key={deal.id}
                              className={styles.dealRowClickable}
                              tabIndex={0}
                              role="button"
                              aria-label={`Открыть сделку ${deal.item_name}`}
                              onClick={() => setActiveDealId(deal.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setActiveDealId(deal.id);
                                }
                              }}
                            >
                              <td>
                                <span className={styles.itemTitle}>{deal.item_name}</span>
                                <a
                                  href={deal.shop_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.shopLink}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {deal.shop_link}
                                </a>
                              </td>
                              <td><StatusCell deal={deal} /></td>
                              <td>{deal.sensitive_masked ? <Masked /> : formatMoney(deal.effective_price_kopeks || deal.price)}</td>
                              <td>
                                {deal.sensitive_masked ? (
                                  <Masked />
                                ) : (
                                  <div className={styles.contactCell}>
                                    <code>{deal.seller_tg}</code>
                                    <code style={{ color: "var(--text-soft)" }}>{deal.seller_number}</code>
                                  </div>
                                )}
                              </td>
                              <td>{formatDateTime(deal.created_at)}</td>
                              <td onClick={(event) => event.stopPropagation()}>
                                {deal.status === "NEW" ? (
                                  <Button
                                    onClick={() => acceptDealMutation.mutate(deal.id)}
                                    disabled={acceptDealMutation.isPending}
                                  >
                                    Принять
                                  </Button>
                                ) : (
                                  <span style={{ color: "var(--text-soft)", fontSize: "0.86rem" }}>
                                    {deal.status === "REJECTED" ? "Отклонена" : "В работе"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </TableWrap>
                  </div>
                </>
              )}
            </SectionCard>
          ) : null}

          {tab === "referral" ? (
            <Stack>
              <SectionCard
                title="Реферальная ссылка"
                lead="Делитесь ссылкой — все воркеры, перешедшие по ней, автоматически привязываются к вам."
              >
                <div className={styles.referralCard}>
                  <img src="/images/referral-art.svg" alt="" aria-hidden="true" className={styles.referralCardArt} />
                  <p className={styles.referralLabel}>Ваша ссылка</p>
                  <p className={styles.referralValue}>
                    {absolutizeUrl(me.referral_invite_url) || "Сгенерируется после первой настройки администратором"}
                  </p>
                  <div className={styles.referralActions}>
                    <CopyButton
                      value={absolutizeUrl(me.referral_invite_url)}
                      kind="primary"
                      label="Скопировать ссылку"
                      toastText="Ссылка скопирована в буфер"
                    />
                    {me.referral_invite_url ? (
                      <Button kind="secondary" href={absolutizeUrl(me.referral_invite_url)}>
                        <Icon d={ICONS.link} /> Открыть
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Как это работает" lead="Короткий цикл от перехода воркера до выплаты.">
                <Stack>
                  <ProcessStep n="1" title="Воркер переходит по ссылке" text="Регистрация автоматически связывается с вашим профилем." />
                  <ProcessStep n="2" title="Воркер создаёт сделку" text="Заявка с данными продавца уходит вам в раздел «Заявки»." />
                  <ProcessStep n="3" title="Вы принимаете заявку" text="Заявка уходит администратору на проверку. Контакты и сумма становятся видимыми после подтверждения." />
                  <ProcessStep n="4" title="Подтверждение → начисление" text="Администратор подтверждает оплату, средства попадают на баланс." />
                </Stack>
              </SectionCard>
            </Stack>
          ) : null}

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

              <SectionCard title="Рстория операций" lead="Начисления, заморозки, запросы и завершённые выплаты.">
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
                    title="Рстория пуста"
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

      {showCopyModal ? (
        <Modal
          title="Ссылка скопирована"
          onClose={() => setShowCopyModal(false)}
          actions={<Button kind="secondary" onClick={() => setShowCopyModal(false)}>Закрыть</Button>}
        >
          <Message tone="success">
            Реферальная ссылка уже в буфере обмена. Можно сразу отправлять её работникам.
          </Message>
        </Modal>
      ) : null}

      {activeDealId
        ? (() => {
            const activeDeal = deals.find((d) => d.id === activeDealId);
            if (!activeDeal) return null;
            return (
              <DealDetailsModal
                deal={activeDeal}
                onClose={() => setActiveDealId(null)}
                acceptAction={
                  activeDeal.status === "NEW"
                    ? {
                        label: "Принять заявку",
                        onAction: () => acceptDealMutation.mutate(activeDeal.id),
                        pending: acceptDealMutation.isPending,
                      }
                    : null
                }
              />
            );
          })()
        : null}

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

const ProcessStep = ({ n, title, text }: { n: string; title: string; text: string }) => (
  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.9rem", padding: "0.4rem 0" }}>
    <div
      style={{
        width: "2.4rem",
        height: "2.4rem",
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius-sm)",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid var(--border-strong)",
        color: "var(--text-strong)",
        fontFamily: "var(--font-narrow)",
        fontWeight: 600,
        fontSize: "0.78rem",
      }}
    >
      {n}
    </div>
    <div>
      <p style={{ margin: 0, fontWeight: 600, color: "var(--text-strong)", fontSize: "0.96rem", letterSpacing: "-0.01em" }}>{title}</p>
      <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.55 }}>{text}</p>
    </div>
  </div>
);

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
        queryClient.invalidateQueries({ queryKey: ["me", "stats"] }),
        queryClient.invalidateQueries({ queryKey: ["me", "deals"] }),
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
