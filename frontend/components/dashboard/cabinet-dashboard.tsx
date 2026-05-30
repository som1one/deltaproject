"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { appConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
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
} from "@/components/common/ui";
import { CopyButton } from "@/components/common/copy-button";
import { PayoutCardInput } from "@/components/common/payout-card-input";
import { useToast } from "@/components/common/toast";
import { OverviewCharts } from "@/components/dashboard/overview-charts";
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

const Masked = ({ children = "РЎРєСЂС‹С‚Рѕ" }: { children?: ReactNode }) => (
  <span className={styles.maskedCell}>{children}</span>
);

/** РџСЂРµРІСЂР°С‰Р°РµС‚ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅСѓСЋ СЃСЃС‹Р»РєСѓ (`/ref/<nick>`) РІ Р°Р±СЃРѕР»СЋС‚РЅС‹Р№ URL.
 *  Р‘Р°Р·Р° Р±РµСЂС‘С‚СЃСЏ РёР· С‚РµРєСѓС‰РµРіРѕ origin РІ Р±СЂР°СѓР·РµСЂРµ (С‡С‚РѕР±С‹ СЃСЃС‹Р»РєР° РІСЃРµРіРґР°
 *  СЃРѕРІРїР°РґР°Р»Р° СЃ С…РѕСЃС‚РѕРј, РѕС‚РєСѓРґР° Р·Р°С€С‘Р» РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ), СЃ С„РѕР»Р±СЌРєРѕРј РЅР°
 *  NEXT_PUBLIC_APP_URL РґР»СЏ SSR. */
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

/** РњРѕР±РёР»СЊРЅР°СЏ РєР°СЂС‚РѕС‡РєР° СЃРґРµР»РєРё. РќР° в‰Ґ720px СЃРїСЂСЏС‚Р°РЅР° С‡РµСЂРµР· CSS. */
const DealMobileCard = ({
  deal,
  onOpen,
  trailing,
}: {
  deal: DealRead;
  onOpen: () => void;
  /** Р”РѕРї. РєРЅРѕРїРєР° СЃРїСЂР°РІР° РІРЅРёР·Сѓ (РЅР°РїСЂРёРјРµСЂ, В«РџСЂРёРЅСЏС‚СЊВ» Сѓ Р±Р»РѕРіРµСЂР°). */
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
    aria-label={`РћС‚РєСЂС‹С‚СЊ СЃРґРµР»РєСѓ ${deal.item_name}`}
  >
    <div className={styles.dealMobileTop}>
      <span className={styles.dealMobileTitle}>{deal.item_name}</span>
      <StatusPill tone={dealStatusTone(deal.status)}>{formatDealStatus(deal.status)}</StatusPill>
    </div>
    <div className={styles.dealMobileFoot}>
      <span className={styles.dealMobilePrice}>
        {deal.sensitive_masked ? "вЂ”" : formatMoney(deal.effective_price_kopeks || deal.price)}
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
   Deal details modal вЂ” full custom UX, not reusing the generic
   Modal helper. Tabs: В«РЎРІРѕРґРєР°В» / В«Р¤РёРЅР°РЅСЃС‹В» / В«РљРѕРЅС‚Р°РєС‚С‹В» /
   В«Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊВ». Fixed header (status, money, ID, support,
   close), independent body scroll, sticky action footer.
   ========================================================= */

const DEAL_SUPPORT_HANDLE = "looneymoonhelper";

const dealStatusSummary = (status: DealStatus): string => {
  switch (status) {
    case "NEW":
      return "Р—Р°СЏРІРєР° РѕС‚РїСЂР°РІР»РµРЅР° Р±Р»РѕРіРµСЂСѓ. Р–РґС‘Рј, РєРѕРіРґР° РѕРЅ РїСЂРёРјРµС‚ РµС‘ РІ СЂР°Р±РѕС‚Сѓ.";
    case "REVIEW":
      return "РЎРґРµР»РєР° РЅР° РїСЂРѕРІРµСЂРєРµ Сѓ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°. РљРѕРЅС‚Р°РєС‚С‹ Рё С„РёРЅР°РЅСЃС‹ РїРѕРєР° СЃРєСЂС‹С‚С‹.";
    case "CONFIRMED":
      return "РЎРґРµР»РєР° РїРѕРґС‚РІРµСЂР¶РґРµРЅР°. РЎРѕРіР»Р°СЃРѕРІР°РЅР° С†РµРЅР°, РјРѕР¶РЅРѕ СЂР°Р±РѕС‚Р°С‚СЊ СЃ РїСЂРѕРґР°РІС†РѕРј.";
    case "PAID":
      return "РћРїР»Р°С‚Р° РїСЂРѕРІРµРґРµРЅР°. РЎСѓРјРјР° Р·Р°С‡РёСЃР»РµРЅР° РІ Р±Р°Р»Р°РЅСЃ РїРѕ СЃС…РµРјРµ.";
    case "COMPLETED":
      return "РЎРґРµР»РєР° Р·Р°РєСЂС‹С‚Р°. Р’СЃРµ РЅР°С‡РёСЃР»РµРЅРёСЏ СѓР¶Рµ РѕС‚СЂР°Р¶РµРЅС‹ РІ С„РёРЅР°РЅСЃР°С….";
    case "REJECTED":
      return "РЎРґРµР»РєР° РѕС‚РєР»РѕРЅРµРЅР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј РёР»Рё Р±Р»РѕРіРµСЂРѕРј. РќР°С‡РёСЃР»РµРЅРёР№ РЅРµС‚.";
    default:
      return "РЎС‚Р°С‚СѓСЃ РЅРµРёР·РІРµСЃС‚РµРЅ.";
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
  if (!itemName) errors.item_name = "РЈРєР°Р¶РёС‚Рµ РЅР°Р·РІР°РЅРёРµ С‚РѕРІР°СЂР°.";
  else if (itemName.length > 512) errors.item_name = "РќР°Р·РІР°РЅРёРµ СЃР»РёС€РєРѕРј РґР»РёРЅРЅРѕРµ (РјР°РєСЃ. 512).";

  const link = form.shop_link.trim();
  if (!link) {
    errors.shop_link = "Р”РѕР±Р°РІСЊС‚Рµ СЃСЃС‹Р»РєСѓ РЅР° РјР°РіР°Р·РёРЅ.";
  } else if (link.length > 2048) {
    errors.shop_link = "РЎСЃС‹Р»РєР° СЃР»РёС€РєРѕРј РґР»РёРЅРЅР°СЏ (РјР°РєСЃ. 2048).";
  } else {
    try {
      const url = new URL(link);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.shop_link = "РЎСЃС‹Р»РєР° РґРѕР»Р¶РЅР° РЅР°С‡РёРЅР°С‚СЊСЃСЏ СЃ http:// РёР»Рё https://";
      }
    } catch {
      errors.shop_link = "Р­С‚Рѕ РЅРµ РїРѕС…РѕР¶Рµ РЅР° РєРѕСЂСЂРµРєС‚РЅСѓСЋ СЃСЃС‹Р»РєСѓ.";
    }
  }

  const tg = form.seller_tg.trim();
  if (!tg) {
    errors.seller_tg = "РЈРєР°Р¶РёС‚Рµ Telegram РїСЂРѕРґР°РІС†Р°.";
  } else if (tg.length > 255) {
    errors.seller_tg = "РЎР»РёС€РєРѕРј РґР»РёРЅРЅС‹Р№ РЅРёРє (РјР°РєСЃ. 255).";
  } else if (!/^@?[A-Za-z0-9_]{3,}$/.test(tg)) {
    errors.seller_tg = "РўРѕР»СЊРєРѕ Р»Р°С‚РёРЅРёС†Р°, С†РёС„СЂС‹ Рё _ (РѕС‚ 3 СЃРёРјРІРѕР»РѕРІ).";
  }

  const phone = form.seller_number.trim();
  if (!phone) {
    errors.seller_number = "РЈРєР°Р¶РёС‚Рµ С‚РµР»РµС„РѕРЅ РїСЂРѕРґР°РІС†Р°.";
  } else if (phone.length > 64) {
    errors.seller_number = "РЎР»РёС€РєРѕРј РґР»РёРЅРЅС‹Р№ РЅРѕРјРµСЂ (РјР°РєСЃ. 64).";
  } else {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) errors.seller_number = "Р’ РЅРѕРјРµСЂРµ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РјРёРЅРёРјСѓРј 7 С†РёС„СЂ.";
    else if (!/^[+\d][\d\s()\-]*$/.test(phone))
      errors.seller_number = "Р”РѕРїСѓСЃС‚РёРјС‹ С†РёС„СЂС‹, +, РїСЂРѕР±РµР»С‹, СЃРєРѕР±РєРё Рё РґРµС„РёСЃС‹.";
  }

  const priceRaw = form.price_rub.trim().replace(",", ".");
  if (!priceRaw) {
    errors.price_rub = "РЈРєР°Р¶РёС‚Рµ С†РµРЅСѓ РІ СЂСѓР±Р»СЏС….";
  } else {
    const priceNum = Number(priceRaw);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      errors.price_rub = "Р¦РµРЅР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РїРѕР»РѕР¶РёС‚РµР»СЊРЅС‹Рј С‡РёСЃР»РѕРј.";
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

  // РЎР±СЂРѕСЃ С„РѕСЂРјС‹ Рё Р°РєС‚РёРІРЅРѕР№ РІРєР»Р°РґРєРё РїСЂРё СЃРјРµРЅРµ СЃРґРµР»РєРё.
  useEffect(() => {
    setForm(dealToEditForm(deal));
    setTouched({});
    setServerError(null);
    setActiveTab("summary");
  }, [deal.id, deal.item_name, deal.shop_link, deal.seller_tg, deal.seller_number, deal.price]);

  // Esc вЂ” Р·Р°РєСЂС‹С‚СЊ РјРѕРґР°Р»РєСѓ. Р‘Р»РѕРєРёСЂСѓРµРј СЃРєСЂРѕР»Р» СЃС‚СЂР°РЅРёС†С‹ Р·Р° РјРѕРґР°Р»РєРѕР№.
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
    `Р—РґСЂР°РІСЃС‚РІСѓР№С‚Рµ! РќСѓР¶РЅР° РїРѕРјРѕС‰СЊ РїРѕ СЃРґРµР»РєРµ ${deal.id} (${deal.item_name}).`,
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
      pushToast("РР·РјРµРЅРµРЅРёСЏ СЃРѕС…СЂР°РЅРµРЅС‹.", "success");
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
    { id: "summary", label: "РЎРІРѕРґРєР°" },
    { id: "finance", label: "Р¤РёРЅР°РЅСЃС‹" },
    { id: "contacts", label: "РљРѕРЅС‚Р°РєС‚С‹" },
  ];
  if (editable) tabs.push({ id: "edit", label: "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ" });

  const headerStatusTone = dealStatusTone(deal.status);

  return (
    <div className={styles.dealModalBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dealModalCard} onClick={(event) => event.stopPropagation()}>
        {/* ---------- Header ---------- */}
        <header className={styles.dealModalHeader}>
          <div className={styles.dealModalHeaderTop}>
            <div className={styles.dealModalIdent}>
              <p className={styles.dealModalEyebrow}>РЎРґРµР»РєР°</p>
              <h2 className={styles.dealModalTitle}>{deal.item_name}</h2>
            </div>
            <div className={styles.dealModalHeaderActions}>
              <a
                className={styles.dealIconButton}
                href={supportHref}
                target="_blank"
                rel="noreferrer"
                title={`РџРѕРґРґРµСЂР¶РєР° @${DEAL_SUPPORT_HANDLE}`}
                aria-label="РЎРІСЏР·Р°С‚СЊСЃСЏ СЃ РїРѕРґРґРµСЂР¶РєРѕР№"
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
                title="Р—Р°РєСЂС‹С‚СЊ (Esc)"
                aria-label="Р—Р°РєСЂС‹С‚СЊ"
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
              {deal.sensitive_masked ? "Р¦РµРЅР° СЃРєСЂС‹С‚Р°" : formatMoney(finalPrice)}
            </span>
            <span className={styles.dealModalCreated}>
              {formatDateTime(deal.created_at)}
            </span>
            <CopyButton
              value={deal.id}
              kind="ghost"
              label={`ID: ${deal.id.slice(0, 8)}вЂ¦`}
              toastText="ID СЃРґРµР»РєРё СЃРєРѕРїРёСЂРѕРІР°РЅ"
            />
          </div>

          <nav className={styles.dealModalTabs} role="tablist" aria-label="Р Р°Р·РґРµР»С‹ СЃРґРµР»РєРё">
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
                  <dt>РЎРѕР·РґР°РЅРѕ</dt>
                  <dd>{formatDateTime(deal.created_at)}</dd>
                </div>
                <div>
                  <dt>РљРѕРЅС‚Р°РєС‚ РїСЂРѕРґР°РІС†Р° Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅ</dt>
                  <dd>{deal.client_contacted_at ? formatDateTime(deal.client_contacted_at) : "Р•С‰С‘ РЅРµ Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅРѕ"}</dd>
                </div>
                <div>
                  <dt>РЎСѓРјРјР° Р·Р°СЏРІРєРё</dt>
                  <dd>{deal.sensitive_masked ? "вЂ”" : formatMoney(deal.price)}</dd>
                </div>
                <div>
                  <dt>РЎРѕРіР»Р°СЃРѕРІР°РЅРЅР°СЏ С†РµРЅР°</dt>
                  <dd>
                    {deal.agreed_price_kopeks !== null && !deal.sensitive_masked
                      ? formatMoney(deal.agreed_price_kopeks)
                      : "вЂ”"}
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
            </div>
          ) : null}

          {activeTab === "finance" ? (
            <div className={styles.dealModalSection}>
              {hasFinance ? (
                <ul className={styles.dealFinanceList}>
                  {deal.preview_worker_kopeks !== null ? (
                    <li>
                      <span className={styles.dealFinanceLabel}>Р’РѕСЂРєРµСЂ</span>
                      <span className={styles.dealFinanceValue}>{formatMoney(deal.preview_worker_kopeks)}</span>
                    </li>
                  ) : null}
                  {deal.preview_blogger_kopeks !== null ? (
                    <li>
                      <span className={styles.dealFinanceLabel}>Р‘Р»РѕРіРµСЂ</span>
                      <span className={styles.dealFinanceValue}>{formatMoney(deal.preview_blogger_kopeks)}</span>
                    </li>
                  ) : null}
                  {deal.preview_platform_kopeks !== null ? (
                    <li>
                      <span className={styles.dealFinanceLabel}>РџР»Р°С‚С„РѕСЂРјР°</span>
                      <span className={styles.dealFinanceValue}>{formatMoney(deal.preview_platform_kopeks)}</span>
                    </li>
                  ) : null}
                  <li className={styles.dealFinanceTotal}>
                    <span className={styles.dealFinanceLabel}>РС‚РѕРіРѕ РїРѕ СЃРґРµР»РєРµ</span>
                    <span className={styles.dealFinanceValue}>{formatMoney(finalPrice)}</span>
                  </li>
                </ul>
              ) : (
                <p className={styles.dealModalEmpty}>
                  {deal.sensitive_masked
                    ? "Р Р°СЃРєР»Р°РґРєР° РїРѕ СЃС‚РѕСЂРѕРЅР°Рј РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РїСЂРѕРІРµСЂРєРё СЃРґРµР»РєРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј."
                    : "Р¤РёРЅР°РЅСЃРѕРІС‹Р№ СЂР°СЃС‡С‘С‚ РїРѕ СЌС‚РѕР№ СЃРґРµР»РєРµ РµС‰С‘ РЅРµ СЃС„РѕСЂРјРёСЂРѕРІР°РЅ."}
                </p>
              )}
            </div>
          ) : null}

          {activeTab === "contacts" ? (
            <div className={styles.dealModalSection}>
              <div className={styles.dealContactRow}>
                <div className={styles.dealContactInfo}>
                  <p className={styles.dealContactLabel}>РњР°РіР°Р·РёРЅ</p>
                  <p className={styles.dealContactValue} title={deal.shop_link}>{deal.shop_link}</p>
                </div>
                <div className={styles.dealContactActions}>
                  <a
                    className={styles.dealLinkButton}
                    href={deal.shop_link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    РћС‚РєСЂС‹С‚СЊ
                  </a>
                  <CopyButton
                    value={deal.shop_link}
                    kind="ghost"
                    label="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ"
                    toastText="РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°"
                  />
                </div>
              </div>

              <div className={styles.dealContactRow}>
                <div className={styles.dealContactInfo}>
                  <p className={styles.dealContactLabel}>Telegram РїСЂРѕРґР°РІС†Р°</p>
                  <p className={styles.dealContactValue}>
                    {deal.sensitive_masked ? "РЎРєСЂС‹С‚Рѕ РґРѕ РїСЂРѕРІРµСЂРєРё" : deal.seller_tg}
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
                      РќР°РїРёСЃР°С‚СЊ
                    </a>
                  ) : null}
                  {!deal.sensitive_masked && deal.seller_tg ? (
                    <CopyButton
                      value={deal.seller_tg}
                      kind="ghost"
                      label="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ"
                      toastText="Telegram СЃРєРѕРїРёСЂРѕРІР°РЅ"
                    />
                  ) : null}
                </div>
              </div>

              <div className={styles.dealContactRow}>
                <div className={styles.dealContactInfo}>
                  <p className={styles.dealContactLabel}>РўРµР»РµС„РѕРЅ РїСЂРѕРґР°РІС†Р°</p>
                  <p className={styles.dealContactValue}>
                    {deal.sensitive_masked ? "РЎРєСЂС‹С‚Рѕ РґРѕ РїСЂРѕРІРµСЂРєРё" : deal.seller_number}
                  </p>
                </div>
                <div className={styles.dealContactActions}>
                  {sellerPhoneHref ? (
                    <a className={styles.dealLinkButton} href={sellerPhoneHref}>
                      РџРѕР·РІРѕРЅРёС‚СЊ
                    </a>
                  ) : null}
                  {!deal.sensitive_masked && deal.seller_number ? (
                    <CopyButton
                      value={deal.seller_number}
                      kind="ghost"
                      label="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ"
                      toastText="РўРµР»РµС„РѕРЅ СЃРєРѕРїРёСЂРѕРІР°РЅ"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "edit" && editable ? (
            <div className={styles.dealModalSection}>
              <Field label="РќР°Р·РІР°РЅРёРµ С‚РѕРІР°СЂР°" help={fieldError("item_name")}>
                <TextInput
                  value={form.item_name}
                  onChange={(event) => updateField("item_name", event.target.value)}
                  onBlur={() => markTouched("item_name")}
                  placeholder="Wireless Earbuds Pro"
                  maxLength={512}
                  aria-invalid={Boolean(fieldError("item_name"))}
                />
              </Field>

              <Field label="РЎСЃС‹Р»РєР° РЅР° РјР°РіР°Р·РёРЅ" help={fieldError("shop_link")}>
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
                <Field label="Telegram РїСЂРѕРґР°РІС†Р°" help={fieldError("seller_tg")}>
                  <TextInput
                    value={form.seller_tg}
                    onChange={(event) => updateField("seller_tg", event.target.value)}
                    onBlur={() => markTouched("seller_tg")}
                    placeholder="@shop_owner"
                    aria-invalid={Boolean(fieldError("seller_tg"))}
                  />
                </Field>
                <Field label="РўРµР»РµС„РѕРЅ РїСЂРѕРґР°РІС†Р°" help={fieldError("seller_number")}>
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

              <Field label="Р¦РµРЅР°, в‚Ѕ" help={fieldError("price_rub")}>
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
              {acceptAction.pending ? "РћС‚РїСЂР°РІР»СЏРµРјвЂ¦" : acceptAction.label}
            </Button>
          ) : null}
          {activeTab === "edit" && editable ? (
            <>
              <Button
                onClick={handleSave}
                disabled={!dirty || Object.keys(liveErrors).length > 0 || saveMutation.isPending}
              >
                {saveMutation.isPending ? "РЎРѕС…СЂР°РЅСЏРµРјвЂ¦" : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
              <Button kind="ghost" onClick={handleReset} disabled={!dirty || saveMutation.isPending}>
                РЎР±СЂРѕСЃРёС‚СЊ
              </Button>
            </>
          ) : null}
          <Button kind="secondary" onClick={onClose}>Р—Р°РєСЂС‹С‚СЊ</Button>
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
   Identity header вЂ” top of every cabinet
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
          {showSub ? <> В· {subtitle}</> : null}
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
              <code>вЂўвЂўвЂўвЂў {me.payout_card_last4}</code>
            ) : (
              <span style={{ color: "var(--text-soft)" }}>РєР°СЂС‚Р° РЅРµ Р·Р°РґР°РЅР°</span>
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
    <p className={styles.sidebarLabel}>Р Р°Р·РґРµР»С‹</p>
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
   Profile вЂ” shared between Worker and Blogger
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
  onSetPayoutCard: (cardNumber: string) => void;
}) => {
  const [profileForm, setProfileForm] = useState(buildProfileForm(me));

  useEffect(() => {
    setProfileForm(buildProfileForm(me));
  }, [me]);

  return (
    <SectionCard
      title="РџСЂРѕС„РёР»СЊ Рё СЂРµРєРІРёР·РёС‚С‹"
      lead="РРјСЏ СЂРµРґР°РєС‚РёСЂСѓРµС‚Рµ РІС‹, РЅРёРєРЅРµР№Рј Рё Telegram СѓРїСЂР°РІР»СЏСЋС‚СЃСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј. РљР°СЂС‚Р° РґР»СЏ РІС‹РїР»Р°С‚ С…СЂР°РЅРёС‚СЃСЏ РІ РІРёРґРµ С…РµС€Р° вЂ” РјС‹ РІРёРґРёРј С‚РѕР»СЊРєРѕ РїРѕСЃР»РµРґРЅРёРµ 4 С†РёС„СЂС‹."
    >
      <div className={styles.profileGrid}>
        <div className={styles.profileBlock}>
          <p className={styles.profileBlockTitle}>РљРѕРЅС‚Р°РєС‚С‹</p>
          <TwoColumn>
            <Field label="РРјСЏ">
              <TextInput
                value={profileForm.name}
                onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                placeholder="РљР°Рє РІР°СЃ РЅР°Р·С‹РІР°С‚СЊ"
              />
            </Field>
            {me.nickname ? (
              <Field label="РќРёРєРЅРµР№Рј">
                <TextInput value={me.nickname} readOnly disabled />
              </Field>
            ) : (
              <Field label="Telegram">
                <TextInput value={me.telegram || "вЂ”"} readOnly disabled />
              </Field>
            )}
          </TwoColumn>
          {me.nickname ? (
            <Field label="Telegram">
              <TextInput value={me.telegram || "вЂ”"} readOnly disabled />
            </Field>
          ) : null}

          <div className={styles.actionRow}>
            <Button onClick={() => onSave(profileForm)} disabled={mutationPending}>
              {mutationPending ? "РЎРѕС…СЂР°РЅСЏРµРјвЂ¦" : "РЎРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ"}
            </Button>
          </div>
        </div>

        <div className={styles.profileBlock}>
          <p className={styles.profileBlockTitle}>РљР°СЂС‚Р° РґР»СЏ РІС‹РїР»Р°С‚</p>
          <PayoutCardInput
            savedLast4={me.payout_card_last4 ?? null}
            pending={mutationPending}
            onSubmit={(rawDigits) => onSetPayoutCard(rawDigits)}
          />
        </div>
      </div>
    </SectionCard>
  );
};

/* =========================================================
   Worker cabinet
   ========================================================= */

type WorkerTab = "overview" | "deals" | "create" | "scripts" | "finance" | "profile";

const WorkerCabinet = ({ me }: { me: UserMeRead }) => {
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();
  const [tab, setTab] = useState<WorkerTab>("overview");
  const [toast, setToast] = useState<Toast>(null);
  const [dealForm, setDealForm] = useState({
    shop_link: "",
    item_name: "",
    seller_tg: "",
    seller_number: "",
    price: "",
    bloger_id: me.linked_to || "",
  });
  const [statusFilter, setStatusFilter] = useState<DealStatus | "ALL">("ALL");
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<LedgerEntryStatus | "ALL">("ALL");
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [payoutForm, setPayoutForm] = useState({ amount_rub: "" });
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const statsQuery = useQuery({ queryKey: ["me", "stats"], queryFn: api.getMeStats });
  const dealsQuery = useQuery({ queryKey: ["me", "deals"], queryFn: api.getMyDeals });
  const bloggersQuery = useQuery({ queryKey: ["me", "bloggers"], queryFn: api.getAvailableBloggers });
  const scriptsQuery = useQuery({ queryKey: ["me", "scripts"], queryFn: api.getWorkerScripts });
  const ledgerQuery = useQuery({ queryKey: ["me", "ledger"], queryFn: () => api.getLedger() });
  const payoutWidgetQuery = useQuery({ queryKey: ["me", "payout-widget"], queryFn: api.getPayoutWidgetConfig });

  useEffect(() => {
    if (!dealForm.bloger_id && bloggersQuery.data && bloggersQuery.data.length > 0) {
      setDealForm((prev) => ({ ...prev, bloger_id: me.linked_to || bloggersQuery.data![0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloggersQuery.data, me.linked_to]);

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
      setToast({ tone: "success", text: "РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const payoutCardMutation = useMutation({
    mutationFn: (cardNumber: string) => api.setPayoutCard(cardNumber),
    onSuccess: () => {
      setToast({ tone: "success", text: "РљР°СЂС‚Р° РґР»СЏ РІС‹РїР»Р°С‚ РѕР±РЅРѕРІР»РµРЅР°." });
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
      setToast({ tone: "success", text: "Р—Р°РїСЂРѕСЃ РЅР° РІС‹РїР»Р°С‚Сѓ РѕС‚РїСЂР°РІР»РµРЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ." });
      setPayoutForm({ amount_rub: "" });
      setPayoutError(null);
      queryClient.invalidateQueries({ queryKey: ["me", "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setPayoutError(error.message),
  });

  const dealMutation = useMutation({
    mutationFn: () =>
      api.createDeal({
        shop_link: dealForm.shop_link,
        item_name: dealForm.item_name,
        seller_tg: dealForm.seller_tg,
        seller_number: dealForm.seller_number,
        price: Math.round(Number(dealForm.price) * 100),
        bloger_id: dealForm.bloger_id,
      }),
    onSuccess: () => {
      setToast({ tone: "success", text: "РЎРґРµР»РєР° СЃРѕР·РґР°РЅР° Рё РѕС‚РїСЂР°РІР»РµРЅР° Р±Р»РѕРіРµСЂСѓ." });
      setDealForm({
        shop_link: "",
        item_name: "",
        seller_tg: "",
        seller_number: "",
        price: "",
        bloger_id: me.linked_to || dealForm.bloger_id,
      });
      queryClient.invalidateQueries({ queryKey: ["me", "deals"] });
      queryClient.invalidateQueries({ queryKey: ["me", "stats"] });
      setTab("deals");
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const deals = dealsQuery.data?.deals || [];
  const filteredDeals = useMemo(
    () => (statusFilter === "ALL" ? deals : deals.filter((d) => d.status === statusFilter)),
    [deals, statusFilter],
  );
  const ledger = ledgerQuery.data?.items || [];
  const filteredLedger = useMemo(
    () => (ledgerStatusFilter === "ALL" ? ledger : ledger.filter((entry) => entry.status === ledgerStatusFilter)),
    [ledger, ledgerStatusFilter],
  );
  const tabs: TabDef[] = [
    { id: "overview", label: "РћР±Р·РѕСЂ", iconPath: ICONS.overview },
    { id: "deals", label: "РЎРґРµР»РєРё", iconPath: ICONS.deals, badge: deals.length || null },
    { id: "create", label: "РќРѕРІР°СЏ СЃРґРµР»РєР°", iconPath: ICONS.referral },
    { id: "scripts", label: "РЎРєСЂРёРїС‚С‹", iconPath: ICONS.scripts, badge: scriptsQuery.data?.length || null },
    { id: "finance", label: "Р¤РёРЅР°РЅСЃС‹", iconPath: ICONS.finance },
    { id: "profile", label: "РџСЂРѕС„РёР»СЊ", iconPath: ICONS.profile },
  ];

  const linkedBlogger = bloggersQuery.data?.find((b) => b.id === me.linked_to);

  return (
    <>
      <IdentityHeader me={me} />

      <div className={styles.balanceTiles}>
        <div className={`${styles.balanceTile} ${styles.accent}`}>
          <p className={styles.balanceTileLabel}>Р”РѕСЃС‚СѓРїРЅРѕ Рє РІС‹РІРѕРґСѓ</p>
          <p className={styles.balanceTileValue}>{formatMoney(me.balance)}</p>
          <p className={styles.balanceTileNote}>Р—Р°РїСЂРѕСЃРёС‚Рµ РІС‹РїР»Р°С‚Сѓ РІ СЂР°Р·РґРµР»Рµ В«Р¤РёРЅР°РЅСЃС‹В».</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>Р’ РѕР±СЂР°Р±РѕС‚РєРµ</p>
          <p className={styles.balanceTileValue}>{formatMoney(me.balance_pending_confirmation_kopeks)}</p>
          <p className={styles.balanceTileNote}>РЎСЂРµРґСЃС‚РІР°, РѕР¶РёРґР°СЋС‰РёРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ.</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>Р’Р°С€Р° СЃС‚Р°РІРєР°</p>
          <p className={styles.balanceTileValue}>{me.percent}%</p>
          <p className={styles.balanceTileNote}>Р”РѕР»СЏ РѕС‚ РєР°Р¶РґРѕР№ СЃРґРµР»РєРё.</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>РџСЂРёРІСЏР·РєР°</p>
          <p className={styles.balanceTileValue} style={{ fontSize: "1.05rem", lineHeight: 1.3 }}>
            {linkedBlogger ? linkedBlogger.name : me.linked_to ? "РђРєС‚РёРІРЅР°" : "РЎРІРѕР±РѕРґРЅС‹Р№"}
          </p>
          <p className={styles.balanceTileNote}>
            {me.linked_to ? "РЎРґРµР»РєРё РёРґСѓС‚ РІР°С€РµРјСѓ Р±Р»РѕРіРµСЂСѓ." : "РџРµСЂРµР№РґРёС‚Рµ РїРѕ СЂРµС„-СЃСЃС‹Р»РєРµ Р±Р»РѕРіРµСЂР°."}
          </p>
        </div>
      </div>

      {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}

      <div className={styles.shell}>
        <Sidebar
          tabs={tabs}
          active={tab}
          onSelect={(id) => setTab(id as WorkerTab)}
          helpText="РЎРѕР·РґР°РІР°Р№С‚Рµ СЃРґРµР»РєРё, РєРѕРїРёСЂСѓР№С‚Рµ СЃРєСЂРёРїС‚С‹, РѕС‚СЃР»РµР¶РёРІР°Р№С‚Рµ РІС‹РїР»Р°С‚С‹."
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

          {tab === "create" ? (
            <SectionCard
              title="РќРѕРІР°СЏ СЃРґРµР»РєР°"
              lead="Р—Р°РїРѕР»РЅРёС‚Рµ РґР°РЅРЅС‹Рµ РїСЂРѕРґР°РІС†Р°, РІС‹Р±РµСЂРёС‚Рµ Р±Р»РѕРіРµСЂР° вЂ” Р·Р°СЏРІРєР° СѓР№РґС‘С‚ РµРјСѓ РЅР° РїСЂРёРЅСЏС‚РёРµ."
            >
              <Stack>
                <TwoColumn>
                  <Field label="РЎСЃС‹Р»РєР° РЅР° РјР°РіР°Р·РёРЅ">
                    <TextInput
                      value={dealForm.shop_link}
                      onChange={(event) => setDealForm({ ...dealForm, shop_link: event.target.value })}
                      placeholder="https://www.wildberries.ru/seller/..."
                    />
                  </Field>
                  <Field label="РќР°Р·РІР°РЅРёРµ С‚РѕРІР°СЂР°">
                    <TextInput
                      value={dealForm.item_name}
                      onChange={(event) => setDealForm({ ...dealForm, item_name: event.target.value })}
                      placeholder="РљСЂРѕСЃСЃРѕРІРєРё РјРѕРґРµР»СЊ X"
                    />
                  </Field>
                </TwoColumn>
                <TwoColumn>
                  <Field label="Telegram РїСЂРѕРґР°РІС†Р°">
                    <TextInput
                      value={dealForm.seller_tg}
                      onChange={(event) => setDealForm({ ...dealForm, seller_tg: event.target.value })}
                      placeholder="@seller"
                    />
                  </Field>
                  <Field label="РўРµР»РµС„РѕРЅ РїСЂРѕРґР°РІС†Р°">
                    <TextInput
                      value={dealForm.seller_number}
                      onChange={(event) => setDealForm({ ...dealForm, seller_number: event.target.value })}
                      placeholder="+7 999 000-00-00"
                    />
                  </Field>
                </TwoColumn>
                <TwoColumn>
                  <Field label="Р¦РµРЅР° РёРЅС‚РµРіСЂР°С†РёРё, в‚Ѕ">
                    <TextInput
                      inputMode="decimal"
                      value={dealForm.price}
                      onChange={(event) => setDealForm({ ...dealForm, price: event.target.value })}
                      placeholder="15000"
                    />
                  </Field>
                  <Field label="Р‘Р»РѕРіРµСЂ" help={me.linked_to ? "РџСЂРёРІСЏР·Р°РЅРЅС‹Р№ Р±Р»РѕРіРµСЂ РІС‹Р±СЂР°РЅ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ" : "Р’С‹Р±РµСЂРёС‚Рµ Р±Р»РѕРіРµСЂР° РёР· СЃРїРёСЃРєР°"}>
                    <SelectInput
                      value={dealForm.bloger_id}
                      onChange={(event) => setDealForm({ ...dealForm, bloger_id: event.target.value })}
                    >
                      <option value="">Р’С‹Р±РµСЂРёС‚Рµ Р±Р»РѕРіРµСЂР°</option>
                      {(bloggersQuery.data || []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.telegram ? ` В· ${b.telegram}` : ""}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </TwoColumn>
                <div className={styles.actionRow}>
                  <Button
                    onClick={() => dealMutation.mutate()}
                    disabled={
                      dealMutation.isPending ||
                      !dealForm.shop_link.trim() ||
                      !dealForm.item_name.trim() ||
                      !dealForm.seller_tg.trim() ||
                      !dealForm.seller_number.trim() ||
                      !dealForm.bloger_id ||
                      !dealForm.price
                    }
                  >
                    {dealMutation.isPending ? "РћС‚РїСЂР°РІР»СЏРµРјвЂ¦" : "РЎРѕР·РґР°С‚СЊ СЃРґРµР»РєСѓ"}
                  </Button>
                  <Button kind="ghost" onClick={() => setTab("overview")}>РћС‚РјРµРЅР°</Button>
                </div>
              </Stack>
            </SectionCard>
          ) : null}

          {tab === "deals" ? (
            <SectionCard
              title="РњРѕРё СЃРґРµР»РєРё"
              lead="РџРѕР»РЅР°СЏ РёСЃС‚РѕСЂРёСЏ Р·Р°СЏРІРѕРє. РЎС‚Р°С‚СѓСЃС‹ РѕР±РЅРѕРІР»СЏСЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё."
              actions={<Button onClick={() => setTab("create")}>+ РќРѕРІР°СЏ СЃРґРµР»РєР°</Button>}
            >
              <div className={styles.toolbarRow}>
                <div className={styles.toolbarFilters}>
                  <SelectInput
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as DealStatus | "ALL")}
                  >
                    <option value="ALL">Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹ ({deals.length})</option>
                    <option value="NEW">РќРѕРІС‹Рµ</option>
                    <option value="REVIEW">РќР° РїСЂРѕРІРµСЂРєРµ</option>
                    <option value="CONFIRMED">РџРѕРґС‚РІРµСЂР¶РґРµРЅС‹</option>
                    <option value="PAID">РћРїР»Р°С‡РµРЅС‹</option>
                    <option value="COMPLETED">Р’С‹РїРѕР»РЅРµРЅС‹</option>
                    <option value="REJECTED">РћС‚РєР»РѕРЅРµРЅС‹</option>
                  </SelectInput>
                </div>
              </div>
              {dealsQuery.isLoading ? (
                <SkeletonTable rows={5} />
              ) : filteredDeals.length === 0 ? (
                <EmptyState
                  icon={<Icon d={ICONS.deals} />}
                  title={statusFilter === "ALL" ? "РЎРґРµР»РѕРє РїРѕРєР° РЅРµС‚" : "РќРµС‚ СЃРґРµР»РѕРє РІ СЌС‚РѕРј СЃС‚Р°С‚СѓСЃРµ"}
                  text={statusFilter === "ALL" ? "РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІСѓСЋ Р·Р°СЏРІРєСѓ вЂ” РєРЅРѕРїРєР° СЃРїСЂР°РІР° СЃРІРµСЂС…Сѓ." : "РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРјРµРЅРёС‚СЊ С„РёР»СЊС‚СЂ."}
                  action={statusFilter === "ALL" ? <Button onClick={() => setTab("create")}>РЎРѕР·РґР°С‚СЊ СЃРґРµР»РєСѓ</Button> : null}
                />
              ) : (
                <>
                  <ul className={styles.dealsMobileList}>
                    {filteredDeals.map((deal) => (
                      <DealMobileCard
                        key={`m-${deal.id}`}
                        deal={deal}
                        onOpen={() => setActiveDealId(deal.id)}
                      />
                    ))}
                  </ul>
                  <div className={styles.dealsDesktopTable}>
                    <TableWrap>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>РўРѕРІР°СЂ</th>
                            <th>РЎС‚Р°С‚СѓСЃ</th>
                            <th>Р¦РµРЅР°</th>
                            <th>РљРѕРЅС‚Р°РєС‚</th>
                            <th>РЎРѕР·РґР°РЅРѕ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDeals.map((deal) => (
                            <tr
                              key={deal.id}
                              className={styles.dealRowClickable}
                              tabIndex={0}
                              role="button"
                              aria-label={`РћС‚РєСЂС‹С‚СЊ СЃРґРµР»РєСѓ ${deal.item_name}`}
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
                              <td>{formatMoney(deal.effective_price_kopeks || deal.price)}</td>
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

          {tab === "scripts" ? (
            <SectionCard
              title="РЎРєСЂРёРїС‚С‹ СЃРѕРѕР±С‰РµРЅРёР№"
              lead="Р“РѕС‚РѕРІС‹Рµ С€Р°Р±Р»РѕРЅС‹ РґР»СЏ РїРµСЂРµРїРёСЃРєРё. РќР°Р¶РјРёС‚Рµ В«РЎРєРѕРїРёСЂРѕРІР°С‚СЊВ» вЂ” С‚РµРєСЃС‚ СѓР№РґС‘С‚ РІ Р±СѓС„РµСЂ."
            >
              {scriptsQuery.isLoading ? (
                <SkeletonTable rows={3} />
              ) : !scriptsQuery.data || scriptsQuery.data.length === 0 ? (
                <EmptyState
                  icon={<Icon d={ICONS.scripts} />}
                  title="РЎРєСЂРёРїС‚РѕРІ РїРѕРєР° РЅРµС‚"
                  text="РЎРєСЂРёРїС‚С‹ РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ, РєРѕРіРґР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РёС… РґРѕР±Р°РІРёС‚."
                />
              ) : (
                <div className={styles.scriptGrid}>
                  {scriptsQuery.data.map((script) => (
                    <article className={styles.scriptCard} key={script.id}>
                      <h3>{script.title}</h3>
                      <p>{script.body}</p>
                      <div className={styles.scriptActions}>
                        <CopyButton
                          value={script.body}
                          kind="secondary"
                          label="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ"
                          toastText={`РЎРєСЂРёРїС‚ В«${script.title}В» СЃРєРѕРїРёСЂРѕРІР°РЅ`}
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
                title="Р—Р°РїСЂРѕСЃ РЅР° РІС‹РїР»Р°С‚Сѓ"
                lead="РЎСѓРјРјР° СѓР№РґС‘С‚ РЅР° РїСЂРёРІСЏР·Р°РЅРЅСѓСЋ РєР°СЂС‚Сѓ РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј."
              >
                <div className={styles.payoutRow}>
                  <div className={styles.payoutField}>
                    <p className={styles.payoutLabel}>Р”РѕСЃС‚СѓРїРЅРѕ Рє РІС‹РІРѕРґСѓ</p>
                    <p className={styles.payoutAvailable}>{formatMoney(me.balance)}</p>
                    {!me.payout_card_last4 ? (
                      <p className={styles.payoutHint}>
                        РџСЂРёРІСЏР¶РёС‚Рµ РєР°СЂС‚Сѓ РІ СЂР°Р·РґРµР»Рµ В«РџСЂРѕС„РёР»СЊВ», РёРЅР°С‡Рµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РЅРµ СЃРјРѕР¶РµС‚ РїСЂРѕРІРµСЃС‚Рё РїРµСЂРµРІРѕРґ.
                      </p>
                    ) : (
                      <p className={styles.payoutHint}>РљР°СЂС‚Р°: вЂўвЂўвЂўвЂў {me.payout_card_last4}</p>
                    )}
                  </div>
                  <Field
                    label="РЎСѓРјРјР°, в‚Ѕ"
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
                      Р’СЃС‘
                    </Button>
                    <Button
                      onClick={() => {
                        const amountKopeks = Math.round(
                          Number(payoutForm.amount_rub.replace(",", ".")) * 100,
                        );
                        if (!Number.isFinite(amountKopeks) || amountKopeks <= 0) {
                          setPayoutError("Р’РІРµРґРёС‚Рµ РїРѕР»РѕР¶РёС‚РµР»СЊРЅСѓСЋ СЃСѓРјРјСѓ.");
                          return;
                        }
                        if (amountKopeks > me.balance) {
                          setPayoutError("РЎСѓРјРјР° Р±РѕР»СЊС€Рµ РґРѕСЃС‚СѓРїРЅРѕРіРѕ Р±Р°Р»Р°РЅСЃР°.");
                          return;
                        }
                        if (!me.payout_card_last4) {
                          setPayoutError("РЎРЅР°С‡Р°Р»Р° РїСЂРёРІСЏР¶РёС‚Рµ РєР°СЂС‚Сѓ РІ СЂР°Р·РґРµР»Рµ В«РџСЂРѕС„РёР»СЊВ».");
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
                      {payoutRequestMutation.isPending ? "РћС‚РїСЂР°РІР»СЏРµРјвЂ¦" : "Р—Р°РїСЂРѕСЃРёС‚СЊ РІС‹РїР»Р°С‚Сѓ"}
                    </Button>
                  </div>
                </div>
                {payoutWidgetQuery.data?.enabled ? (
                  <Message tone="default">
                    Р”РѕСЃС‚СѓРїРЅР° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєР°СЏ РІС‹РїР»Р°С‚Р° С‡РµСЂРµР· РІРёРґР¶РµС‚ Р®Kassa. РЎРєРѕСЂРѕ РїРѕСЏРІРёС‚СЃСЏ РїСЂСЏРјРѕ Р·РґРµСЃСЊ.
                  </Message>
                ) : null}
              </SectionCard>

              <SectionCard
                title="Р¤РёРЅР°РЅСЃС‹"
                lead="РСЃС‚РѕСЂРёСЏ РЅР°С‡РёСЃР»РµРЅРёР№, Р·Р°РјРѕСЂРѕР·РѕРє Рё РІС‹РїР»Р°С‚."
              >
                <div className={styles.toolbarRow}>
                  <div className={styles.toolbarFilters}>
                    <SelectInput
                      value={ledgerStatusFilter}
                      onChange={(event) => setLedgerStatusFilter(event.target.value as LedgerEntryStatus | "ALL")}
                    >
                      <option value="ALL">Р’СЃРµ РѕРїРµСЂР°С†РёРё ({ledger.length})</option>
                      <option value="payout_request">Р—Р°РїСЂРѕСЃС‹ РІС‹РїР»Р°С‚</option>
                      <option value="freeze">Р—Р°РјРѕСЂРѕР·РєРё</option>
                      <option value="pending_confirmation">РћР¶РёРґР°СЋС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ</option>
                      <option value="completed">Р—Р°РІРµСЂС€С‘РЅРЅС‹Рµ</option>
                      <option value="rejected">РћС‚РєР»РѕРЅС‘РЅРЅС‹Рµ</option>
                    </SelectInput>
                  </div>
                </div>
                {ledgerQuery.isLoading ? (
                  <SkeletonTable rows={4} />
                ) : filteredLedger.length === 0 ? (
                  <EmptyState
                    icon={<Icon d={ICONS.finance} />}
                    title="РСЃС‚РѕСЂРёСЏ РїСѓСЃС‚Р°"
                    text="Р—РґРµСЃСЊ РїРѕСЏРІСЏС‚СЃСЏ РІР°С€Рё РЅР°С‡РёСЃР»РµРЅРёСЏ Рё РІС‹РїР»Р°С‚С‹."
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
              onSetPayoutCard={(card) => payoutCardMutation.mutate(card)}
            />
          ) : null}
        </div>
      </div>

      {activeDealId
        ? (() => {
            const activeDeal = deals.find((d) => d.id === activeDealId);
            if (!activeDeal) return null;
            return (
              <DealDetailsModal
                deal={activeDeal}
                onClose={() => setActiveDealId(null)}
                editable={activeDeal.status === "NEW"}
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

/* =========================================================
   Ledger table вЂ” used by both worker and blogger
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
              {entry.amount_kopeks < 0 ? "в€’" : "+"}
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
              <th>Р”Р°С‚Р°</th>
              <th>РЎСѓРјРјР°</th>
              <th>РЎС‚Р°С‚СѓСЃ</th>
              <th>Р—Р°РјРµС‚РєР°</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr
                key={entry.id}
                className={onSelect ? styles.dealRowClickable : undefined}
                tabIndex={onSelect ? 0 : undefined}
                role={onSelect ? "button" : undefined}
                aria-label={onSelect ? "РћС‚РєСЂС‹С‚СЊ РѕРїРµСЂР°С†РёСЋ" : undefined}
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
                  {entry.amount_kopeks < 0 ? "в€’" : "+"}
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
                  <td style={{ color: entry.note ? "var(--text)" : "var(--text-soft)" }}>{entry.note || "вЂ”"}</td>
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
   Ledger details modal вЂ” opens on row/card click in finance.
   ========================================================= */

const LEDGER_SUPPORT_HANDLE = "looneymoonhelper";

const ledgerStatusSummary = (status: LedgerEntryStatus): string => {
  switch (status) {
    case "completed":
      return "РћРїРµСЂР°С†РёСЏ Р·Р°РІРµСЂС€РµРЅР°. Р”РµРЅСЊРіРё СѓР¶Рµ СѓС‡С‚РµРЅС‹ РІ Р±Р°Р»Р°РЅСЃРµ.";
    case "payout_request":
      return "Р—Р°РїСЂРѕСЃ РЅР° РІС‹РїР»Р°С‚Сѓ РїСЂРёРЅСЏС‚, Р¶РґС‘С‚ РѕР±СЂР°Р±РѕС‚РєРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј.";
    case "freeze":
      return "РЎСѓРјРјР° Р·Р°РјРѕСЂРѕР¶РµРЅР° РїРѕ СЃРґРµР»РєРµ. РЎРЅРёРјРµС‚СЃСЏ РїСЂРё РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРё РёР»Рё РѕС‚РєР»РѕРЅРµРЅРёРё.";
    case "pending_confirmation":
      return "Р’С‹РїР»Р°С‚Р° РѕС‚РїСЂР°РІР»РµРЅР° Рё Р¶РґС‘С‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ Р±Р°РЅРєР°/РїСЂРѕРІР°Р№РґРµСЂР°.";
    case "rejected":
      return "РћРїРµСЂР°С†РёСЏ РѕС‚РєР»РѕРЅРµРЅР°. Р”РµРЅСЊРіРё РѕСЃС‚Р°Р»РёСЃСЊ РЅР° Р±Р°Р»Р°РЅСЃРµ.";
    default:
      return "РЎС‚Р°С‚СѓСЃ РЅРµРёР·РІРµСЃС‚РµРЅ.";
  }
};

const LedgerDetailsModal = ({
  entry,
  onClose,
}: {
  entry: LedgerEntryRead;
  onClose: () => void;
}) => {
  // Esc вЂ” Р·Р°РєСЂС‹С‚СЊ, body scroll вЂ” Р·Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ.
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
    `Р—РґСЂР°РІСЃС‚РІСѓР№С‚Рµ! Р’РѕРїСЂРѕСЃ РїРѕ РѕРїРµСЂР°С†РёРё ${entry.id} (${formatLedgerStatus(entry.status)}).`,
  )}`;

  return (
    <div className={styles.dealModalBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dealModalCard} onClick={(event) => event.stopPropagation()}>
        <header className={styles.dealModalHeader}>
          <div className={styles.dealModalHeaderTop}>
            <div className={styles.dealModalIdent}>
              <p className={styles.dealModalEyebrow}>Р¤РёРЅР°РЅСЃРѕРІР°СЏ РѕРїРµСЂР°С†РёСЏ</p>
              <h2 className={styles.dealModalTitle}>
                <span
                  className={styles.ledgerMobileAmount}
                  data-negative={isNegative ? "true" : undefined}
                >
                  {isNegative ? "в€’" : "+"}
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
                title={`РџРѕРґРґРµСЂР¶РєР° @${LEDGER_SUPPORT_HANDLE}`}
                aria-label="РЎРІСЏР·Р°С‚СЊСЃСЏ СЃ РїРѕРґРґРµСЂР¶РєРѕР№"
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
                title="Р—Р°РєСЂС‹С‚СЊ (Esc)"
                aria-label="Р—Р°РєСЂС‹С‚СЊ"
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
              label={`ID: ${entry.id.slice(0, 8)}вЂ¦`}
              toastText="ID РѕРїРµСЂР°С†РёРё СЃРєРѕРїРёСЂРѕРІР°РЅ"
            />
          </div>
        </header>

        <div className={styles.dealModalBody}>
          <div className={styles.dealModalSection}>
            <p className={styles.dealModalLead}>{ledgerStatusSummary(entry.status)}</p>

            <dl className={styles.dealMetaGrid}>
              <div>
                <dt>РўРёРї</dt>
                <dd>{isNegative ? "РЎРїРёСЃР°РЅРёРµ / РІС‹РїР»Р°С‚Р°" : "РќР°С‡РёСЃР»РµРЅРёРµ"}</dd>
              </div>
              <div>
                <dt>РЎРѕР·РґР°РЅРѕ</dt>
                <dd>{formatDateTime(entry.created_at)}</dd>
              </div>
              <div>
                <dt>РћР±РЅРѕРІР»РµРЅРѕ</dt>
                <dd>{formatDateTime(entry.updated_at)}</dd>
              </div>
              <div>
                <dt>РЎРІСЏР·Р°РЅРЅР°СЏ СЃРґРµР»РєР°</dt>
                <dd>{entry.deal_id ? `${entry.deal_id.slice(0, 8)}вЂ¦` : "вЂ”"}</dd>
              </div>
              {entry.yookassa_payout_id ? (
                <div>
                  <dt>Р®Kassa payout</dt>
                  <dd>{entry.yookassa_payout_id}</dd>
                </div>
              ) : null}
              {entry.idempotency_key ? (
                <div>
                  <dt>Idempotency</dt>
                  <dd title={entry.idempotency_key}>{entry.idempotency_key.slice(0, 24)}вЂ¦</dd>
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
                <p className={styles.dealModalEyebrow}>Р—Р°РјРµС‚РєР°</p>
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
              label="ID СЃРґРµР»РєРё"
              toastText="ID СЃРґРµР»РєРё СЃРєРѕРїРёСЂРѕРІР°РЅ"
            />
          ) : null}
          <Button kind="secondary" onClick={onClose}>Р—Р°РєСЂС‹С‚СЊ</Button>
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
      setToast({ tone: "success", text: "РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const payoutCardMutation = useMutation({
    mutationFn: (cardNumber: string) => api.setPayoutCard(cardNumber),
    onSuccess: () => {
      setToast({ tone: "success", text: "РљР°СЂС‚Р° РґР»СЏ РІС‹РїР»Р°С‚ РѕР±РЅРѕРІР»РµРЅР°." });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => setToast({ tone: "error", text: error.message }),
  });

  const acceptDealMutation = useMutation({
    mutationFn: (dealId: string) => api.acceptDeal(dealId),
    onSuccess: () => {
      setToast({ tone: "success", text: "Р—Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р° Рё РѕС‚РїСЂР°РІР»РµРЅР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ." });
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
      setToast({ tone: "success", text: "Р—Р°РїСЂРѕСЃ РЅР° РІС‹РїР»Р°С‚Сѓ РѕС‚РїСЂР°РІР»РµРЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ." });
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
    { id: "overview", label: "РћР±Р·РѕСЂ", iconPath: ICONS.overview },
    { id: "deals", label: "Р—Р°СЏРІРєРё", iconPath: ICONS.inbox, badge: newDealsCount || null },
    { id: "referral", label: "Р РµС„РµСЂР°Р»", iconPath: ICONS.referral },
    { id: "finance", label: "Р¤РёРЅР°РЅСЃС‹", iconPath: ICONS.finance },
    { id: "profile", label: "РџСЂРѕС„РёР»СЊ", iconPath: ICONS.profile },
  ];

  return (
    <>
      <IdentityHeader me={me} />

      <div className={styles.balanceTiles}>
        <div className={`${styles.balanceTile} ${styles.accent}`}>
          <p className={styles.balanceTileLabel}>Р”РѕСЃС‚СѓРїРЅРѕ Рє РІС‹РІРѕРґСѓ</p>
          <p className={styles.balanceTileValue}>{formatMoney(me.balance)}</p>
          <p className={styles.balanceTileNote}>Р—Р°РїСЂРѕСЃРёС‚Рµ РІС‹РїР»Р°С‚Сѓ РІ СЂР°Р·РґРµР»Рµ В«Р¤РёРЅР°РЅСЃС‹В».</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>Р’ РѕР±СЂР°Р±РѕС‚РєРµ</p>
          <p className={styles.balanceTileValue}>{formatMoney(me.balance_pending_confirmation_kopeks)}</p>
          <p className={styles.balanceTileNote}>РџРѕРґС‚РІРµСЂР¶РґР°РµС‚СЃСЏ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј.</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>Р’Р°С€Р° СЃС‚Р°РІРєР°</p>
          <p className={styles.balanceTileValue}>{me.percent}%</p>
          <p className={styles.balanceTileNote}>Р”РѕР»СЏ РѕС‚ РєР°Р¶РґРѕР№ СЃРґРµР»РєРё.</p>
        </div>
        <div className={styles.balanceTile}>
          <p className={styles.balanceTileLabel}>РќРѕРІС‹Рµ Р·Р°СЏРІРєРё</p>
          <p className={styles.balanceTileValue}>{formatNumber(newDealsCount)}</p>
          <p className={styles.balanceTileNote}>
            {newDealsCount > 0 ? "РўСЂРµР±СѓСЋС‚ РІР°С€РµРіРѕ РїСЂРёРЅСЏС‚РёСЏ." : "Р’СЃРµ Р·Р°СЏРІРєРё СЂР°Р·РѕР±СЂР°РЅС‹."}
          </p>
        </div>
      </div>

      {toast ? <Message tone={toast.tone === "info" ? "default" : toast.tone}>{toast.text}</Message> : null}

      <div className={styles.shell}>
        <Sidebar
          tabs={tabs}
          active={tab}
          onSelect={(id) => setTab(id as BloggerTab)}
          helpText="РџСЂРёРЅРёРјР°Р№С‚Рµ Р·Р°СЏРІРєРё РІРѕСЂРєРµСЂРѕРІ, РґРµР»РёС‚РµСЃСЊ СЃСЃС‹Р»РєРѕР№, Р·Р°РїСЂР°С€РёРІР°Р№С‚Рµ РІС‹РїР»Р°С‚С‹."
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
              title="Р—Р°СЏРІРєРё РІРѕСЂРєРµСЂРѕРІ"
              lead="РќРѕРІС‹Рµ Р·Р°СЏРІРєРё РЅСѓР¶РЅРѕ РїСЂРёРЅСЏС‚СЊ. РџРѕСЃР»Рµ РїСЂРѕРІРµСЂРєРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј РѕС‚РєСЂРѕСЋС‚СЃСЏ РєРѕРЅС‚Р°РєС‚С‹ Рё СЃСѓРјРјР°."
            >
              <div className={styles.toolbarRow}>
                <div className={styles.toolbarFilters}>
                  <SelectInput
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as DealStatus | "ALL")}
                  >
                    <option value="ALL">Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹ ({deals.length})</option>
                    <option value="NEW">РќРѕРІС‹Рµ ({newDealsCount})</option>
                    <option value="REVIEW">РќР° РїСЂРѕРІРµСЂРєРµ</option>
                    <option value="CONFIRMED">РџРѕРґС‚РІРµСЂР¶РґРµРЅС‹</option>
                    <option value="PAID">РћРїР»Р°С‡РµРЅС‹</option>
                    <option value="COMPLETED">Р’С‹РїРѕР»РЅРµРЅС‹</option>
                    <option value="REJECTED">РћС‚РєР»РѕРЅРµРЅС‹</option>
                  </SelectInput>
                </div>
              </div>
              {dealsQuery.isLoading ? (
                <SkeletonTable rows={5} />
              ) : filteredDeals.length === 0 ? (
                <EmptyState
                  icon={<Icon d={ICONS.inbox} />}
                  title={statusFilter === "ALL" ? "Р—Р°СЏРІРѕРє РїРѕРєР° РЅРµС‚" : "РќРµС‚ Р·Р°СЏРІРѕРє РІ СЌС‚РѕРј СЃС‚Р°С‚СѓСЃРµ"}
                  text={statusFilter === "ALL" ? "РџРѕРґРµР»РёС‚РµСЃСЊ СЂРµС„РµСЂР°Р»СЊРЅРѕР№ СЃСЃС‹Р»РєРѕР№ СЃ РІРѕСЂРєРµСЂР°РјРё." : "РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРјРµРЅРёС‚СЊ С„РёР»СЊС‚СЂ."}
                  action={statusFilter === "ALL" ? <Button onClick={() => setTab("referral")}>Рљ СЂРµС„РµСЂР°Р»СЊРЅРѕР№ СЃСЃС‹Р»РєРµ</Button> : null}
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
                              РџСЂРёРЅСЏС‚СЊ
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
                            <th>РўРѕРІР°СЂ</th>
                            <th>РЎС‚Р°С‚СѓСЃ</th>
                            <th>Р¦РµРЅР°</th>
                            <th>РљРѕРЅС‚Р°РєС‚</th>
                            <th>РЎРѕР·РґР°РЅРѕ</th>
                            <th>Р”РµР№СЃС‚РІРёРµ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDeals.map((deal) => (
                            <tr
                              key={deal.id}
                              className={styles.dealRowClickable}
                              tabIndex={0}
                              role="button"
                              aria-label={`РћС‚РєСЂС‹С‚СЊ СЃРґРµР»РєСѓ ${deal.item_name}`}
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
                                    РџСЂРёРЅСЏС‚СЊ
                                  </Button>
                                ) : (
                                  <span style={{ color: "var(--text-soft)", fontSize: "0.86rem" }}>
                                    {deal.status === "REJECTED" ? "РћС‚РєР»РѕРЅРµРЅР°" : "Р’ СЂР°Р±РѕС‚Рµ"}
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
                title="Р РµС„РµСЂР°Р»СЊРЅР°СЏ СЃСЃС‹Р»РєР°"
                lead="Р”РµР»РёС‚РµСЃСЊ СЃСЃС‹Р»РєРѕР№ вЂ” РІСЃРµ РІРѕСЂРєРµСЂС‹, РїРµСЂРµС€РµРґС€РёРµ РїРѕ РЅРµР№, Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїСЂРёРІСЏР·С‹РІР°СЋС‚СЃСЏ Рє РІР°Рј."
              >
                <div className={styles.referralCard}>
                  <img src="/images/referral-art.svg" alt="" aria-hidden="true" className={styles.referralCardArt} />
                  <p className={styles.referralLabel}>Р’Р°С€Р° СЃСЃС‹Р»РєР°</p>
                  <p className={styles.referralValue}>
                    {absolutizeUrl(me.referral_invite_url) || "РЎРіРµРЅРµСЂРёСЂСѓРµС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРІРѕР№ РЅР°СЃС‚СЂРѕР№РєРё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј"}
                  </p>
                  <div className={styles.referralActions}>
                    <CopyButton
                      value={absolutizeUrl(me.referral_invite_url)}
                      kind="primary"
                      label="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ"
                      toastText="РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР° РІ Р±СѓС„РµСЂ"
                    />
                    {me.referral_invite_url ? (
                      <Button kind="secondary" href={absolutizeUrl(me.referral_invite_url)}>
                        <Icon d={ICONS.link} /> РћС‚РєСЂС‹С‚СЊ
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="РљР°Рє СЌС‚Рѕ СЂР°Р±РѕС‚Р°РµС‚" lead="РљРѕСЂРѕС‚РєРёР№ С†РёРєР» РѕС‚ РїРµСЂРµС…РѕРґР° РІРѕСЂРєРµСЂР° РґРѕ РІС‹РїР»Р°С‚С‹.">
                <Stack>
                  <ProcessStep n="1" title="Р’РѕСЂРєРµСЂ РїРµСЂРµС…РѕРґРёС‚ РїРѕ СЃСЃС‹Р»РєРµ" text="Р РµРіРёСЃС‚СЂР°С†РёСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРІСЏР·С‹РІР°РµС‚СЃСЏ СЃ РІР°С€РёРј РїСЂРѕС„РёР»РµРј." />
                  <ProcessStep n="2" title="Р’РѕСЂРєРµСЂ СЃРѕР·РґР°С‘С‚ СЃРґРµР»РєСѓ" text="Р—Р°СЏРІРєР° СЃ РґР°РЅРЅС‹РјРё РїСЂРѕРґР°РІС†Р° СѓС…РѕРґРёС‚ РІР°Рј РІ СЂР°Р·РґРµР» В«Р—Р°СЏРІРєРёВ»." />
                  <ProcessStep n="3" title="Р’С‹ РїСЂРёРЅРёРјР°РµС‚Рµ Р·Р°СЏРІРєСѓ" text="Р—Р°СЏРІРєР° СѓС…РѕРґРёС‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ РЅР° РїСЂРѕРІРµСЂРєСѓ. РљРѕРЅС‚Р°РєС‚С‹ Рё СЃСѓРјРјР° СЃС‚Р°РЅРѕРІСЏС‚СЃСЏ РІРёРґРёРјС‹РјРё РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ." />
                  <ProcessStep n="4" title="РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ в†’ РЅР°С‡РёСЃР»РµРЅРёРµ" text="РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚ РѕРїР»Р°С‚Сѓ, СЃСЂРµРґСЃС‚РІР° РїРѕРїР°РґР°СЋС‚ РЅР° Р±Р°Р»Р°РЅСЃ." />
                </Stack>
              </SectionCard>
            </Stack>
          ) : null}

          {tab === "finance" ? (
            <Stack>
              <SectionCard
                title="Р—Р°РїСЂРѕСЃ РІС‹РїР»Р°С‚С‹"
                lead="РЈРєР°Р¶РёС‚Рµ СЃСѓРјРјСѓ РІ СЂСѓР±Р»СЏС… вЂ” Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РїРѕРґС‚РІРµСЂРґРёС‚ РІС‹РїР»Р°С‚Сѓ РІСЂСѓС‡РЅСѓСЋ."
              >
                <Stack>
                  <TwoColumn>
                    <Field label="РЎСѓРјРјР° РІС‹РїР»Р°С‚С‹, в‚Ѕ" help={`Р”РѕСЃС‚СѓРїРЅРѕ: ${formatMoney(me.balance)}`}>
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
                        {payoutRequestMutation.isPending ? "РћС‚РїСЂР°РІР»СЏРµРјвЂ¦" : "Р—Р°РїСЂРѕСЃРёС‚СЊ РІС‹РїР»Р°С‚Сѓ"}
                      </Button>
                    </div>
                  </TwoColumn>
                  {!me.payout_card_last4 ? (
                    <Message tone="default">
                      РљР°СЂС‚Р° РґР»СЏ РІС‹РїР»Р°С‚ РЅРµ РїСЂРёРІСЏР·Р°РЅР°. Р”РѕР±Р°РІСЊС‚Рµ РµС‘ РІ СЂР°Р·РґРµР»Рµ В«РџСЂРѕС„РёР»СЊВ», РёРЅР°С‡Рµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РЅРµ СЃРјРѕР¶РµС‚ РїСЂРѕРІРµСЃС‚Рё РїРµСЂРµРІРѕРґ.
                    </Message>
                  ) : null}
                  {payoutWidgetQuery.data?.enabled ? (
                    <Message tone="default">
                      Р”РѕСЃС‚СѓРїРЅР° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєР°СЏ РІС‹РїР»Р°С‚Р° С‡РµСЂРµР· РІРёРґР¶РµС‚ Р®Kassa. РЎРєРѕСЂРѕ РїРѕСЏРІРёС‚СЃСЏ РїСЂСЏРјРѕ Р·РґРµСЃСЊ.
                    </Message>
                  ) : null}
                </Stack>
              </SectionCard>

              <SectionCard title="РСЃС‚РѕСЂРёСЏ РѕРїРµСЂР°С†РёР№" lead="РќР°С‡РёСЃР»РµРЅРёСЏ, Р·Р°РјРѕСЂРѕР·РєРё, Р·Р°РїСЂРѕСЃС‹ Рё Р·Р°РІРµСЂС€С‘РЅРЅС‹Рµ РІС‹РїР»Р°С‚С‹.">
                <div className={styles.toolbarRow}>
                  <div className={styles.toolbarFilters}>
                    <SelectInput
                      value={ledgerStatusFilter}
                      onChange={(event) => setLedgerStatusFilter(event.target.value as LedgerEntryStatus | "ALL")}
                    >
                      <option value="ALL">Р’СЃРµ РѕРїРµСЂР°С†РёРё ({ledger.length})</option>
                      <option value="payout_request">Р—Р°РїСЂРѕСЃС‹ РІС‹РїР»Р°С‚</option>
                      <option value="freeze">Р—Р°РјРѕСЂРѕР·РєРё</option>
                      <option value="pending_confirmation">РћР¶РёРґР°СЋС‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ</option>
                      <option value="completed">Р—Р°РІРµСЂС€С‘РЅРЅС‹Рµ</option>
                      <option value="rejected">РћС‚РєР»РѕРЅС‘РЅРЅС‹Рµ</option>
                    </SelectInput>
                  </div>
                </div>
                {ledgerQuery.isLoading ? (
                  <SkeletonTable rows={4} />
                ) : filteredLedger.length === 0 ? (
                  <EmptyState
                    icon={<Icon d={ICONS.finance} />}
                    title="РСЃС‚РѕСЂРёСЏ РїСѓСЃС‚Р°"
                    text="Р—РґРµСЃСЊ РїРѕСЏРІСЏС‚СЃСЏ РІР°С€Рё РЅР°С‡РёСЃР»РµРЅРёСЏ Рё РІС‹РїР»Р°С‚С‹."
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
              onSetPayoutCard={(card) => payoutCardMutation.mutate(card)}
            />
          ) : null}
        </div>
      </div>

      {showCopyModal ? (
        <Modal
          title="РЎСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°"
          onClose={() => setShowCopyModal(false)}
          actions={<Button kind="secondary" onClick={() => setShowCopyModal(false)}>Р—Р°РєСЂС‹С‚СЊ</Button>}
        >
          <Message tone="success">
            Р РµС„РµСЂР°Р»СЊРЅР°СЏ СЃСЃС‹Р»РєР° СѓР¶Рµ РІ Р±СѓС„РµСЂРµ РѕР±РјРµРЅР°. РњРѕР¶РЅРѕ СЃСЂР°Р·Сѓ РѕС‚РїСЂР°РІР»СЏС‚СЊ РµС‘ СЂР°Р±РѕС‚РЅРёРєР°Рј.
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
                        label: "РџСЂРёРЅСЏС‚СЊ Р·Р°СЏРІРєСѓ",
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
        <h2>Р’РІРµРґРёС‚Рµ PIN РєР°Р±РёРЅРµС‚Р°</h2>
        <p>PIN Р·Р°РґР°С‘С‚ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ. Р‘РµР· РЅРµРіРѕ С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ РєР°Р±РёРЅРµС‚Р° Р±Р»РѕРіРµСЂР° РѕСЃС‚Р°СЋС‚СЃСЏ СЃРєСЂС‹С‚С‹РјРё.</p>
        <Field label="PIN">
          <TextInput
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="вЂўвЂўвЂўвЂў"
            autoFocus
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === "Enter" && pin.trim()) onUnlock(pin);
            }}
          />
        </Field>
        <Button onClick={() => onUnlock(pin)} disabled={isPending || !pin.trim()}>
          {isPending ? "РџСЂРѕРІРµСЂСЏРµРјвЂ¦" : "РћС‚РєСЂС‹С‚СЊ РєР°Р±РёРЅРµС‚"}
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
          <Message>Р—Р°РіСЂСѓР¶Р°РµРј РєР°Р±РёРЅРµС‚вЂ¦</Message>
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
          <Message>РџРѕРґРєР»СЋС‡Р°РµРј СЃРµСЃСЃРёСЋвЂ¦</Message>
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
    content = <Message tone="error">РќРµРёР·РІРµСЃС‚РЅР°СЏ СЂРѕР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.</Message>;
  }

  return (
    <PageSurface>
      <TopNav brandSub={meQuery.data?.role === "Bloger" ? "РєР°Р±РёРЅРµС‚ Р±Р»РѕРіРµСЂР°" : "РєР°Р±РёРЅРµС‚ РІРѕСЂРєРµСЂР°"}>
        <NavLink href="/">РќР° РіР»Р°РІРЅСѓСЋ</NavLink>
        {meQuery.data ? (
          <Button type="button" kind="ghost" onClick={() => void logout()}>
            <Icon d={ICONS.logout} /> Р’С‹Р№С‚Рё
          </Button>
        ) : null}
      </TopNav>
      {content}
    </PageSurface>
  );
}
