"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  dealStatusTone,
  formatDateTime,
  formatDealStatus,
  formatLedgerStatus,
  formatMoney,
  formatNumber,
  formatRole,
} from "@/lib/format";
import type {
  AdminUserRead,
  DealRead,
  LedgerEntryRead,
  ReportingPeriod,
  WorkerMessageScriptRead,
} from "@/lib/types";
import {
  Button,
  DataTable,
  Field,
  Message,
  Modal,
  NavLink,
  PageSurface,
  Pill,
  PillRow,
  SectionCard,
  SelectInput,
  Stack,
  StatCard,
  StatsGrid,
  StatusPill,
  TableWrap,
  TextArea,
  TextInput,
  TopNav,
  TwoColumn,
} from "@/components/common/ui";
import styles from "@/components/admin/admin.module.css";
import { PayoutCardInput } from "@/components/common/payout-card-input";

type AdminSection = "overview" | "users" | "deals" | "ledger" | "schemes" | "finance" | "scripts" | "telegram";

type AdminModalState =
  | { kind: "delete-user"; user: AdminUserRead }
  | { kind: "deal-status"; deal: DealRead; status: string; reason: string; title: string; submitLabel: string }
  | { kind: "deal-price"; deal: DealRead; agreedRub: string; reason: string }
  | { kind: "deal-recalc"; deal: DealRead; reason: string }
  | { kind: "deal-confirm-receipt"; deal: DealRead; reason: string }
  | { kind: "deal-distribute"; deal: DealRead; reason: string }
  | { kind: "deal-refund"; deal: DealRead; reason: string }
  | { kind: "ledger-status"; entry: LedgerEntryRead; status: string; note: string }
  | { kind: "payout-complete"; entry: LedgerEntryRead }
  | { kind: "delete-script"; script: WorkerMessageScriptRead }
  | { kind: "blogger-created"; nickname: string; password: string }
  | null;

const emptyUserForm = {
  name: "",
  email: "",
  telegram: "",
  nickname: "",
  percent: "0",
  role: "Worker",
  is_active: true,
  blogger_cabinet_pin: "",
};

const emptyBloggerForm = {
  nickname: "",
  name: "",
  telegram: "",
};

const emptyScriptForm = {
  title: "",
  body: "",
  sort_order: "0",
};

const sectionMeta: Record<AdminSection, { label: string; title: string; lead: string }> = {
  overview: {
    label: "Обзор",
    title: "Обзор площадки",
    lead: "Сводная статистика по пользователям, сделкам и балансам.",
  },
  users: {
    label: "Пользователи",
    title: "Пользователи",
    lead: "Воркеры и блогеры. Создание блогера выдаёт сгенерированный пароль под ник.",
  },
  deals: {
    label: "Сделки",
    title: "Сделки",
    lead: "Подтверждение, отметка об оплате, завершение и отклонение — каждое действие фиксируется в журнале.",
  },
  ledger: {
    label: "Леджер",
    title: "Леджер и выплаты",
    lead: "Все начисления и запросы на выплаты. Подтверждайте выплаты вручную.",
  },
  schemes: {
    label: "Схемы",
    title: "Финансовые схемы",
    lead: "Веса распределения долей по каждому блогеру. Превью считает суммы для конкретной интеграции.",
  },
  finance: {
    label: "Финансы платформы",
    title: "Финансы платформы",
    lead: "Сводная финансовая статистика платформы: баланс, прибыль, оборот, выплаты.",
  },
  scripts: {
    label: "Скрипты",
    title: "Скрипты для воркеров",
    lead: "Шаблоны сообщений, которые видны воркерам в кабинете.",
  },
  telegram: {
    label: "Telegram",
    title: "Подписка на Telegram-канал",
    lead: "Обязательная подписка при регистрации. Статистика подписок, управление каналом.",
  },
};

export const AdminDashboard = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, logout } = useAuth();

  const [section, setSection] = useState<AdminSection>("overview");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [selectedLedgerId, setSelectedLedgerId] = useState("");
  const [selectedSchemeId, setSelectedSchemeId] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [bloggerForm, setBloggerForm] = useState(emptyBloggerForm);
  const [scriptForm, setScriptForm] = useState(emptyScriptForm);
  const [financeForm, setFinanceForm] = useState({
    weight_worker: "2000",
    weight_bloger: "5000",
    weight_upline: "1000",
    weight_platform: "8000",
  });
  const [previewPriceRub, setPreviewPriceRub] = useState("15000");
  const [modal, setModal] = useState<AdminModalState>(null);
  const [financePeriod, setFinancePeriod] = useState<ReportingPeriod>("all");
  const [balanceAdjustForm, setBalanceAdjustForm] = useState({ amountRub: "", reason: "" });
  const [partnerCardForm, setPartnerCardForm] = useState("");
  // Реквизиты приёма: ссылку отражаем в текстовом поле (всегда отправляется),
  // карту вводим через PayoutCardInput. Признак "карту меняли" — collectionCardDraft.
  const [collectionCardBrand, setCollectionCardBrand] = useState<string | null>(null);
  const [collectionCardHolder, setCollectionCardHolder] = useState<string | null>(null);
  const [paymentLinkForm, setPaymentLinkForm] = useState("");
  const [collectionCardDraft, setCollectionCardDraft] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: isHydrated && isAuthenticated,
  });
  const overviewQuery = useQuery({ queryKey: ["admin", "overview"], queryFn: api.getAdminOverview, enabled: Boolean(isAuthenticated) });
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.getAdminUsers(), enabled: Boolean(isAuthenticated) });
  const dealsQuery = useQuery({ queryKey: ["admin", "deals"], queryFn: () => api.getAdminDeals(), enabled: Boolean(isAuthenticated) });
  const ledgerQuery = useQuery({ queryKey: ["admin", "ledger"], queryFn: () => api.getAdminLedger(), enabled: Boolean(isAuthenticated) });
  const schemesQuery = useQuery({
    queryKey: ["admin", "financeSchemes"],
    queryFn: () => api.getFinanceSchemes(),
    enabled: Boolean(isAuthenticated),
  });
  const scriptsQuery = useQuery({
    queryKey: ["admin", "workerScripts"],
    queryFn: api.getAdminWorkerScripts,
    enabled: Boolean(isAuthenticated),
  });

  // Telegram channel
  const telegramConfigQuery = useQuery({
    queryKey: ["admin", "telegramChannel"],
    queryFn: api.getAdminTelegramChannel,
    enabled: Boolean(isAuthenticated),
  });
  const telegramStatsQuery = useQuery({
    queryKey: ["admin", "telegramChannelStats"],
    queryFn: () => api.getAdminTelegramChannelStats(),
    enabled: Boolean(isAuthenticated),
  });

  const userDetailQuery = useQuery({
    queryKey: ["admin", "user", selectedUserId],
    queryFn: () => api.getAdminUser(selectedUserId),
    enabled: Boolean(selectedUserId),
  });
  const userStatsQuery = useQuery({
    queryKey: ["admin", "userStats", selectedUserId],
    queryFn: () => api.getAdminUserStats(selectedUserId),
    enabled: Boolean(selectedUserId),
  });
  const userLedgerQuery = useQuery({
    queryKey: ["admin", "userLedger", selectedUserId],
    queryFn: () => api.getAdminUserLedger(selectedUserId),
    enabled: Boolean(selectedUserId),
  });
  const dealDetailQuery = useQuery({
    queryKey: ["admin", "deal", selectedDealId],
    queryFn: () => api.getAdminDeal(selectedDealId),
    enabled: Boolean(selectedDealId),
  });
  const ledgerDetailQuery = useQuery({
    queryKey: ["admin", "ledgerEntry", selectedLedgerId],
    queryFn: () => api.getAdminLedgerEntry(selectedLedgerId),
    enabled: Boolean(selectedLedgerId),
  });
  const schemeDetailQuery = useQuery({
    queryKey: ["admin", "financeScheme", selectedSchemeId],
    queryFn: () => api.getFinanceScheme(selectedSchemeId),
    enabled: Boolean(selectedSchemeId),
  });
  const previewPriceKopeks = Math.max(0, Math.round(Number(previewPriceRub) * 100));
  const financePreviewQuery = useQuery({
    queryKey: ["admin", "financePreview", selectedSchemeId, previewPriceKopeks],
    queryFn: () => api.getFinancePreview(selectedSchemeId, previewPriceKopeks),
    enabled: Boolean(selectedSchemeId && previewPriceKopeks > 0),
  });

  const userAuditQuery = useQuery({
    queryKey: ["admin", "userAudit", selectedUserId],
    queryFn: () => api.getUserAudit(selectedUserId),
    enabled: Boolean(selectedUserId),
  });

  const financeDashboardQuery = useQuery({
    queryKey: ["admin", "financeDashboard", financePeriod],
    queryFn: () => api.getPlatformFinanceDashboard(financePeriod),
    enabled: Boolean(isAuthenticated) && section === "finance",
  });

  const paymentDetailsQuery = useQuery({
    queryKey: ["admin", "paymentDetails"],
    queryFn: api.getAdminPaymentDetails,
    enabled: Boolean(isAuthenticated) && section === "finance",
  });

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/admin/login");
    }
  }, [isAuthenticated, isHydrated, router]);

  useEffect(() => {
    // Tech-админ имеет те же права, что и владелец-Admin, кроме управления
    // административными аккаунтами (см. owner-gating ниже).
    if (meQuery.data && meQuery.data.role !== "Admin" && meQuery.data.role !== "Tech_Admin") {
      router.replace("/cabinet");
    }
  }, [meQuery.data, router]);

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.items.length) {
      setSelectedUserId(usersQuery.data.items[0].id);
    }
  }, [selectedUserId, usersQuery.data]);

  useEffect(() => {
    if (!selectedDealId && dealsQuery.data?.length) {
      setSelectedDealId(dealsQuery.data[0].id);
    }
  }, [dealsQuery.data, selectedDealId]);

  useEffect(() => {
    if (!selectedLedgerId && ledgerQuery.data?.items.length) {
      setSelectedLedgerId(ledgerQuery.data.items[0].id);
    }
  }, [ledgerQuery.data, selectedLedgerId]);

  useEffect(() => {
    if (!selectedSchemeId && schemesQuery.data?.items.length) {
      setSelectedSchemeId(schemesQuery.data.items[0].blogger_id);
    }
  }, [schemesQuery.data, selectedSchemeId]);

  useEffect(() => {
    if (!selectedScriptId && scriptsQuery.data?.length) {
      setSelectedScriptId(scriptsQuery.data[0].id);
    }
  }, [scriptsQuery.data, selectedScriptId]);

  useEffect(() => {
    if (userDetailQuery.data) {
      setUserForm({
        name: userDetailQuery.data.name,
        email: userDetailQuery.data.email,
        telegram: userDetailQuery.data.telegram || "",
        nickname: userDetailQuery.data.nickname || "",
        percent: String(userDetailQuery.data.percent),
        role: userDetailQuery.data.role,
        is_active: userDetailQuery.data.is_active,
        blogger_cabinet_pin: "",
      });
    }
  }, [userDetailQuery.data]);

  useEffect(() => {
    // Сбрасываем формы корректировки баланса и карты партнёра при смене пользователя.
    setBalanceAdjustForm({ amountRub: "", reason: "" });
    setPartnerCardForm("");
  }, [selectedUserId]);

  useEffect(() => {
    const activeScript = scriptsQuery.data?.find((item) => item.id === selectedScriptId);
    if (activeScript) {
      setScriptForm({
        title: activeScript.title,
        body: activeScript.body,
        sort_order: String(activeScript.sort_order),
      });
    }
  }, [scriptsQuery.data, selectedScriptId]);

  useEffect(() => {
    if (schemeDetailQuery.data) {
      setFinanceForm({
        weight_worker: String(schemeDetailQuery.data.weight_worker),
        weight_bloger: String(schemeDetailQuery.data.weight_bloger),
        weight_upline: String(schemeDetailQuery.data.weight_upline),
        weight_platform: String(schemeDetailQuery.data.weight_platform),
      });
    }
  }, [schemeDetailQuery.data]);

  useEffect(() => {
    // Текстовое поле ссылки отражает текущее значение реквизитов.
    // Черновик карты сбрасываем — последние 4 цифры показываем отдельно.
    if (paymentDetailsQuery.data) {
      setPaymentLinkForm(paymentDetailsQuery.data.payment_link || "");
      setCollectionCardDraft(null);
    }
  }, [paymentDetailsQuery.data]);

  const invalidateAdmin = async (...keys: readonly (readonly unknown[])[]) => {
    await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [...key] })));
  };

  const patchUserMutation = useMutation({
    mutationFn: () => {
      const isBlogger = userForm.role === "Bloger";
      // У блогера email синтетический (…@internal.bloger-network.local) и
      // пересобирается из ника на бэке. EmailStr такой домен отвергает —
      // поэтому email для блогера не отправляем вовсе.
      const payload: Record<string, unknown> = {
        name: userForm.name,
        telegram: userForm.telegram || null,
        percent: Number(userForm.percent),
        role: userForm.role,
        is_active: userForm.is_active,
        blogger_cabinet_pin: userForm.blogger_cabinet_pin || undefined,
      };
      if (isBlogger) {
        payload.nickname = userForm.nickname || null;
      } else if (userForm.email.trim()) {
        payload.email = userForm.email.trim();
      }
      return api.patchAdminUser(selectedUserId, payload);
    },
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Пользователь обновлён." });
      await invalidateAdmin(
        ["admin", "users"],
        ["admin", "user", selectedUserId],
        ["admin", "userStats", selectedUserId],
        ["admin", "overview"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const balanceAdjustMutation = useMutation({
    mutationFn: () =>
      api.adjustUserBalance(selectedUserId, {
        amount_kopeks: Math.round(Number(balanceAdjustForm.amountRub) * 100),
        reason: balanceAdjustForm.reason.trim(),
      }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Баланс скорректирован." });
      setBalanceAdjustForm({ amountRub: "", reason: "" });
      await invalidateAdmin(
        ["admin", "user", selectedUserId],
        ["admin", "userLedger", selectedUserId],
        ["admin", "userStats", selectedUserId],
        ["admin", "users"],
        ["admin", "overview"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const partnerCardMutation = useMutation({
    mutationFn: () => api.setPartnerPayoutCard(selectedUserId, { card_number: partnerCardForm.trim(), card_brand: null, card_holder: null }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Карта партнёра обновлена." });
      setPartnerCardForm("");
      await invalidateAdmin(
        ["admin", "user", selectedUserId],
        ["admin", "userAudit", selectedUserId],
        ["admin", "users"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const createBloggerMutation = useMutation({
    mutationFn: () =>
      api.createAdminBlogger({
        nickname: bloggerForm.nickname,
        name: bloggerForm.name || undefined,
        telegram: bloggerForm.telegram || undefined,
      }),
    onSuccess: async (payload) => {
      setBloggerForm(emptyBloggerForm);
      setModal({ kind: "blogger-created", nickname: payload.nickname, password: payload.generated_password });
      await invalidateAdmin(["admin", "users"], ["admin", "overview"], ["admin", "financeSchemes"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminUser(id),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Пользователь удалён." });
      setModal(null);
      setSelectedUserId("");
      await invalidateAdmin(["admin", "users"], ["admin", "overview"], ["admin", "financeSchemes"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason: string }) =>
      api.patchAdminDealStatus(id, { status, reason }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Статус сделки обновлён." });
      setModal(null);
      await invalidateAdmin(
        ["admin", "deals"],
        ["admin", "deal", selectedDealId],
        ["admin", "overview"],
        ["admin", "ledger"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealPriceMutation = useMutation({
    mutationFn: ({ id, agreedKopeks, reason }: { id: string; agreedKopeks: number; reason: string }) =>
      api.patchAdminDealPrice(id, { agreed_price_kopeks: agreedKopeks, reason }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Согласованная цена сохранена." });
      setModal(null);
      await invalidateAdmin(["admin", "deals"], ["admin", "deal", selectedDealId]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealRecalcMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.recalcAdminDealFinance(id, { reason }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Финансы сделки пересчитаны." });
      setModal(null);
      await invalidateAdmin(
        ["admin", "deals"],
        ["admin", "deal", selectedDealId],
        ["admin", "ledger"],
        ["admin", "financeSchemes"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const paymentDetailsMutation = useMutation({
    mutationFn: async () => {
      // Ссылку отправляем всегда (текстовое поле отражает текущее значение,
      // пустая строка очищает её). Карту включаем в payload только если админ
      // ввёл новый номер (collectionCardDraft), иначе опускаем поле, чтобы
      // сохранить прежнюю карту (пустая строка её бы очистила).
      const payload: { payment_link: string } = {
        payment_link: paymentLinkForm.trim(),
      };
      if (collectionCardDraft !== null && collectionCardBrand !== null && collectionCardHolder !== null) {
        await api.setPartnerPayoutCard(selectedUserId, {
          card_number: collectionCardDraft,
          card_brand: collectionCardBrand,
          card_holder: collectionCardHolder,
        });
      }
      return api.setAdminPaymentDetails(payload);
    },
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Реквизиты приёма сохранены." });
      setCollectionCardDraft(null);
      await invalidateAdmin(["admin", "paymentDetails"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealConfirmReceiptMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.confirmDealReceipt(id, { reason }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Получение средств подтверждено." });
      setModal(null);
      await invalidateAdmin(
        ["admin", "deals"],
        ["admin", "deal", selectedDealId],
        ["admin", "overview"],
        ["admin", "ledger"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealDistributeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.distributeDeal(id, { reason }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Средства распределены участникам." });
      setModal(null);
      await invalidateAdmin(
        ["admin", "deals"],
        ["admin", "deal", selectedDealId],
        ["admin", "overview"],
        ["admin", "ledger"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealRefundMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.refundDeal(id, { reason }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Средства возвращены." });
      setModal(null);
      await invalidateAdmin(
        ["admin", "deals"],
        ["admin", "deal", selectedDealId],
        ["admin", "overview"],
        ["admin", "ledger"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const ledgerStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) =>
      api.patchAdminLedgerEntry(id, { status, note }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Запись леджера обновлена." });
      setModal(null);
      await invalidateAdmin(["admin", "ledger"], ["admin", "ledgerEntry", selectedLedgerId], ["admin", "overview"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const payoutCompleteMutation = useMutation({
    mutationFn: (id: string) => api.completePayout(id),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Выплата отмечена как завершённая." });
      setModal(null);
      await invalidateAdmin(["admin", "ledger"], ["admin", "ledgerEntry", selectedLedgerId], ["admin", "overview"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const financeMutation = useMutation({
    mutationFn: () =>
      api.putFinanceScheme(selectedSchemeId, {
        weight_worker: Number(financeForm.weight_worker),
        weight_bloger: Number(financeForm.weight_bloger),
        weight_upline: Number(financeForm.weight_upline),
        weight_platform: Number(financeForm.weight_platform),
      }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Схема распределения обновлена." });
      await invalidateAdmin(
        ["admin", "financeSchemes"],
        ["admin", "financeScheme", selectedSchemeId],
        ["admin", "financePreview", selectedSchemeId, previewPriceKopeks],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const createScriptMutation = useMutation({
    mutationFn: () =>
      api.createAdminWorkerScript({
        title: scriptForm.title,
        body: scriptForm.body,
        sort_order: Number(scriptForm.sort_order),
      }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Скрипт создан." });
      setScriptForm(emptyScriptForm);
      await invalidateAdmin(["admin", "workerScripts"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const patchScriptMutation = useMutation({
    mutationFn: () =>
      api.patchAdminWorkerScript(selectedScriptId, {
        title: scriptForm.title,
        body: scriptForm.body,
        sort_order: Number(scriptForm.sort_order),
      }),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Скрипт обновлён." });
      await invalidateAdmin(["admin", "workerScripts"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const deleteScriptMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminWorkerScript(id),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Скрипт удалён." });
      setModal(null);
      setSelectedScriptId("");
      setScriptForm(emptyScriptForm);
      await invalidateAdmin(["admin", "workerScripts"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  // Telegram channel config
  const [telegramForm, setTelegramForm] = useState({
    channel_id: "",
    channel_title: "",
    channel_url: "",
    is_enabled: true,
  });
  const [telegramFormLoaded, setTelegramFormLoaded] = useState(false);

  // Sync form with loaded config
  if (telegramConfigQuery.data && !telegramFormLoaded) {
    setTelegramForm({
      channel_id: telegramConfigQuery.data.channel_id,
      channel_title: telegramConfigQuery.data.channel_title,
      channel_url: telegramConfigQuery.data.channel_url,
      is_enabled: telegramConfigQuery.data.is_enabled,
    });
    setTelegramFormLoaded(true);
  }

  const telegramConfigMutation = useMutation({
    mutationFn: () => api.setAdminTelegramChannel(telegramForm),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Настройки Telegram-канала сохранены." });
      await invalidateAdmin(["admin", "telegramChannel"]);
      await invalidateAdmin(["admin", "telegramChannelStats"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const dealStatusActions = useMemo(
    () =>
      (deal: DealRead): { status: string; label: string; title: string }[] => {
        switch (deal.status) {
          case "NEW":
            return [];
          case "REVIEW":
            return [{ status: "CONFIRMED", label: "Подтвердить", title: "Подтверждение сделки" }];
          case "CONFIRMED":
            // Прямой переход CONFIRMED → PAID запрещён: оплата идёт через эскроу
            // (Подтвердить получение → Распределить). См. кнопки эскроу ниже.
            return [];
          case "PAID":
            return [{ status: "COMPLETED", label: "Завершить", title: "Завершение сделки" }];
          default:
            return [];
        }
      },
    [],
  );

  const renderModal = () => {
    if (!modal) {
      return null;
    }

    switch (modal.kind) {
      case "delete-user":
        return (
          <Modal
            title="Удалить пользователя"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button type="button" onClick={() => deleteUserMutation.mutate(modal.user.id)} disabled={deleteUserMutation.isPending}>
                  Удалить
                </Button>
              </>
            }
          >
            <Message tone="error">Пользователь {modal.user.email} будет удалён без возможности отката.</Message>
          </Modal>
        );
      case "deal-status":
        return (
          <Modal
            title={modal.title}
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => dealStatusMutation.mutate({ id: modal.deal.id, status: modal.status, reason: modal.reason })}
                  disabled={dealStatusMutation.isPending || modal.reason.trim().length === 0}
                >
                  {modal.submitLabel}
                </Button>
              </>
            }
          >
            <Stack>
              <PillRow>
                <Pill>{modal.deal.item_name}</Pill>
                <Pill tone="accent">Статус → {formatDealStatus(modal.status)}</Pill>
              </PillRow>
              <Field label="Причина" help="Сообщение попадёт в журнал админ-действий.">
                <TextArea value={modal.reason} onChange={(event) => setModal({ ...modal, reason: event.target.value })} />
              </Field>
            </Stack>
          </Modal>
        );
      case "deal-price":
        return (
          <Modal
            title="Согласованная цена"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    dealPriceMutation.mutate({
                      id: modal.deal.id,
                      agreedKopeks: Math.round(Number(modal.agreedRub) * 100),
                      reason: modal.reason,
                    })
                  }
                  disabled={dealPriceMutation.isPending || modal.reason.trim().length === 0 || Number(modal.agreedRub) <= 0}
                >
                  Сохранить
                </Button>
              </>
            }
          >
            <Stack>
              <Field label="Согласованная сумма, ₽">
                <TextInput
                  value={modal.agreedRub}
                  inputMode="decimal"
                  onChange={(event) => setModal({ ...modal, agreedRub: event.target.value })}
                />
              </Field>
              <Field label="Причина">
                <TextArea value={modal.reason} onChange={(event) => setModal({ ...modal, reason: event.target.value })} />
              </Field>
            </Stack>
          </Modal>
        );
      case "deal-recalc":
        return (
          <Modal
            title="Пересчитать финансы сделки"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => dealRecalcMutation.mutate({ id: modal.deal.id, reason: modal.reason })}
                  disabled={dealRecalcMutation.isPending || modal.reason.trim().length === 0}
                >
                  Пересчитать
                </Button>
              </>
            }
          >
            <Field label="Причина пересчёта">
              <TextArea value={modal.reason} onChange={(event) => setModal({ ...modal, reason: event.target.value })} />
            </Field>
          </Modal>
        );
      case "deal-confirm-receipt":
        return (
          <Modal
            title="Подтвердить получение"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => dealConfirmReceiptMutation.mutate({ id: modal.deal.id, reason: modal.reason })}
                  disabled={dealConfirmReceiptMutation.isPending || modal.reason.trim().length === 0}
                >
                  Подтвердить
                </Button>
              </>
            }
          >
            <Stack>
              <PillRow>
                <Pill>{modal.deal.item_name}</Pill>
                <Pill tone="accent">Статус → {formatDealStatus("ESCROW_HELD")}</Pill>
              </PillRow>
              <Field label="Причина" help="Сообщение попадёт в журнал админ-действий.">
                <TextArea value={modal.reason} onChange={(event) => setModal({ ...modal, reason: event.target.value })} />
              </Field>
            </Stack>
          </Modal>
        );
      case "deal-distribute":
        return (
          <Modal
            title="Распределить средства"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => dealDistributeMutation.mutate({ id: modal.deal.id, reason: modal.reason })}
                  disabled={dealDistributeMutation.isPending || modal.reason.trim().length === 0}
                >
                  Распределить
                </Button>
              </>
            }
          >
            <Stack>
              <PillRow>
                <Pill>{modal.deal.item_name}</Pill>
                <Pill tone="accent">Статус → {formatDealStatus("PAID")}</Pill>
              </PillRow>
              <Field label="Причина" help="Сообщение попадёт в журнал админ-действий.">
                <TextArea value={modal.reason} onChange={(event) => setModal({ ...modal, reason: event.target.value })} />
              </Field>
            </Stack>
          </Modal>
        );
      case "deal-refund":
        return (
          <Modal
            title="Возврат средств"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => dealRefundMutation.mutate({ id: modal.deal.id, reason: modal.reason })}
                  disabled={dealRefundMutation.isPending || modal.reason.trim().length === 0}
                >
                  Оформить возврат
                </Button>
              </>
            }
          >
            <Stack>
              <PillRow>
                <Pill>{modal.deal.item_name}</Pill>
                <Pill tone="accent">Статус → {formatDealStatus("REFUNDED")}</Pill>
              </PillRow>
              <Field label="Причина" help="Сообщение попадёт в журнал админ-действий.">
                <TextArea value={modal.reason} onChange={(event) => setModal({ ...modal, reason: event.target.value })} />
              </Field>
            </Stack>
          </Modal>
        );
      case "ledger-status":
        return (
          <Modal
            title="Статус ledger-записи"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => ledgerStatusMutation.mutate({ id: modal.entry.id, status: modal.status, note: modal.note })}
                  disabled={ledgerStatusMutation.isPending}
                >
                  Сохранить
                </Button>
              </>
            }
          >
            <Stack>
              <Field label="Статус">
                <SelectInput value={modal.status} onChange={(event) => setModal({ ...modal, status: event.target.value })}>
                  {["payout_request", "freeze", "pending_confirmation", "completed", "rejected"].map((value) => (
                    <option key={value} value={value}>
                      {formatLedgerStatus(value)}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Комментарий">
                <TextArea value={modal.note} onChange={(event) => setModal({ ...modal, note: event.target.value })} />
              </Field>
            </Stack>
          </Modal>
        );
      case "payout-complete": {
        const recipient = usersQuery.data?.items.find((u) => u.id === modal.entry.user_id) || null;
        const isPayout = modal.entry.amount_kopeks < 0;
        const payoutAmount = formatMoney(Math.abs(modal.entry.amount_kopeks));
        return (
          <Modal
            title="Подтвердить выплату"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button type="button" onClick={() => payoutCompleteMutation.mutate(modal.entry.id)} disabled={payoutCompleteMutation.isPending}>
                  Завершить выплату
                </Button>
              </>
            }
          >
            <PillRow>
              <Pill tone="accent">{isPayout ? "Списание" : "Начисление"}</Pill>
              <Pill>{payoutAmount}</Pill>
              <Pill>{formatLedgerStatus(modal.entry.status)}</Pill>
            </PillRow>

            {recipient ? (
              <Stack>
                <Field label="Получатель">
                  <TextInput value={`${recipient.name} (${recipient.role})`} disabled readOnly />
                </Field>
                <TwoColumn>
                  <Field label="Telegram">
                    <TextInput value={recipient.telegram || "—"} disabled readOnly />
                  </Field>
                  <Field label="Карта (last 4)">
                    <TextInput
                      value={recipient.payout_card_last4 ? `•••• ${recipient.payout_card_last4}` : "не привязана"}
                      disabled
                      readOnly
                    />
                  </Field>
                </TwoColumn>
                {!recipient.payout_card_last4 ? (
                  <Message tone="error">
                    У получателя не привязана карта — попросите его добавить карту в кабинете перед переводом.
                  </Message>
                ) : null}
              </Stack>
            ) : (
              <Message>Профиль получателя не загружен. Откройте раздел «Пользователи» один раз, чтобы подтянуть список.</Message>
            )}

            <Message>
              {isPayout
                ? `Переведите ${payoutAmount} получателю и нажмите «Завершить выплату» — запись перейдёт в «Завершено», баланс уменьшится автоматически.`
                : "Запись будет переведена в статус «Завершено». Убедитесь, что перевод действительно выполнен."}
            </Message>
          </Modal>
        );
      }
      case "delete-script":
        return (
          <Modal
            title="Удалить скрипт"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button type="button" onClick={() => deleteScriptMutation.mutate(modal.script.id)} disabled={deleteScriptMutation.isPending}>
                  Удалить
                </Button>
              </>
            }
          >
            <Message tone="error">Скрипт «{modal.script.title}» будет удалён и пропадёт у воркеров.</Message>
          </Modal>
        );
      case "blogger-created":
        return (
          <Modal
            title="Блогер создан"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button
                  type="button"
                  kind="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(`Логин: ${modal.nickname}\nПароль: ${modal.password}`);
                  }}
                >
                  Скопировать ник и пароль
                </Button>
                <Button type="button" onClick={() => setModal(null)}>
                  Готово
                </Button>
              </>
            }
          >
              <Stack>
                <Message tone="success">Передайте блогеру ник и пароль. Пароль показывается один раз.</Message>
                <div className={styles.passwordPanel}>
                  <p className={styles.passwordPanelTitle}>Пароль</p>
                  <span>Никнейм</span>
                  <code>{modal.nickname}</code>
                  <span>Пароль</span>
                  <code>{modal.password}</code>
                </div>
              </Stack>
          </Modal>
        );
    }
  };

  const activeScript = scriptsQuery.data?.find((item) => item.id === selectedScriptId) || null;

  // Текущий администратор является владельцем (Admin), если его роль — Admin.
  // Управление административными аккаунтами (смена роли, деактивация) доступно только владельцу.
  const currentUserIsOwner = meQuery.data?.role === "Admin";

  const sectionContent = () => {
    if (section === "overview") {
      return (
        <Stack>
          {overviewQuery.data ? (
            <StatsGrid>
              <StatCard label="Всего пользователей" value={formatNumber(overviewQuery.data.users_total)} />
              <StatCard label="Активных" value={formatNumber(overviewQuery.data.users_active)} />
              <StatCard label="Сделок" value={formatNumber(overviewQuery.data.deals_total)} />
              <StatCard label="Баланс системы" value={formatMoney(overviewQuery.data.balance_total_kopeks)} />
            </StatsGrid>
          ) : (
            <Message>Загружаем сводку…</Message>
          )}
          {overviewQuery.data ? (
            <SectionCard title="Сделки по статусам" lead="Распределение по жизненному циклу.">
              <PillRow>
                {Object.entries(overviewQuery.data.deals_by_status).map(([statusKey, count]) => (
                  <Pill key={statusKey} tone={statusKey === "PAID" || statusKey === "COMPLETED" ? "accent" : "default"}>
                    {formatDealStatus(statusKey)}: {formatNumber(count)}
                  </Pill>
                ))}
              </PillRow>
            </SectionCard>
          ) : null}
          {overviewQuery.data ? (
            <SectionCard title="Пользователи по ролям" lead="Сколько воркеров, блогеров и администраторов.">
              <PillRow>
                {Object.entries(overviewQuery.data.users_by_role).map(([role, count]) => (
                  <Pill key={role}>
                    {formatRole(role)}: {formatNumber(count)}
                  </Pill>
                ))}
              </PillRow>
            </SectionCard>
          ) : null}
        </Stack>
      );
    }

    if (section === "users") {
      return (
        <div className={styles.sideLayout}>
          <Stack>
            <SectionCard title="Список пользователей" lead="Кликните по строке, чтобы открыть редактор.">
              {usersQuery.data ? (
                <TableWrap>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Email / ник</th>
                        <th>Роль</th>
                        <th>Баланс</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersQuery.data.items.map((user) => (
                        <tr
                          key={user.id}
                          className={`${styles.selectable}${selectedUserId === user.id ? ` ${styles.selected}` : ""}`}
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          <td>
                            <strong>{user.nickname || user.email}</strong>
                            <br />
                            <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>{user.email}</span>
                          </td>
                          <td>{formatRole(user.role)}</td>
                          <td>{formatMoney(user.balance)}</td>
                          <td>{user.is_active ? "Активен" : "Отключён"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrap>
              ) : (
                <Message>Загружаем пользователей…</Message>
              )}
            </SectionCard>

            {userLedgerQuery.data ? (
              <SectionCard title="Леджер выбранного пользователя">
                {userLedgerQuery.data.items.length === 0 ? (
                  <Message>У пользователя пока нет начислений.</Message>
                ) : (
                  <TableWrap>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Сумма</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userLedgerQuery.data.items.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateTime(entry.created_at)}</td>
                            <td>{formatMoney(entry.amount_kopeks)}</td>
                            <td>{formatLedgerStatus(entry.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableWrap>
                )}
              </SectionCard>
            ) : null}
          </Stack>

          <Stack>
            <SectionCard
              title="Редактор пользователя"
              lead={userDetailQuery.data ? `${userDetailQuery.data.email}` : "Выберите пользователя слева."}
              actions={
                userDetailQuery.data && currentUserIsOwner ? (
                  <Button type="button" kind="ghost" onClick={() => setModal({ kind: "delete-user", user: userDetailQuery.data })}>
                    Удалить
                  </Button>
                ) : null
              }
            >
              {userDetailQuery.data ? (
                <Stack>
                  <TwoColumn>
                    <Field label="Имя">
                      <TextInput value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} />
                    </Field>
                    <Field label="Email" help={userForm.role === "Bloger" ? "У блогера задаётся ником, менять нельзя." : undefined}>
                      <TextInput
                        value={userForm.email}
                        onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                        readOnly={userForm.role === "Bloger"}
                        disabled={userForm.role === "Bloger"}
                      />
                    </Field>
                    <Field label="Telegram">
                      <TextInput value={userForm.telegram} onChange={(event) => setUserForm((current) => ({ ...current, telegram: event.target.value }))} />
                    </Field>
                    <Field label="Никнейм" help="Только для блогера. Email пересоберётся под ник.">
                      <TextInput value={userForm.nickname} onChange={(event) => setUserForm((current) => ({ ...current, nickname: event.target.value }))} />
                    </Field>
                    <Field label="Процент">
                      <TextInput value={userForm.percent} onChange={(event) => setUserForm((current) => ({ ...current, percent: event.target.value }))} />
                    </Field>
                    <Field
                      label="Роль"
                      help={
                        !currentUserIsOwner &&
                        (userDetailQuery.data.role === "Admin" || userDetailQuery.data.role === "Tech_Admin")
                          ? "Смена роли административного аккаунта доступна только владельцу."
                          : undefined
                      }
                    >
                      <SelectInput
                        value={userForm.role}
                        disabled={
                          !currentUserIsOwner &&
                          (userDetailQuery.data.role === "Admin" || userDetailQuery.data.role === "Tech_Admin")
                        }
                        onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
                      >
                        <option value="Worker">Работник</option>
                        <option value="Bloger">Блогер</option>
                        <option value="Admin">Администратор</option>
                        <option value="Tech_Admin">Тех-админ</option>
                      </SelectInput>
                    </Field>
                    <Field label="PIN кабинета блогера" help="Оставьте пустым, чтобы не менять. Пустая строка сбрасывает PIN.">
                      <TextInput
                        value={userForm.blogger_cabinet_pin}
                        onChange={(event) => setUserForm((current) => ({ ...current, blogger_cabinet_pin: event.target.value }))}
                      />
                    </Field>
                    <Field
                      label="Статус"
                      help={
                        !currentUserIsOwner &&
                        (userDetailQuery.data.role === "Admin" || userDetailQuery.data.role === "Tech_Admin")
                          ? "Деактивация административного аккаунта доступна только владельцу."
                          : undefined
                      }
                    >
                      <SelectInput
                        value={userForm.is_active ? "active" : "inactive"}
                        disabled={
                          !currentUserIsOwner &&
                          (userDetailQuery.data.role === "Admin" || userDetailQuery.data.role === "Tech_Admin")
                        }
                        onChange={(event) => setUserForm((current) => ({ ...current, is_active: event.target.value === "active" }))}
                      >
                        <option value="active">Активен</option>
                        <option value="inactive">Отключён</option>
                      </SelectInput>
                    </Field>
                  </TwoColumn>
                  <div className={styles.actionRow}>
                    <Button type="button" onClick={() => patchUserMutation.mutate()} disabled={patchUserMutation.isPending}>
                      {patchUserMutation.isPending ? "Сохраняем…" : "Сохранить пользователя"}
                    </Button>
                  </div>
                  {userStatsQuery.data ? (
                    <PillRow>
                      <Pill>Сделок: {formatNumber(userStatsQuery.data.deals)}</Pill>
                      <Pill>Доход: {formatMoney(userStatsQuery.data.earn)}</Pill>
                      <Pill>Ожидает: {formatMoney(userStatsQuery.data.balance_pending_confirmation_kopeks)}</Pill>
                    </PillRow>
                  ) : null}
                </Stack>
              ) : (
                <Message>Выберите пользователя в таблице.</Message>
              )}
            </SectionCard>

            <SectionCard
              title="Партнёр"
              lead="Текущие параметры партнёра: процент, карта, баланс и статус."
            >
              {userDetailQuery.data ? (
                <PillRow>
                  <Pill>Роль: {formatRole(userDetailQuery.data.role)}</Pill>
                  <Pill>Процент: {userDetailQuery.data.percent}%</Pill>
                  <Pill>Баланс: {formatMoney(userDetailQuery.data.balance)}</Pill>
                  <Pill>
                    Карта:{" "}
                    {userDetailQuery.data.payout_card_last4
                      ? `•••• ${userDetailQuery.data.payout_card_last4}`
                      : "не привязана"}
                  </Pill>
                  <Pill tone={userDetailQuery.data.is_active ? "accent" : "default"}>
                    {userDetailQuery.data.is_active ? "Активен" : "Отключён"}
                  </Pill>
                </PillRow>
              ) : (
                <Message>Выберите пользователя в таблице.</Message>
              )}
            </SectionCard>

            <SectionCard
              title="Корректировка баланса"
              lead="Сумма в рублях (можно отрицательную). Создаётся запись в журнале с указанной причиной."
            >
              {userDetailQuery.data ? (
                <Stack>
                  <TwoColumn>
                    <Field label="Сумма, ₽" help="Положительная — начисление, отрицательная — списание.">
                      <TextInput
                        value={balanceAdjustForm.amountRub}
                        inputMode="decimal"
                        onChange={(event) =>
                          setBalanceAdjustForm((current) => ({ ...current, amountRub: event.target.value }))
                        }
                      />
                    </Field>
                  </TwoColumn>
                  <Field label="Причина">
                    <TextArea
                      value={balanceAdjustForm.reason}
                      onChange={(event) =>
                        setBalanceAdjustForm((current) => ({ ...current, reason: event.target.value }))
                      }
                    />
                  </Field>
                  <div className={styles.actionRow}>
                    <Button
                      type="button"
                      onClick={() => balanceAdjustMutation.mutate()}
                      disabled={
                        balanceAdjustMutation.isPending ||
                        balanceAdjustForm.reason.trim().length === 0 ||
                        balanceAdjustForm.amountRub.trim().length === 0 ||
                        !Number.isFinite(Number(balanceAdjustForm.amountRub)) ||
                        Math.round(Number(balanceAdjustForm.amountRub) * 100) === 0
                      }
                    >
                      {balanceAdjustMutation.isPending ? "Применяем…" : "Скорректировать баланс"}
                    </Button>
                  </div>
                </Stack>
              ) : (
                <Message>Выберите пользователя в таблице.</Message>
              )}
            </SectionCard>

            <SectionCard
              title="Карта партнёра"
              lead="Номер карты (13–19 цифр). Сохраняются только последние 4 цифры."
            >
              {userDetailQuery.data ? (
                <Stack>
                  <Field label="Номер карты">
                    <TextInput
                      value={partnerCardForm}
                      inputMode="numeric"
                      onChange={(event) => setPartnerCardForm(event.target.value)}
                    />
                  </Field>
                  <div className={styles.actionRow}>
                    <Button
                      type="button"
                      onClick={() => partnerCardMutation.mutate()}
                      disabled={partnerCardMutation.isPending || partnerCardForm.trim().length === 0}
                    >
                      {partnerCardMutation.isPending ? "Сохраняем…" : "Сохранить карту"}
                    </Button>
                  </div>
                </Stack>
              ) : (
                <Message>Выберите пользователя в таблице.</Message>
              )}
            </SectionCard>

            <SectionCard title="История изменений" lead="Аудит изменений процента и карты партнёра.">
              {userAuditQuery.data ? (
                userAuditQuery.data.items.length === 0 ? (
                  <Message>Изменений пока не зафиксировано.</Message>
                ) : (
                  <TableWrap>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Поле</th>
                          <th>Было</th>
                          <th>Стало</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userAuditQuery.data.items.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateTime(entry.created_at)}</td>
                            <td>{entry.field}</td>
                            <td>{entry.old_value ?? "—"}</td>
                            <td>{entry.new_value ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableWrap>
                )
              ) : (
                <Message>Выберите пользователя в таблице.</Message>
              )}
            </SectionCard>

            <SectionCard title="Создать блогера" lead="Создаёт нового блогера. Пароль выдаётся автоматически — сохраните его сразу.">
              <Stack>
                <Field label="Никнейм">
                  <TextInput value={bloggerForm.nickname} onChange={(event) => setBloggerForm((current) => ({ ...current, nickname: event.target.value }))} />
                </Field>
                <Field label="Имя">
                  <TextInput value={bloggerForm.name} onChange={(event) => setBloggerForm((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <Field label="Telegram">
                  <TextInput value={bloggerForm.telegram} onChange={(event) => setBloggerForm((current) => ({ ...current, telegram: event.target.value }))} />
                </Field>
                <div className={styles.actionRow}>
                  <Button type="button" onClick={() => createBloggerMutation.mutate()} disabled={createBloggerMutation.isPending || !bloggerForm.nickname}>
                    {createBloggerMutation.isPending ? "Создаём…" : "Создать блогера"}
                  </Button>
                </div>
              </Stack>
            </SectionCard>
          </Stack>
        </div>
      );
    }

    if (section === "deals") {
      return (
        <div className={styles.sideLayout}>
          <SectionCard title="Список сделок" lead="Активные сделки сверху. Кликните по строке, чтобы открыть действия.">
            {dealsQuery.data ? (
              dealsQuery.data.length === 0 ? (
                <Message>Сделок пока нет.</Message>
              ) : (
                <TableWrap>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Статус</th>
                        <th>Цена</th>
                        <th>Создано</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dealsQuery.data.map((deal) => (
                        <tr
                          key={deal.id}
                          className={`${styles.selectable}${selectedDealId === deal.id ? ` ${styles.selected}` : ""}`}
                          onClick={() => setSelectedDealId(deal.id)}
                        >
                          <td>{deal.item_name}</td>
                          <td>
                            <StatusPill tone={dealStatusTone(deal.status)}>{formatDealStatus(deal.status)}</StatusPill>
                          </td>
                          <td>{formatMoney(deal.effective_price_kopeks || deal.price)}</td>
                          <td>{formatDateTime(deal.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrap>
              )
            ) : (
              <Message>Загружаем сделки…</Message>
            )}
          </SectionCard>

          <SectionCard
            title="Действия по сделке"
            lead={dealDetailQuery.data ? `${dealDetailQuery.data.item_name}` : "Выберите сделку слева."}
          >
            {dealDetailQuery.data ? (
              <Stack>
                <PillRow>
                  <Pill tone="accent">{formatDealStatus(dealDetailQuery.data.status)}</Pill>
                  <Pill>{formatMoney(dealDetailQuery.data.effective_price_kopeks || dealDetailQuery.data.price)}</Pill>
                  <Pill>Воркер: {dealDetailQuery.data.worker_id.slice(0, 8)}…</Pill>
                  <Pill>Блогер: {dealDetailQuery.data.bloger_id.slice(0, 8)}…</Pill>
                </PillRow>

                <div className={styles.actionRow}>
                  {dealStatusActions(dealDetailQuery.data).map((action) => (
                    <Button
                      key={action.status}
                      type="button"
                      onClick={() =>
                        setModal({
                          kind: "deal-status",
                          deal: dealDetailQuery.data,
                          status: action.status,
                          reason: "",
                          title: action.title,
                          submitLabel: action.label,
                        })
                      }
                    >
                      {action.label}
                    </Button>
                  ))}

                  {(dealDetailQuery.data.status === "NEW" || dealDetailQuery.data.status === "REVIEW") ? (
                    <Button
                      type="button"
                      kind="ghost"
                      onClick={() =>
                        setModal({
                          kind: "deal-status",
                          deal: dealDetailQuery.data,
                          status: "REJECTED",
                          reason: "",
                          title: "Отклонить сделку",
                          submitLabel: "Отклонить",
                        })
                      }
                    >
                      Отклонить
                    </Button>
                  ) : null}

                  {dealDetailQuery.data.status === "CONFIRMED" ? (
                    <Button
                      type="button"
                      kind="secondary"
                      onClick={() =>
                        setModal({
                          kind: "deal-price",
                          deal: dealDetailQuery.data,
                          agreedRub: String(
                            dealDetailQuery.data.agreed_price_kopeks
                              ? dealDetailQuery.data.agreed_price_kopeks / 100
                              : dealDetailQuery.data.price / 100,
                          ),
                          reason: "",
                        })
                      }
                    >
                      Согласовать цену
                    </Button>
                  ) : null}

                  {dealDetailQuery.data.status === "CONFIRMED" ? (
                    <Button
                      type="button"
                      onClick={() =>
                        setModal({
                          kind: "deal-confirm-receipt",
                          deal: dealDetailQuery.data,
                          reason: "",
                        })
                      }
                    >
                      Подтвердить получение
                    </Button>
                  ) : null}

                  {dealDetailQuery.data.status === "ESCROW_HELD" ? (
                    <Button
                      type="button"
                      onClick={() =>
                        setModal({
                          kind: "deal-distribute",
                          deal: dealDetailQuery.data,
                          reason: "",
                        })
                      }
                    >
                      Распределить
                    </Button>
                  ) : null}

                  {dealDetailQuery.data.status === "ESCROW_HELD" ? (
                    <Button
                      type="button"
                      kind="ghost"
                      onClick={() =>
                        setModal({
                          kind: "deal-refund",
                          deal: dealDetailQuery.data,
                          reason: "",
                        })
                      }
                    >
                      Возврат
                    </Button>
                  ) : null}

                  {(dealDetailQuery.data.status === "PAID" || dealDetailQuery.data.status === "COMPLETED") ? (
                    <Button
                      type="button"
                      kind="ghost"
                      onClick={() =>
                        setModal({
                          kind: "deal-recalc",
                          deal: dealDetailQuery.data,
                          reason: "",
                        })
                      }
                    >
                      Пересчитать финансы
                    </Button>
                  ) : null}
                </div>

                <Stack>
                  <Field label="Магазин">
                    <TextInput value={dealDetailQuery.data.shop_link} disabled readOnly />
                  </Field>
                  {dealDetailQuery.data.status === "REJECTED" ? (
                    <Field label="Причина отклонения">
                      <TextArea
                        value={dealDetailQuery.data.rejection_reason || "Причина не указана"}
                        disabled
                        readOnly
                      />
                    </Field>
                  ) : null}
                  <TwoColumn>
                    <Field label="Telegram продавца">
                      <TextInput value={dealDetailQuery.data.seller_tg} disabled readOnly />
                    </Field>
                    <Field label="Телефон продавца">
                      <TextInput value={dealDetailQuery.data.seller_number} disabled readOnly />
                    </Field>
                  </TwoColumn>
                  {dealDetailQuery.data.preview_worker_kopeks !== null ||
                  dealDetailQuery.data.preview_blogger_kopeks !== null ||
                  dealDetailQuery.data.preview_platform_kopeks !== null ? (
                    <PillRow>
                      {dealDetailQuery.data.preview_worker_kopeks !== null ? (
                        <Pill>Воркер: {formatMoney(dealDetailQuery.data.preview_worker_kopeks)}</Pill>
                      ) : null}
                      {dealDetailQuery.data.preview_blogger_kopeks !== null ? (
                        <Pill>Блогер: {formatMoney(dealDetailQuery.data.preview_blogger_kopeks)}</Pill>
                      ) : null}
                      {dealDetailQuery.data.preview_platform_kopeks !== null ? (
                        <Pill>Платформа: {formatMoney(dealDetailQuery.data.preview_platform_kopeks)}</Pill>
                      ) : null}
                    </PillRow>
                  ) : null}

                  {dealDetailQuery.data.status === "CONFIRMED" && dealDetailQuery.data.payment_requisites ? (
                    dealDetailQuery.data.payment_requisites.available ? (
                      <div className={styles.requisitesBox}>
                        <p className={styles.requisitesTitle}>Реквизиты приёма платежей</p>
                        {dealDetailQuery.data.payment_requisites.collection_card_full ? (
                          <div className={styles.requisitesRow}>
                            <div className={styles.requisitesField}>
                              <span className={styles.requisitesLabel}>Карта приёма</span>
                              <code className={styles.requisitesValue}>
                                {dealDetailQuery.data.payment_requisites.collection_card_full}
                              </code>
                            </div>
                            <Button
                              type="button"
                              kind="ghost"
                              onClick={() => {
                                void navigator.clipboard.writeText(
                                  dealDetailQuery.data.payment_requisites?.collection_card_full || "",
                                );
                                setMessage({ tone: "success", text: "Номер карты скопирован." });
                              }}
                            >
                              Копировать
                            </Button>
                          </div>
                        ) : null}
                        {dealDetailQuery.data.payment_requisites.payment_link ? (
                          <div className={styles.requisitesRow}>
                            <div className={styles.requisitesField}>
                              <span className={styles.requisitesLabel}>Платёжная ссылка</span>
                              <code className={styles.requisitesValue}>
                                {dealDetailQuery.data.payment_requisites.payment_link}
                              </code>
                            </div>
                            <Button
                              type="button"
                              kind="ghost"
                              onClick={() => {
                                void navigator.clipboard.writeText(
                                  dealDetailQuery.data.payment_requisites?.payment_link || "",
                                );
                                setMessage({ tone: "success", text: "Ссылка скопирована." });
                              }}
                            >
                              Копировать
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Message>Реквизиты приёма не настроены</Message>
                    )
                  ) : null}
                </Stack>
              </Stack>
            ) : (
              <Message>Выберите сделку, чтобы увидеть действия.</Message>
            )}
          </SectionCard>
        </div>
      );
    }

    if (section === "ledger") {
      return (
        <div className={styles.sideLayout}>
          <SectionCard title="Леджер" lead="Все начисления и запросы на выплату.">
            {ledgerQuery.data ? (
              ledgerQuery.data.items.length === 0 ? (
                <Message>Записей пока нет.</Message>
              ) : (
                <TableWrap>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Пользователь</th>
                        <th>Сумма</th>
                        <th>Статус</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerQuery.data.items.map((entry) => (
                        <tr
                          key={entry.id}
                          className={`${styles.selectable}${selectedLedgerId === entry.id ? ` ${styles.selected}` : ""}`}
                          onClick={() => setSelectedLedgerId(entry.id)}
                        >
                          <td
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedUserId(entry.user_id);
                              setSection("users");
                            }}
                            title="Открыть пользователя"
                            className={styles.linkCell}
                          >
                            {entry.user_id.slice(0, 8)}…
                          </td>
                          <td>{formatMoney(entry.amount_kopeks)}</td>
                          <td>
                            <StatusPill
                              tone={entry.status === "completed" ? "success" : entry.status === "rejected" ? "danger" : "active"}
                            >
                              {formatLedgerStatus(entry.status)}
                            </StatusPill>
                          </td>
                          <td>{formatDateTime(entry.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrap>
              )
            ) : (
              <Message>Загружаем леджер…</Message>
            )}
          </SectionCard>

          <SectionCard title="Действия по записи" lead="Меняйте статус или подтверждайте выплаты.">
            {ledgerDetailQuery.data ? (
              <Stack>
                <PillRow>
                  <Pill>{formatMoney(ledgerDetailQuery.data.amount_kopeks)}</Pill>
                  <Pill>{formatLedgerStatus(ledgerDetailQuery.data.status)}</Pill>
                </PillRow>
                <div className={styles.actionRow}>
                  <Button
                    type="button"
                    onClick={() =>
                      setModal({
                        kind: "ledger-status",
                        entry: ledgerDetailQuery.data,
                        status: ledgerDetailQuery.data.status,
                        note: ledgerDetailQuery.data.note || "",
                      })
                    }
                  >
                    Изменить статус
                  </Button>
                  {ledgerDetailQuery.data.status !== "completed" ? (
                    <Button
                      type="button"
                      kind="secondary"
                      onClick={() => setModal({ kind: "payout-complete", entry: ledgerDetailQuery.data })}
                    >
                      Завершить выплату
                    </Button>
                  ) : null}
                </div>
                {ledgerDetailQuery.data.status === "rejected" ? (
                  <Field label="Причина отклонения">
                    <TextArea value={ledgerDetailQuery.data.note || "Причина не указана"} disabled readOnly />
                  </Field>
                ) : ledgerDetailQuery.data.note ? (
                  <Message>Заметка: {ledgerDetailQuery.data.note}</Message>
                ) : null}
              </Stack>
            ) : (
              <Message>Выберите запись в таблице.</Message>
            )}
          </SectionCard>
        </div>
      );
    }

    if (section === "schemes") {
      return (
        <div className={styles.sideLayout}>
          <SectionCard title="Финансовые схемы" lead="Веса распределения долей по каждому блогеру.">
            {schemesQuery.data ? (
              schemesQuery.data.items.length === 0 ? (
                <Message>Создайте блогера, чтобы появилась первая схема.</Message>
              ) : (
                <TableWrap>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Блогер</th>
                        <th>Воркер</th>
                        <th>Блогер</th>
                        <th>Платформа</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schemesQuery.data.items.map((scheme) => (
                        <tr
                          key={scheme.blogger_id}
                          className={`${styles.selectable}${selectedSchemeId === scheme.blogger_id ? ` ${styles.selected}` : ""}`}
                          onClick={() => setSelectedSchemeId(scheme.blogger_id)}
                        >
                          <td>{scheme.blogger_name}</td>
                          <td>{scheme.weight_worker}</td>
                          <td>{scheme.weight_bloger}</td>
                          <td>{scheme.weight_platform}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrap>
              )
            ) : (
              <Message>Загружаем схемы…</Message>
            )}
          </SectionCard>

          <SectionCard title="Редактор схемы" lead={schemeDetailQuery.data ? schemeDetailQuery.data.blogger_email : "Выберите блогера слева."}>
            {schemeDetailQuery.data ? (
              <Stack>
                <TwoColumn>
                  <Field label="Воркер">
                    <TextInput value={financeForm.weight_worker} onChange={(event) => setFinanceForm((current) => ({ ...current, weight_worker: event.target.value }))} />
                  </Field>
                  <Field label="Блогер">
                    <TextInput value={financeForm.weight_bloger} onChange={(event) => setFinanceForm((current) => ({ ...current, weight_bloger: event.target.value }))} />
                  </Field>
                  <Field label="Аплайн-блогер">
                    <TextInput value={financeForm.weight_upline} onChange={(event) => setFinanceForm((current) => ({ ...current, weight_upline: event.target.value }))} />
                  </Field>
                  <Field label="Платформа">
                    <TextInput value={financeForm.weight_platform} onChange={(event) => setFinanceForm((current) => ({ ...current, weight_platform: event.target.value }))} />
                  </Field>
                </TwoColumn>
                <div className={styles.actionRow}>
                  <Button type="button" onClick={() => financeMutation.mutate()} disabled={financeMutation.isPending}>
                    {financeMutation.isPending ? "Сохраняем…" : "Сохранить схему"}
                  </Button>
                </div>
                <Field label="Сумма для предпросмотра, ₽">
                  <TextInput
                    value={previewPriceRub}
                    inputMode="decimal"
                    onChange={(event) => setPreviewPriceRub(event.target.value)}
                  />
                </Field>
                {financePreviewQuery.data ? (
                  <PillRow>
                    <Pill>Воркер: {formatMoney(financePreviewQuery.data.worker_kopeks)}</Pill>
                    <Pill>Блогер: {formatMoney(financePreviewQuery.data.bloger_kopeks)}</Pill>
                    <Pill>Аплайн: {formatMoney(financePreviewQuery.data.upline_kopeks)}</Pill>
                    <Pill>Платформа: {formatMoney(financePreviewQuery.data.platform_kopeks)}</Pill>
                  </PillRow>
                ) : null}
              </Stack>
            ) : (
              <Message>Выберите финансовую схему.</Message>
            )}
          </SectionCard>
        </div>
      );
    }

    if (section === "finance") {
      const dash = financeDashboardQuery.data;
      const participantLabel = (key: string): string => {
        switch (key.toLowerCase()) {
          case "worker":
            return "Воркер";
          case "bloger":
          case "blogger":
            return "Блогер";
          case "upline":
            return "Аплайн";
          case "platform":
            return "Платформа";
          default:
            return key;
        }
      };
      const periodOptions: { value: ReportingPeriod; label: string }[] = [
        { value: "today", label: "Сегодня" },
        { value: "week", label: "Неделя" },
        { value: "month", label: "Месяц" },
        { value: "all", label: "Всё время" },
      ];
      const dealStatusOrder = [
        "NEW",
        "REVIEW",
        "CONFIRMED",
        "ESCROW_HELD",
        "PAID",
        "COMPLETED",
        "REJECTED",
        "REFUNDED",
      ] as const;
      const maxSeriesTurnover = dash
        ? Math.max(1, ...dash.time_series.map((point) => point.turnover_kopeks))
        : 1;
      const maxSeriesShare = dash
        ? Math.max(1, ...dash.time_series.map((point) => point.accrued_platform_share_kopeks))
        : 1;
      return (
        <Stack>
          <SectionCard
            title="Период"
            lead="Фильтрация показателей оборота, накопленной доли и количества сделок по выбранному периоду."
          >
            <PillRow>
              {periodOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  kind={financePeriod === option.value ? "primary" : "ghost"}
                  onClick={() => setFinancePeriod(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </PillRow>
          </SectionCard>

          <SectionCard
            title="Реквизиты приёма платежей"
            lead="Карта приёма и/или платёжная ссылка, которые предъявляются плательщику по подтверждённой сделке."
          >
            <Stack>
              <div className={styles.requisitesBox}>
                <div className={styles.requisitesRow}>
                  <div className={styles.requisitesField}>
                    <span className={styles.requisitesLabel}>Карта приёма</span>
                    <code className={styles.requisitesValue}>
                      {paymentDetailsQuery.data?.collection_card_last4
                        ? `•••• ${paymentDetailsQuery.data.collection_card_last4}`
                        : "не настроена"}
                    </code>
                  </div>
                  <div className={styles.requisitesField}>
                    <span className={styles.requisitesLabel}>Платёжная ссылка</span>
                    <code className={styles.requisitesValue}>
                      {paymentDetailsQuery.data?.payment_link || "не настроена"}
                    </code>
                  </div>
                </div>
              </div>

              {paymentDetailsQuery.isLoading ? <Message>Загружаем реквизиты…</Message> : null}
              {paymentDetailsQuery.isError ? (
                <Message tone="error">Не удалось загрузить реквизиты приёма.</Message>
              ) : null}

              <Field
                label="Платёжная ссылка"
                help="Абсолютный HTTPS-URL. Пустое поле очистит сохранённую ссылку."
              >
                <TextInput
                  value={paymentLinkForm}
                  inputMode="url"
                  placeholder="https://"
                  onChange={(event) => setPaymentLinkForm(event.target.value)}
                />
              </Field>

              <Field
                label="Карта приёма"
                help={
                  collectionCardDraft !== null
                    ? "Новый номер будет сохранён при нажатии «Сохранить реквизиты»."
                    : "Введите номер, чтобы заменить карту. Без ввода прежняя карта сохраняется."
                }
              >
                {/* PayoutCardInput форматирует номер и проверяет Luhn (13–19 цифр).
                    onSubmit отдаёт сырые цифры — кладём их в черновик, чтобы
                    включить collection_card в payload только при реальном вводе. */}
                <PayoutCardInput
                  savedLast4={paymentDetailsQuery.data?.collection_card_last4 ?? null}
                  pending={paymentDetailsMutation.isPending}
                  onSubmit={(rawDigits, holder, brand) => {
                    setCollectionCardDraft(rawDigits);
                    setCollectionCardBrand(brand);
                    setCollectionCardHolder(holder);
                    setMessage({
                      tone: "success",
                      text: "Карта готова к сохранению — нажмите «Сохранить реквизиты».",
                    });
                  }}
                />
              </Field>

              <div className={styles.actionRow}>
                <Button
                  type="button"
                  onClick={() => paymentDetailsMutation.mutate()}
                  disabled={paymentDetailsMutation.isPending}
                >
                  {paymentDetailsMutation.isPending ? "Сохраняем…" : "Сохранить реквизиты"}
                </Button>
                {collectionCardDraft !== null ? (
                  <Pill tone="accent">Новая карта •••• {collectionCardDraft.slice(-4)}</Pill>
                ) : null}
              </div>
            </Stack>
          </SectionCard>

          {financeDashboardQuery.isLoading ? <Message>Загружаем финансовую сводку…</Message> : null}
          {financeDashboardQuery.isError ? (
            <Message tone="error">Не удалось загрузить финансовую сводку.</Message>
          ) : null}

          {dash ? (
            <>
              <div className={styles.financeHero}>
                <div className={styles.financeHeroMain}>
                  <p className={styles.financeHeroLabel}>Чистая прибыль</p>
                  <p className={styles.financeHeroValue}>{formatMoney(dash.net_profit_kopeks)}</p>
                  <p className={styles.financeHeroHint}>
                    Накоплено {formatMoney(dash.accrued_platform_share_kopeks)} · выведено{" "}
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

              <div className={styles.metricGroups}>
                <section className={styles.metricGroup}>
                  <h3 className={styles.metricGroupTitle}>Резерв и обязательства</h3>
                  <div className={styles.metricRow}>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Обязательства</span>
                      <span className={styles.metricValue}>{formatMoney(dash.platform_liabilities_kopeks)}</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>В ожидании</span>
                      <span className={styles.metricValue}>{formatMoney(dash.platform_pending_funds_kopeks)}</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Доступно к выводу</span>
                      <span className={styles.metricValue}>{formatMoney(dash.available_for_payout_kopeks)}</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Выплачено всем</span>
                      <span className={styles.metricValue}>{formatMoney(dash.total_completed_payouts_kopeks)}</span>
                    </div>
                  </div>
                </section>

                <section className={styles.metricGroup}>
                  <h3 className={styles.metricGroupTitle}>Оборот</h3>
                  <div className={styles.metricRow}>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Оборот</span>
                      <span className={styles.metricValue}>{formatMoney(dash.turnover_total_kopeks)}</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Средний чек</span>
                      <span className={styles.metricValue}>{formatMoney(dash.average_order_value_kopeks)}</span>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Средняя комиссия</span>
                      <span className={styles.metricValue}>{formatMoney(dash.average_platform_commission_kopeks)}</span>
                    </div>
                  </div>
                </section>
              </div>

              <div className={styles.sideLayout}>
                <SectionCard title="Оборот и сделки по статусам" lead="Базовая сумма и количество сделок в разрезе статусов.">
                  <TableWrap>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Статус</th>
                          <th>Оборот</th>
                          <th>Сделок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealStatusOrder.map((statusKey) => (
                          <tr key={statusKey}>
                            <td>{formatDealStatus(statusKey)}</td>
                            <td>{formatMoney(dash.turnover_by_status_kopeks[statusKey] ?? 0)}</td>
                            <td>{formatNumber(dash.deal_counts_by_status[statusKey] ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableWrap>
                </SectionCard>

                <SectionCard title="Заработок по ролям" lead="Сумма посделочных начислений по роли получателя.">
                  <TableWrap>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Роль</th>
                          <th>Начислено</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(dash.earnings_by_role_kopeks).map(([role, amount]) => (
                          <tr key={role}>
                            <td>{participantLabel(role)}</td>
                            <td>{formatMoney(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableWrap>
                </SectionCard>
              </div>

              <SectionCard
                title="Динамика по дням"
                lead="Оборот и накопленная доля платформы за день в пределах периода."
              >
                {dash.time_series.length === 0 ? (
                  <Message>За выбранный период данных нет.</Message>
                ) : (
                  <TableWrap>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Оборот</th>
                          <th>Доля платформы</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dash.time_series.map((point) => (
                          <tr key={point.date}>
                            <td>{point.date}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    height: "0.5rem",
                                    borderRadius: "2px",
                                    minWidth: "2px",
                                    width: `${Math.round((point.turnover_kopeks / maxSeriesTurnover) * 100)}%`,
                                    background: "#7fd4a8",
                                  }}
                                  aria-hidden
                                />
                                <span>{formatMoney(point.turnover_kopeks)}</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    height: "0.5rem",
                                    borderRadius: "2px",
                                    minWidth: "2px",
                                    width: `${Math.round((point.accrued_platform_share_kopeks / maxSeriesShare) * 100)}%`,
                                    background: "#a78bff",
                                  }}
                                  aria-hidden
                                />
                                <span>{formatMoney(point.accrued_platform_share_kopeks)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableWrap>
                )}
              </SectionCard>

              <div className={styles.sideLayout}>
                <SectionCard title="Топ блогеров" lead="До 10 блогеров по убыванию заработка.">
                  {dash.top_bloggers.length === 0 ? (
                    <Message>Начислений блогерам пока нет.</Message>
                  ) : (
                    <TableWrap>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Блогер</th>
                            <th>Заработок</th>
                            <th>Сделок</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dash.top_bloggers.map((participant) => (
                            <tr
                              key={participant.user_id}
                              className={styles.selectable}
                              onClick={() => {
                                setSelectedUserId(participant.user_id);
                                setSection("users");
                              }}
                            >
                              <td className={styles.linkCell}>{participant.user_id.slice(0, 8)}…</td>
                              <td>{formatMoney(participant.earnings_kopeks)}</td>
                              <td>{formatNumber(participant.paid_deals_count)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </TableWrap>
                  )}
                </SectionCard>

                <SectionCard title="Топ воркеров" lead="До 10 воркеров по убыванию заработка.">
                  {dash.top_workers.length === 0 ? (
                    <Message>Начислений воркерам пока нет.</Message>
                  ) : (
                    <TableWrap>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Воркер</th>
                            <th>Заработок</th>
                            <th>Сделок</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dash.top_workers.map((participant) => (
                            <tr
                              key={participant.user_id}
                              className={styles.selectable}
                              onClick={() => {
                                setSelectedUserId(participant.user_id);
                                setSection("users");
                              }}
                            >
                              <td className={styles.linkCell}>{participant.user_id.slice(0, 8)}…</td>
                              <td>{formatMoney(participant.earnings_kopeks)}</td>
                              <td>{formatNumber(participant.paid_deals_count)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </TableWrap>
                  )}
                </SectionCard>
              </div>

              <div className={styles.sideLayout}>
                <SectionCard title="Реферальная аналитика" lead="Начисленная реферальная доля аплайнам и активные связи.">
                  <Stack>
                    <PillRow>
                      <Pill>
                        Всего аплайнам: {formatMoney(dash.total_referral_share_to_uplines_kopeks)}
                      </Pill>
                      <Pill>Блогеров с аплайном: {formatNumber(dash.active_referral_links.bloggers_with_upline)}</Pill>
                      <Pill>Воркеров со связью: {formatNumber(dash.active_referral_links.workers_with_link)}</Pill>
                    </PillRow>
                    {dash.referral_share_by_blogger.length === 0 ? (
                      <Message>Реферальных начислений пока нет.</Message>
                    ) : (
                      <TableWrap>
                        <DataTable>
                          <thead>
                            <tr>
                              <th>Аплайн-блогер</th>
                              <th>Начислено</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dash.referral_share_by_blogger.map((row) => (
                              <tr key={row.upline_blogger_id}>
                                <td>{row.upline_blogger_id.slice(0, 8)}…</td>
                                <td>{formatMoney(row.amount_kopeks)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </DataTable>
                      </TableWrap>
                    )}
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="Ожидаемые начисления"
                  lead="Итог по сделкам в статусе CONFIRMED и будущие доли по участникам."
                >
                  <Stack>
                    <PillRow>
                      <Pill tone="accent">Итого: {formatMoney(dash.expected_accruals_total_kopeks)}</Pill>
                    </PillRow>
                    <TableWrap>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Участник</th>
                            <th>Будущая доля</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(dash.expected_future_shares_kopeks).map(([key, amount]) => (
                            <tr key={key}>
                              <td>{participantLabel(key)}</td>
                              <td>{formatMoney(amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </TableWrap>
                  </Stack>
                </SectionCard>
              </div>
            </>
          ) : null}
        </Stack>
      );
    }

    if (section === "scripts") {
      return (
        <div className={styles.sideLayout}>
          <Stack>
            <SectionCard title="Список скриптов" lead="Сортировка по полю sort_order.">
              <div className={styles.compactList}>
                {(scriptsQuery.data || []).map((script) => (
                  <article
                    key={script.id}
                    className={`${styles.scriptRow}${selectedScriptId === script.id ? ` ${styles.selected}` : ""}`}
                    onClick={() => setSelectedScriptId(script.id)}
                  >
                    <h3>{script.title}</h3>
                    <p>{script.body}</p>
                  </article>
                ))}
                {(scriptsQuery.data || []).length === 0 ? <Message>Скриптов пока нет — создайте первый.</Message> : null}
              </div>
            </SectionCard>
          </Stack>

          <SectionCard
            title={activeScript ? "Редактор скрипта" : "Новый скрипт"}
            actions={
              <Button
                type="button"
                kind="ghost"
                onClick={() => {
                  setSelectedScriptId("");
                  setScriptForm(emptyScriptForm);
                }}
              >
                Создать новый
              </Button>
            }
          >
            <Stack>
              <Field label="Заголовок">
                <TextInput value={scriptForm.title} onChange={(event) => setScriptForm((current) => ({ ...current, title: event.target.value }))} />
              </Field>
              <Field label="Текст скрипта">
                <TextArea value={scriptForm.body} onChange={(event) => setScriptForm((current) => ({ ...current, body: event.target.value }))} />
              </Field>
              <Field label="Порядок">
                <TextInput value={scriptForm.sort_order} onChange={(event) => setScriptForm((current) => ({ ...current, sort_order: event.target.value }))} />
              </Field>
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  onClick={() => (activeScript ? patchScriptMutation.mutate() : createScriptMutation.mutate())}
                  disabled={patchScriptMutation.isPending || createScriptMutation.isPending}
                >
                  {activeScript ? "Сохранить скрипт" : "Создать скрипт"}
                </Button>
                {activeScript ? (
                  <Button
                    type="button"
                    kind="secondary"
                    onClick={() => setModal({ kind: "delete-script", script: activeScript })}
                  >
                    Удалить
                  </Button>
                ) : null}
              </div>
            </Stack>
          </SectionCard>
        </div>
      );
    }

    if (section === "telegram") {
      const stats = telegramStatsQuery.data;
      return (
        <div>
          <StatsGrid>
            <StatCard label="Всего подписок" value={stats ? formatNumber(stats.total) : "—"} />
            <StatCard label="Сегодня" value={stats ? formatNumber(stats.today) : "—"} />
            <StatCard label="За неделю" value={stats ? formatNumber(stats.this_week) : "—"} />
            <StatCard label="За месяц" value={stats ? formatNumber(stats.this_month) : "—"} />
          </StatsGrid>

          <div style={{ marginTop: "1.2rem" }}>
          <SectionCard title="Настройки канала">
            <Stack>
              <Field label="ID канала (напр. @channel или -100...)">
                <TextInput
                  value={telegramForm.channel_id}
                  onChange={(e) => setTelegramForm((f) => ({ ...f, channel_id: e.target.value }))}
                  placeholder="@my_channel"
                />
              </Field>
              <Field label="Название канала">
                <TextInput
                  value={telegramForm.channel_title}
                  onChange={(e) => setTelegramForm((f) => ({ ...f, channel_title: e.target.value }))}
                  placeholder="Мой Telegram канал"
                />
              </Field>
              <Field label="Ссылка на канал (t.me/...)">
                <TextInput
                  value={telegramForm.channel_url}
                  onChange={(e) => setTelegramForm((f) => ({ ...f, channel_url: e.target.value }))}
                  placeholder="https://t.me/my_channel"
                />
              </Field>
              <Field label="Подписка обязательна">
                <SelectInput
                  value={telegramForm.is_enabled ? "yes" : "no"}
                  onChange={(e) => setTelegramForm((f) => ({ ...f, is_enabled: e.target.value === "yes" }))}
                >
                  <option value="yes">Да — без подписки не зарегистрироваться</option>
                  <option value="no">Нет — подписка не требуется</option>
                </SelectInput>
              </Field>
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  onClick={() => telegramConfigMutation.mutate()}
                  disabled={telegramConfigMutation.isPending}
                >
                  {telegramConfigMutation.isPending ? "Сохраняем…" : "Сохранить настройки"}
                </Button>
              </div>
            </Stack>
          </SectionCard>
          </div>
        </div>
      );
    }

    return null;
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"operations" | "settings" | null>(null);
  const hoverTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = (menu: "operations" | "settings") => {
    if (hoverTimeout.current) { clearTimeout(hoverTimeout.current); hoverTimeout.current = null; }
    setActiveMenu(menu);
    setDrawerOpen(true);
  };

  const closeMenu = () => {
    hoverTimeout.current = setTimeout(() => {
      setActiveMenu(null);
      setDrawerOpen(false);
    }, 200);
  };

  const cancelClose = () => {
    if (hoverTimeout.current) { clearTimeout(hoverTimeout.current); hoverTimeout.current = null; }
  };

  return (
    <PageSurface>
      <TopNav
        brandSub="админ-панель"
        actions={
          <>
            <NavLink href="/">На главную</NavLink>
            <button type="button" className={styles.navLogout} onClick={() => void logout()}>
              Выйти
            </button>
          </>
        }
      >
        <button
          type="button"
          className={`${styles.headerSection}${section === "overview" ? ` ${styles.headerSectionActive}` : ""}`}
          onClick={() => { setSection("overview"); setActiveMenu(null); setDrawerOpen(false); }}
        >
          Обзор
        </button>
        <div
          className={styles.headerDropdownWrap}
          onMouseEnter={() => openMenu("operations")}
          onMouseLeave={closeMenu}
        >
          <button
            type="button"
            className={`${styles.headerSection}${section === "users" || section === "deals" || section === "ledger" ? ` ${styles.headerSectionActive}` : ""}${activeMenu === "operations" ? ` ${styles.headerSectionHover}` : ""}`}
            onClick={() => { activeMenu === "operations" ? (setActiveMenu(null), setDrawerOpen(false)) : openMenu("operations"); }}
          >
            Операции
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={activeMenu === "operations" ? styles.chevronOpen : undefined}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {activeMenu === "operations" && (
            <div className={styles.dropdown} onMouseEnter={cancelClose} onMouseLeave={closeMenu}>
              {(["overview", "users", "deals", "ledger"] as AdminSection[]).map((key) => {
                const meta = sectionMeta[key];
                if (key === "overview") return null;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.dropdownItem}${section === key ? ` ${styles.dropdownItemActive}` : ""}`}
                    onClick={() => { setSection(key); setActiveMenu(null); setDrawerOpen(false); }}
                  >
                    <span className={styles.dropdownItemLabel}>{meta.label}</span>
                    <span className={styles.dropdownItemDesc}>{meta.lead}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div
          className={styles.headerDropdownWrap}
          onMouseEnter={() => openMenu("settings")}
          onMouseLeave={closeMenu}
        >
          <button
            type="button"
            className={`${styles.headerSection}${section === "schemes" || section === "finance" || section === "scripts" || section === "telegram" ? ` ${styles.headerSectionActive}` : ""}${activeMenu === "settings" ? ` ${styles.headerSectionHover}` : ""}`}
            onClick={() => { activeMenu === "settings" ? (setActiveMenu(null), setDrawerOpen(false)) : openMenu("settings"); }}
          >
            Настройки
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={activeMenu === "settings" ? styles.chevronOpen : undefined}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {activeMenu === "settings" && (
            <div className={styles.dropdown} onMouseEnter={cancelClose} onMouseLeave={closeMenu}>
              {(["schemes", "finance", "scripts", "telegram"] as AdminSection[]).map((key) => {
                const meta = sectionMeta[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.dropdownItem}${section === key ? ` ${styles.dropdownItemActive}` : ""}`}
                    onClick={() => { setSection(key); setActiveMenu(null); setDrawerOpen(false); }}
                  >
                    <span className={styles.dropdownItemLabel}>{meta.label}</span>
                    <span className={styles.dropdownItemDesc}>{meta.lead}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </TopNav>

      {/* Drawer removed — dropdown menus handle navigation now */}

      <div className={styles.shell}>
        <div className={styles.workspace}>
          <header className={styles.heroBar}>
            <div>
              <h1>{sectionMeta[section].title}</h1>
              <p>{sectionMeta[section].lead}</p>
            </div>
          </header>

          {message ? <Message tone={message.tone}>{message.text}</Message> : null}

          {sectionContent()}
        </div>
      </div>

      {renderModal()}
    </PageSurface>
  );
};
