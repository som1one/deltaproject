"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  formatDateTime,
  formatDealStatus,
  formatLedgerStatus,
  formatMoney,
  formatNumber,
  formatRole,
} from "@/lib/format";
import type {
  AdminMarketplaceBloggerProfile,
  AdminUserRead,
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
import { ChartRangeSwitch, DailyBarsChart, type ChartRange } from "@/components/admin/stat-charts";
import { CopyButton } from "@/components/common/copy-button";
import { AdminMarketplacePanel, type AdminMarketplaceTab } from "@/components/admin/marketplace-panel";

type AdminSection =
  | "overview" | "stats" | "users" | "user-ledger" | "user-balance" | "user-card" | "create-blogger" | "ledger" | "finance" | "finance-analytics" | "scripts" | "telegram"
  | "mp-dashboard" | "mp-stats" | "mp-orders" | "mp-payments" | "mp-settings" | "mp-tickets" | "mp-bloggers" | "mp-services" | "mp-moderation" | "mp-premium" | "mp-hero" | "mp-withdrawals";

type AdminModalState =
  | { kind: "delete-user"; user: AdminUserRead }
  | { kind: "ledger-status"; entry: LedgerEntryRead; status: string; note: string }
  | { kind: "payout-complete"; entry: LedgerEntryRead }
  | { kind: "delete-script"; script: WorkerMessageScriptRead }
  | { kind: "blogger-created"; nickname: string; password: string }
  | { kind: "ban-user"; user: AdminUserRead; reason: string }
  | null;

const emptyUserForm = {
  name: "",
  email: "",
  telegram: "",
  nickname: "",
  photo_url: "",
  role: "Worker",
  is_active: true,
  blogger_cabinet_pin: "",
  new_password: "",
};

const emptyMpProfileForm = {
  photo_url: "",
  category: "other",
  description: "",
  subscriber_count: "",
  average_price_rub: "",
  is_active: true,
  orders_enabled: true,
};

const MP_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "lifestyle", label: "Лайфстайл" },
  { value: "tech", label: "Технологии" },
  { value: "beauty", label: "Красота" },
  { value: "food", label: "Еда" },
  { value: "travel", label: "Путешествия" },
  { value: "fitness", label: "Фитнес" },
  { value: "gaming", label: "Игры" },
  { value: "education", label: "Образование" },
  { value: "business", label: "Бизнес" },
  { value: "entertainment", label: "Развлечения" },
  { value: "other", label: "Другое" },
];

type UsersRoleFilter = "all" | "Worker" | "Bloger" | "Client" | "admins";

const USERS_PAGE_SIZE = 50;

const userStatusLabel = (user: Pick<AdminUserRead, "is_active" | "banned_at">) =>
  user.banned_at ? "Бан" : user.is_active ? "Активен" : "Отключён";

const emptyBloggerForm = {
  nickname: "",
  name: "",
  telegram: "",
};

const emptyScriptForm = {
  title: "",
  body: "",
  category: "Общие",
  keywords: "",
  sort_order: "0",
};

const sectionMeta: Record<AdminSection, { label: string; title: string; lead: string }> = {
  overview: {
    label: "Обзор",
    title: "Обзор площадки",
    lead: "Сводная статистика по пользователям и балансам.",
  },
  stats: {
    label: "Статистика",
    title: "Статистика",
    lead: "Приток людей по дням: подписки на канал и активность входов. Раздел будет пополняться новыми графиками.",
  },
  users: {
    label: "Пользователи",
    title: "Пользователи",
    lead: "Единое управление: воркеры, блогеры, заказчики и администраторы. Профили, баланс, бан.",
  },
  ledger: {
    label: "Леджер",
    title: "Леджер и выплаты",
    lead: "Все начисления и запросы на выплаты. Подтверждайте выплаты вручную.",
  },
  finance: {
    label: "Финансы платформы",
    title: "Сводка платформы",
    lead: "Прибыль, баланс, обязательства и оборот за выбранный период.",
  },
  "finance-analytics": {
    label: "Аналитика",
    title: "Финансовая аналитика",
    lead: "Обороты по статусам, заработок по ролям, динамика и топы.",
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
  "create-blogger": {
    label: "Создать блогера",
    title: "Создание блогера",
    lead: "Создаёт нового блогера. Пароль выдаётся автоматически — сохраните его сразу.",
  },
  "user-ledger": {
    label: "Леджер пользователя",
    title: "Леджер пользователя",
    lead: "Начисления и списания выбранного пользователя.",
  },
  "user-balance": {
    label: "Корректировка баланса",
    title: "Корректировка баланса",
    lead: "Сумма в рублях (можно отрицательную). Создаётся запись в журнале с указанной причиной.",
  },
  "user-card": {
    label: "Карта партнёра",
    title: "Карта партнёра",
    lead: "Номер карты (13–19 цифр). Сохраняются только последние 4 цифры.",
  },
  "mp-dashboard": {
    label: "Дашборд",
    title: "Маркетплейс — сводка",
    lead: "Заказы, выручка, активные авторы и клиенты биржи.",
  },
  "mp-stats": {
    label: "Статистика",
    title: "Маркетплейс — статистика",
    lead: "Оборот, воронка, топы, активность и обслуживание — вся аналитика биржи.",
  },
  "mp-orders": {
    label: "Заказы",
    title: "Заказы маркетплейса",
    lead: "Подтверждение оплаты, решение споров и возвраты.",
  },
  "mp-withdrawals": {
    label: "Выводы",
    title: "Выводы средств",
    lead: "Запросы блогеров и воркеров на вывод заработка. Переведите деньги на карту и подтвердите выплату.",
  },
  "mp-payments": {
    label: "Оплата",
    title: "Приём оплаты",
    lead: "Карта, СБП, расчётный счёт и онлайн-оплата через ЮKassa.",
  },
  "mp-settings": {
    label: "Комиссии",
    title: "Комиссии маркетплейса",
    lead: "Процент платформы и реферальная комиссия воркера.",
  },
  "mp-tickets": {
    label: "Тикеты",
    title: "Тикеты поддержки",
    lead: "Вопросы закрываются с ответом; споры по активным сделкам решаются в пользу заказчика или автора.",
  },
  "mp-bloggers": {
    label: "Авторы",
    title: "Авторы маркетплейса",
    lead: "Активность в каталоге, ER и рейтинг авторов.",
  },
  "mp-services": {
    label: "Услуги",
    title: "Реестр услуг",
    lead: "Единый список услуг, на которые авторы задают цены.",
  },
  "mp-moderation": {
    label: "Модерация",
    title: "Модерация аудитории",
    lead: "Заявки авторов на подтверждение данных аудитории.",
  },
  "mp-premium": {
    label: "Премиум",
    title: "Премиум-размещение",
    lead: "Заявки авторов на премиум и их статусы.",
  },
  "mp-hero": {
    label: "Витрина",
    title: "Витрина лендинга",
    lead: "Ниши и авторы, которые показываются на главной странице.",
  },
};

export const AdminDashboard = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isHydrated, isAuthenticated, logout } = useAuth();

  const [section, setSection] = useState<AdminSection>("overview");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedLedgerId, setSelectedLedgerId] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [userRoleFilter, setUserRoleFilter] = useState<UsersRoleFilter>("all");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [usersPage, setUsersPage] = useState(0);
  const [mpProfileForm, setMpProfileForm] = useState(emptyMpProfileForm);
  const [bloggerForm, setBloggerForm] = useState(emptyBloggerForm);
  const [scriptForm, setScriptForm] = useState(emptyScriptForm);
  const [modal, setModal] = useState<AdminModalState>(null);
  const [financePeriod, setFinancePeriod] = useState<ReportingPeriod>("all");
  const [balanceAdjustForm, setBalanceAdjustForm] = useState({ amountRub: "", reason: "" });
  const [partnerCardForm, setPartnerCardForm] = useState("");

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: isHydrated && isAuthenticated,
  });
  const overviewQuery = useQuery({ queryKey: ["admin", "overview"], queryFn: api.getAdminOverview, enabled: Boolean(isAuthenticated) });
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.getAdminUsers(), enabled: Boolean(isAuthenticated) });

  // Единый раздел «Пользователи»: серверный фильтр по ролям + поиск + пагинация.
  const usersFilterQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (userRoleFilter === "admins") {
      params.append("role", "Admin");
      params.append("role", "Tech_Admin");
    } else if (userRoleFilter !== "all") {
      params.append("role", userRoleFilter);
    }
    if (userSearch.trim()) {
      params.set("email", userSearch.trim());
    }
    params.set("limit", String(USERS_PAGE_SIZE));
    params.set("offset", String(usersPage * USERS_PAGE_SIZE));
    return `?${params.toString()}`;
  }, [userRoleFilter, userSearch, usersPage]);
  const usersFilteredQuery = useQuery({
    queryKey: ["admin", "usersFiltered", usersFilterQueryString],
    queryFn: () => api.getAdminUsers(usersFilterQueryString),
    enabled: Boolean(isAuthenticated),
  });
  const ledgerQuery = useQuery({ queryKey: ["admin", "ledger"], queryFn: () => api.getAdminLedger(), enabled: Boolean(isAuthenticated) });
  const scriptsQuery = useQuery({
    queryKey: ["admin", "workerScripts"],
    queryFn: api.getAdminWorkerScripts,
    enabled: Boolean(isAuthenticated),
  });

  // Статистика: дневные ряды для графиков
  const [statsRange, setStatsRange] = useState<ChartRange>(30);
  const statsSubsDailyQuery = useQuery({
    queryKey: ["admin", "statsSubsDaily", statsRange],
    queryFn: () => api.getAdminTelegramChannelDailyStats(statsRange),
    enabled: Boolean(isAuthenticated) && section === "stats",
  });
  const statsLoginsDailyQuery = useQuery({
    queryKey: ["admin", "statsLoginsDaily", statsRange],
    queryFn: () => api.getAdminDailyLogins(statsRange),
    enabled: Boolean(isAuthenticated) && section === "stats",
  });

  const memberCountQuery = useQuery({
    queryKey: ["admin", "telegramMemberCount"],
    queryFn: api.getAdminTelegramChannelMemberCount,
    enabled: Boolean(isAuthenticated) && (section === "stats" || section === "telegram"),
    staleTime: 60_000,
  });
  // Диагностика доступа бота — только по кнопке в разделе Telegram
  const diagnoseQuery = useQuery({
    queryKey: ["admin", "telegramDiagnose"],
    queryFn: api.diagnoseAdminTelegramChannel,
    enabled: false,
    retry: false,
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
    // Статистика кабинета есть только у воркеров и блогеров.
    enabled:
      Boolean(selectedUserId) &&
      (userDetailQuery.data?.role === "Worker" || userDetailQuery.data?.role === "Bloger"),
  });
  // Маркетплейс-профиль автора: 404 = профиль ещё не создан, не ретраим.
  const mpProfileQuery = useQuery({
    queryKey: ["admin", "mpProfile", selectedUserId],
    queryFn: () => api.getAdminUserMarketplaceProfile(selectedUserId),
    enabled: Boolean(selectedUserId) && userDetailQuery.data?.role === "Bloger",
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });
  const userLedgerQuery = useQuery({
    queryKey: ["admin", "userLedger", selectedUserId],
    queryFn: () => api.getAdminUserLedger(selectedUserId),
    enabled: Boolean(selectedUserId),
  });
  const ledgerDetailQuery = useQuery({
    queryKey: ["admin", "ledgerEntry", selectedLedgerId],
    queryFn: () => api.getAdminLedgerEntry(selectedLedgerId),
    enabled: Boolean(selectedLedgerId),
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
    // Дип-линк вида /admin?section=mp-payments (используется редиректом со старого /admin/marketplace).
    const requested = new URLSearchParams(window.location.search).get("section");
    if (requested && requested in sectionMeta) {
      setSection(requested as AdminSection);
    }
  }, []);

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.items.length) {
      setSelectedUserId(usersQuery.data.items[0].id);
    }
  }, [selectedUserId, usersQuery.data]);

  useEffect(() => {
    if (!selectedLedgerId && ledgerQuery.data?.items.length) {
      setSelectedLedgerId(ledgerQuery.data.items[0].id);
    }
  }, [ledgerQuery.data, selectedLedgerId]);

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
        photo_url: userDetailQuery.data.photo_url || "",
        role: userDetailQuery.data.role,
        is_active: userDetailQuery.data.is_active,
        blogger_cabinet_pin: "",
        new_password: "",
      });
    }
  }, [userDetailQuery.data]);

  useEffect(() => {
    // Поиск по пользователям — с задержкой, чтобы не дёргать API на каждый символ.
    const timer = window.setTimeout(() => {
      setUserSearch(userSearchInput);
      setUsersPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [userSearchInput]);

  useEffect(() => {
    if (mpProfileQuery.data) {
      setMpProfileForm({
        photo_url: mpProfileQuery.data.photo_url || "",
        category: mpProfileQuery.data.category || "other",
        description: mpProfileQuery.data.description || "",
        subscriber_count: String(mpProfileQuery.data.subscriber_count),
        average_price_rub: String(Math.round(mpProfileQuery.data.average_price_kopeks / 100)),
        is_active: mpProfileQuery.data.is_active,
        orders_enabled: mpProfileQuery.data.orders_enabled,
      });
    } else {
      setMpProfileForm(emptyMpProfileForm);
    }
  }, [mpProfileQuery.data]);

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
        category: activeScript.category,
        keywords: activeScript.keywords.join(", "),
        sort_order: String(activeScript.sort_order),
      });
    }
  }, [scriptsQuery.data, selectedScriptId]);

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
        role: userForm.role,
        is_active: userForm.is_active,
        blogger_cabinet_pin: userForm.blogger_cabinet_pin || undefined,
      };
      if (userForm.new_password.trim()) {
        payload.new_password = userForm.new_password.trim();
      }
      if (isBlogger) {
        payload.nickname = userForm.nickname || null;
      } else {
        // Аватар живёт на User только вне блогеров (у авторов — в маркетплейс-профиле).
        payload.photo_url = userForm.photo_url.trim();
        if (userForm.email.trim()) {
          payload.email = userForm.email.trim();
        }
      }
      return api.patchAdminUser(selectedUserId, payload);
    },
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Пользователь обновлён." });
      await invalidateAdmin(
        ["admin", "users"],
        ["admin", "usersFiltered"],
        ["admin", "user", selectedUserId],
        ["admin", "userStats", selectedUserId],
        ["admin", "overview"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const banUserMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.banAdminUser(id, { reason: reason.trim() }),
    onSuccess: async (_data, variables) => {
      setMessage({ tone: "success", text: "Пользователь забанен." });
      setModal(null);
      await invalidateAdmin(
        ["admin", "users"],
        ["admin", "usersFiltered"],
        ["admin", "user", variables.id],
        ["admin", "userAudit", variables.id],
        ["admin", "overview"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const unbanUserMutation = useMutation({
    mutationFn: (id: string) => api.unbanAdminUser(id),
    onSuccess: async (_data, id) => {
      setMessage({ tone: "success", text: "Бан снят, аккаунт активен." });
      await invalidateAdmin(
        ["admin", "users"],
        ["admin", "usersFiltered"],
        ["admin", "user", id],
        ["admin", "userAudit", id],
        ["admin", "overview"],
      );
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const mpProfileMutation = useMutation({
    mutationFn: () => {
      const profileId = mpProfileQuery.data?.id;
      if (!profileId) {
        return Promise.reject(new Error("Профиль маркетплейса не загружен"));
      }
      const subscribers = Math.round(Number(mpProfileForm.subscriber_count));
      const priceKopeks = Math.round(Number(mpProfileForm.average_price_rub) * 100);
      return api.patchAdminMarketplaceBlogger(profileId, {
        photo_url: mpProfileForm.photo_url.trim() || null,
        category: mpProfileForm.category,
        description: mpProfileForm.description.trim(),
        subscriber_count: subscribers,
        average_price_kopeks: priceKopeks,
        is_active: mpProfileForm.is_active,
        orders_enabled: mpProfileForm.orders_enabled,
      });
    },
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Профиль маркетплейса обновлён." });
      await invalidateAdmin(["admin", "mpProfile", selectedUserId]);
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
        ["admin", "usersFiltered"],
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
      await invalidateAdmin(["admin", "users"], ["admin", "usersFiltered"], ["admin", "overview"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminUser(id),
    onSuccess: async () => {
      setMessage({ tone: "success", text: "Пользователь удалён." });
      setModal(null);
      setSelectedUserId("");
      await invalidateAdmin(["admin", "users"], ["admin", "usersFiltered"], ["admin", "overview"]);
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

  const createScriptMutation = useMutation({
    mutationFn: () =>
      api.createAdminWorkerScript({
        title: scriptForm.title,
        body: scriptForm.body,
        category: scriptForm.category,
        keywords: scriptForm.keywords.split(",").map((k) => k.trim()).filter(Boolean),
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
        category: scriptForm.category,
        keywords: scriptForm.keywords.split(",").map((k) => k.trim()).filter(Boolean),
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
      await invalidateAdmin(["admin", "telegramMemberCount"]);
    },
    onError: (error) => setMessage({ tone: "error", text: error.message }),
  });

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
      case "ban-user":
        return (
          <Modal
            title="Забанить пользователя"
            onClose={() => setModal(null)}
            actions={
              <>
                <Button type="button" kind="ghost" onClick={() => setModal(null)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => banUserMutation.mutate({ id: modal.user.id, reason: modal.reason })}
                  disabled={banUserMutation.isPending || modal.reason.trim().length === 0}
                >
                  {banUserMutation.isPending ? "Баним…" : "Забанить"}
                </Button>
              </>
            }
          >
            <Stack>
              <Message tone="error">
                {modal.user.nickname || modal.user.name || modal.user.email} сразу потеряет доступ: действующие
                сессии и вход на маркетплейс будут закрыты.
              </Message>
              <Field label="Причина" help="Пользователь увидит её при попытке входа; причина попадёт в аудит.">
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
                <CopyButton
                  value={`Nick: ${modal.nickname}\nPassword: ${modal.password}`}
                  label="Скопировать ник и пароль"
                  toastText="Ник и пароль скопированы"
                  kind="secondary"
                />
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
              <StatCard label="Баланс системы" value={formatMoney(overviewQuery.data.balance_total_kopeks)} />
            </StatsGrid>
          ) : (
            <Message>Загружаем сводку…</Message>
          )}
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
      const usersPageItems = usersFilteredQuery.data?.items ?? [];
      const usersTotal = usersFilteredQuery.data?.total ?? 0;
      const usersFrom = usersTotal === 0 ? 0 : usersPage * USERS_PAGE_SIZE + 1;
      const usersTo = usersPage * USERS_PAGE_SIZE + usersPageItems.length;
      const targetUser = userDetailQuery.data ?? null;
      const targetIsAdminRole = targetUser
        ? targetUser.role === "Admin" || targetUser.role === "Tech_Admin"
        : false;
      const canModerateTarget = Boolean(
        targetUser && targetUser.id !== meQuery.data?.id && (currentUserIsOwner || !targetIsAdminRole),
      );
      return (
        <div className={styles.sideLayout}>
          <SectionCard
            title="Список пользователей"
            lead="Фильтр по роли и поиск по email, нику или имени. Кликните по строке, чтобы открыть редактор."
          >
            <Stack>
              <TwoColumn>
                <Field label="Роль">
                  <SelectInput
                    value={userRoleFilter}
                    onChange={(event) => {
                      setUserRoleFilter(event.target.value as UsersRoleFilter);
                      setUsersPage(0);
                    }}
                  >
                    <option value="all">Все роли</option>
                    <option value="Worker">Работники</option>
                    <option value="Bloger">Блогеры</option>
                    <option value="Client">Заказчики</option>
                    <option value="admins">Администраторы</option>
                  </SelectInput>
                </Field>
                <Field label="Поиск">
                  <TextInput
                    value={userSearchInput}
                    placeholder="Email, ник или имя"
                    onChange={(event) => setUserSearchInput(event.target.value)}
                  />
                </Field>
              </TwoColumn>
              {usersFilteredQuery.data ? (
                usersPageItems.length === 0 ? (
                  <Message>Никого не нашли — измените фильтр или запрос.</Message>
                ) : (
                  <TableWrap>
                    <DataTable>
                      <thead>
                        <tr>
                          <th>Пользователь</th>
                          <th>Роль</th>
                          <th>Баланс</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersPageItems.map((user) => (
                          <tr
                            key={user.id}
                            className={`${styles.selectable}${selectedUserId === user.id ? ` ${styles.selected}` : ""}`}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <td>
                              <strong>{user.nickname || user.name || user.email}</strong>
                              <br />
                              <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>{user.email}</span>
                            </td>
                            <td>{formatRole(user.role)}</td>
                            <td>
                              {formatMoney(user.balance)}
                              {user.marketplace_balance_kopeks > 0 ? (
                                <>
                                  <br />
                                  <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
                                    МП: {formatMoney(user.marketplace_balance_kopeks)}
                                  </span>
                                </>
                              ) : null}
                            </td>
                            <td>{userStatusLabel(user)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </TableWrap>
                )
              ) : (
                <Message>Загружаем пользователей…</Message>
              )}
              {usersTotal > USERS_PAGE_SIZE ? (
                <div className={styles.actionRow}>
                  <Button
                    type="button"
                    kind="ghost"
                    disabled={usersPage === 0}
                    onClick={() => setUsersPage((current) => Math.max(0, current - 1))}
                  >
                    Назад
                  </Button>
                  <Pill>
                    {usersFrom}–{usersTo} из {usersTotal}
                  </Pill>
                  <Button
                    type="button"
                    kind="ghost"
                    disabled={usersTo >= usersTotal}
                    onClick={() => setUsersPage((current) => current + 1)}
                  >
                    Вперёд
                  </Button>
                </div>
              ) : null}
            </Stack>
          </SectionCard>

          <SectionCard
            title="Редактор пользователя"
            lead={userDetailQuery.data ? `${userDetailQuery.data.email}` : "Выберите пользователя слева."}
            actions={
              targetUser ? (
                <>
                  {canModerateTarget ? (
                    targetUser.banned_at ? (
                      <Button
                        type="button"
                        kind="secondary"
                        onClick={() => unbanUserMutation.mutate(targetUser.id)}
                        disabled={unbanUserMutation.isPending}
                      >
                        {unbanUserMutation.isPending ? "Снимаем…" : "Разбанить"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        kind="ghost"
                        onClick={() => setModal({ kind: "ban-user", user: targetUser, reason: "" })}
                      >
                        Забанить
                      </Button>
                    )
                  ) : null}
                  {currentUserIsOwner ? (
                    <Button type="button" kind="ghost" onClick={() => setModal({ kind: "delete-user", user: targetUser })}>
                      Удалить
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          >
            {userDetailQuery.data ? (
              <Stack>
                {userDetailQuery.data.banned_at ? (
                  <Message tone="error">
                    Забанен {formatDateTime(userDetailQuery.data.banned_at)}
                    {userDetailQuery.data.ban_reason ? ` — ${userDetailQuery.data.ban_reason}` : ""}. Вход и доступ к
                    API закрыты до снятия бана.
                  </Message>
                ) : null}
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
                  {userForm.role !== "Bloger" ? (
                    <Field label="Фото (URL)" help="Аватар аккаунта. Пустая строка убирает фото.">
                      <TextInput
                        value={userForm.photo_url}
                        onChange={(event) => setUserForm((current) => ({ ...current, photo_url: event.target.value }))}
                      />
                    </Field>
                  ) : null}
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
                      <option value="Client">Заказчик</option>
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
                  <Field label="Новый пароль" help="Оставьте пустым, чтобы не менять. Минимум 8 символов.">
                    <TextInput
                      type="password"
                      value={userForm.new_password}
                      onChange={(event) => setUserForm((current) => ({ ...current, new_password: event.target.value }))}
                      placeholder="Введите новый пароль"
                      autoComplete="new-password"
                    />
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
                {userDetailQuery.data.marketplace_balance_kopeks > 0 ? (
                  <PillRow>
                    <Pill tone="accent">Баланс маркетплейса: {formatMoney(userDetailQuery.data.marketplace_balance_kopeks)}</Pill>
                  </PillRow>
                ) : null}
                {userDetailQuery.data.role === "Bloger" ? (
                  <SectionCard
                    title="Профиль на маркетплейсе"
                    lead="Публичная карточка автора в каталоге: фото, категория, описание, цена и видимость."
                  >
                    {mpProfileQuery.data ? (
                      <Stack>
                        <TwoColumn>
                          <Field label="Фото (URL)">
                            <TextInput
                              value={mpProfileForm.photo_url}
                              onChange={(event) =>
                                setMpProfileForm((current) => ({ ...current, photo_url: event.target.value }))
                              }
                            />
                          </Field>
                          <Field label="Категория">
                            <SelectInput
                              value={mpProfileForm.category}
                              onChange={(event) =>
                                setMpProfileForm((current) => ({ ...current, category: event.target.value }))
                              }
                            >
                              {MP_CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                              {MP_CATEGORY_OPTIONS.some((option) => option.value === mpProfileForm.category) ? null : (
                                <option value={mpProfileForm.category}>{mpProfileForm.category}</option>
                              )}
                            </SelectInput>
                          </Field>
                          <Field label="Подписчики">
                            <TextInput
                              value={mpProfileForm.subscriber_count}
                              inputMode="numeric"
                              onChange={(event) =>
                                setMpProfileForm((current) => ({ ...current, subscriber_count: event.target.value }))
                              }
                            />
                          </Field>
                          <Field label="Средняя цена, ₽">
                            <TextInput
                              value={mpProfileForm.average_price_rub}
                              inputMode="decimal"
                              onChange={(event) =>
                                setMpProfileForm((current) => ({ ...current, average_price_rub: event.target.value }))
                              }
                            />
                          </Field>
                          <Field label="Видимость в каталоге">
                            <SelectInput
                              value={mpProfileForm.is_active ? "active" : "hidden"}
                              onChange={(event) =>
                                setMpProfileForm((current) => ({ ...current, is_active: event.target.value === "active" }))
                              }
                            >
                              <option value="active">Показывается</option>
                              <option value="hidden">Скрыт</option>
                            </SelectInput>
                          </Field>
                          <Field label="Приём заказов">
                            <SelectInput
                              value={mpProfileForm.orders_enabled ? "enabled" : "disabled"}
                              onChange={(event) =>
                                setMpProfileForm((current) => ({
                                  ...current,
                                  orders_enabled: event.target.value === "enabled",
                                }))
                              }
                            >
                              <option value="enabled">Принимает</option>
                              <option value="disabled">Приостановлен</option>
                            </SelectInput>
                          </Field>
                        </TwoColumn>
                        <Field label="Описание" help="До 500 символов, показывается в карточке автора.">
                          <TextArea
                            value={mpProfileForm.description}
                            onChange={(event) =>
                              setMpProfileForm((current) => ({ ...current, description: event.target.value }))
                            }
                          />
                        </Field>
                        <PillRow>
                          {mpProfileQuery.data.rating !== null ? <Pill>Рейтинг: {mpProfileQuery.data.rating}</Pill> : null}
                          <Pill>Отзывов: {formatNumber(mpProfileQuery.data.reviews_count)}</Pill>
                          {mpProfileQuery.data.engagement_rate !== null ? (
                            <Pill>ER: {mpProfileQuery.data.engagement_rate}%</Pill>
                          ) : null}
                        </PillRow>
                        <div className={styles.actionRow}>
                          <Button
                            type="button"
                            onClick={() => mpProfileMutation.mutate()}
                            disabled={
                              mpProfileMutation.isPending ||
                              mpProfileForm.description.trim().length === 0 ||
                              !Number.isFinite(Number(mpProfileForm.subscriber_count)) ||
                              Math.round(Number(mpProfileForm.subscriber_count)) < 1 ||
                              !Number.isFinite(Number(mpProfileForm.average_price_rub)) ||
                              Math.round(Number(mpProfileForm.average_price_rub) * 100) < 100
                            }
                          >
                            {mpProfileMutation.isPending ? "Сохраняем…" : "Сохранить профиль маркетплейса"}
                          </Button>
                        </div>
                      </Stack>
                    ) : mpProfileQuery.isLoading ? (
                      <Message>Загружаем профиль маркетплейса…</Message>
                    ) : (
                      <Message>У этого автора ещё нет профиля на маркетплейсе.</Message>
                    )}
                  </SectionCard>
                ) : null}
              </Stack>
            ) : (
              <Message>Выберите пользователя в таблице.</Message>
            )}
          </SectionCard>
        </div>
      );
    }

    if (section === "user-ledger") {
      return (
        <div className={styles.sideLayout}>
          <SectionCard title="Список пользователей" lead="Выберите пользователя, чтобы увидеть леджер.">
            {usersQuery.data ? (
              <TableWrap>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Email / ник</th>
                      <th>Роль</th>
                      <th>Баланс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.data.items.map((user) => (
                      <tr
                        key={user.id}
                        className={`${styles.selectable}${selectedUserId === user.id ? ` ${styles.selected}` : ""}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td><strong>{user.nickname || user.email}</strong></td>
                        <td>{formatRole(user.role)}</td>
                        <td>{formatMoney(user.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrap>
            ) : (
              <Message>Загружаем пользователей…</Message>
            )}
          </SectionCard>

          <SectionCard title="Леджер выбранного пользователя" lead={userDetailQuery.data ? userDetailQuery.data.email : "Выберите пользователя слева."}>
            {userLedgerQuery.data ? (
              userLedgerQuery.data.items.length === 0 ? (
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
              )
            ) : (
              <Message>Выберите пользователя в таблице.</Message>
            )}
          </SectionCard>
        </div>
      );
    }

    if (section === "user-balance") {
      return (
        <div className={styles.sideLayout}>
          <SectionCard title="Список пользователей" lead="Выберите пользователя для корректировки баланса.">
            {usersQuery.data ? (
              <TableWrap>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Email / ник</th>
                      <th>Роль</th>
                      <th>Баланс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.data.items.map((user) => (
                      <tr
                        key={user.id}
                        className={`${styles.selectable}${selectedUserId === user.id ? ` ${styles.selected}` : ""}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td><strong>{user.nickname || user.email}</strong></td>
                        <td>{formatRole(user.role)}</td>
                        <td>{formatMoney(user.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrap>
            ) : (
              <Message>Загружаем пользователей…</Message>
            )}
          </SectionCard>

          <SectionCard
            title="Корректировка баланса"
            lead={userDetailQuery.data ? `${userDetailQuery.data.email} — баланс ${formatMoney(userDetailQuery.data.balance)}` : "Выберите пользователя слева."}
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
        </div>
      );
    }

    if (section === "user-card") {
      return (
        <div className={styles.sideLayout}>
          <SectionCard title="Список пользователей" lead="Выберите пользователя для привязки карты.">
            {usersQuery.data ? (
              <TableWrap>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Email / ник</th>
                      <th>Роль</th>
                      <th>Карта</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.data.items.map((user) => (
                      <tr
                        key={user.id}
                        className={`${styles.selectable}${selectedUserId === user.id ? ` ${styles.selected}` : ""}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td><strong>{user.nickname || user.email}</strong></td>
                        <td>{formatRole(user.role)}</td>
                        <td>{user.payout_card_last4 ? `•••• ${user.payout_card_last4}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrap>
            ) : (
              <Message>Загружаем пользователей…</Message>
            )}
          </SectionCard>

          <SectionCard
            title="Карта партнёра"
            lead={userDetailQuery.data ? `${userDetailQuery.data.email}` : "Выберите пользователя слева."}
          >
            {userDetailQuery.data ? (
              <Stack>
                <Field label="Номер карты" help="13–19 цифр. Сохраняются только последние 4.">
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
        </div>
      );
    }

    if (section === "create-blogger") {
      return (
        <SectionCard title="Создать блогера" lead="Создаёт нового блогера. Пароль выдаётся автоматически — сохраните его сразу.">
          <Stack>
            <TwoColumn>
              <Field label="Никнейм">
                <TextInput value={bloggerForm.nickname} onChange={(event) => setBloggerForm((current) => ({ ...current, nickname: event.target.value }))} />
              </Field>
              <Field label="Имя">
                <TextInput value={bloggerForm.name} onChange={(event) => setBloggerForm((current) => ({ ...current, name: event.target.value }))} />
              </Field>
            </TwoColumn>
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

    if (section === "finance" || section === "finance-analytics") {
      const dash = financeDashboardQuery.data;
      const participantLabel = (key: string): string => {
        switch (key.toLowerCase()) {
          case "worker": return "Воркер";
          case "bloger": case "blogger": return "Блогер";
          case "upline": return "Аплайн";
          case "platform": return "Платформа";
          default: return key;
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
      if (section === "finance") {
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
            </>
          ) : null}
        </Stack>
      );
      }

      /* section === "finance-analytics" */
      return (
        <Stack>
          <SectionCard
            title="Период"
            lead="Фильтрация аналитики по выбранному периоду."
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

          {financeDashboardQuery.isLoading ? <Message>Загружаем аналитику…</Message> : null}
          {financeDashboardQuery.isError ? (
            <Message tone="error">Не удалось загрузить аналитику.</Message>
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
                    <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{script.category}{script.keywords.length > 0 ? ` · ${script.keywords.join(", ")}` : ""}</span>
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
              <Field label="Категория">
                <TextInput value={scriptForm.category} onChange={(event) => setScriptForm((current) => ({ ...current, category: event.target.value }))} placeholder="Общие" />
              </Field>
              <Field label="Ключевые слова" help="Через запятую, напр.: продажа, первый контакт, follow-up">
                <TextInput value={scriptForm.keywords} onChange={(event) => setScriptForm((current) => ({ ...current, keywords: event.target.value }))} placeholder="слово1, слово2, слово3" />
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

    if (section === "stats") {
      const stats = telegramStatsQuery.data;
      const liveCount = memberCountQuery.data?.count;
      const subsSeries = statsSubsDailyQuery.data?.series ?? [];
      const loginsSeries = statsLoginsDailyQuery.data?.series ?? [];
      const subsPeriodTotal = subsSeries.reduce((acc, point) => acc + point.count, 0);
      const loginsPeriodTotal = loginsSeries.reduce((acc, point) => acc + point.count, 0);
      return (
        <Stack>
          <StatsGrid>
            <StatCard
              label="В канале сейчас"
              value={typeof liveCount === "number" ? formatNumber(liveCount) : "—"}
            />
            <StatCard label="Прошли проверку" value={stats ? formatNumber(stats.total) : "—"} />
            <StatCard label="Сегодня" value={stats ? formatNumber(stats.today) : "—"} />
            <StatCard label="За неделю" value={stats ? formatNumber(stats.this_week) : "—"} />
            <StatCard label="За месяц" value={stats ? formatNumber(stats.this_month) : "—"} />
          </StatsGrid>

          <ChartRangeSwitch value={statsRange} onChange={setStatsRange} />

          <SectionCard
            title="Прошли проверку подписки по дням"
            lead={`Уникальные люди, вошедшие через Telegram с включённой проверкой. Отметка появляется в момент входа на платформу, а не подписки на канал. За период: ${formatNumber(subsPeriodTotal)}.`}
          >
            {statsSubsDailyQuery.data ? (
              <DailyBarsChart points={subsSeries} ariaLabel="Прошли проверку подписки по дням" />
            ) : statsSubsDailyQuery.isError ? (
              <Message tone="error">Не удалось загрузить график подписок.</Message>
            ) : (
              <Message>Загружаем график…</Message>
            )}
          </SectionCard>

          <SectionCard
            title="Активность входов по дням"
            lead={`Уникальные пользователи, которые входили на платформу. За период: ${formatNumber(loginsPeriodTotal)}.`}
          >
            {statsLoginsDailyQuery.data ? (
              <DailyBarsChart points={loginsSeries} ariaLabel="Активность входов по дням" />
            ) : statsLoginsDailyQuery.isError ? (
              <Message tone="error">Не удалось загрузить график входов.</Message>
            ) : (
              <Message>Загружаем график…</Message>
            )}
          </SectionCard>
        </Stack>
      );
    }

    if (section === "telegram") {
      const stats = telegramStatsQuery.data;
      const liveCount = memberCountQuery.data?.count;
      const diagnose = diagnoseQuery.data;
      return (
        <div>
          <StatsGrid>
            <StatCard
              label="В канале сейчас"
              value={typeof liveCount === "number" ? formatNumber(liveCount) : "—"}
            />
            <StatCard label="Прошли проверку" value={stats ? formatNumber(stats.total) : "—"} />
            <StatCard label="Сегодня" value={stats ? formatNumber(stats.today) : "—"} />
            <StatCard label="За неделю" value={stats ? formatNumber(stats.this_week) : "—"} />
            <StatCard label="За месяц" value={stats ? formatNumber(stats.this_month) : "—"} />
          </StatsGrid>

          <div style={{ marginTop: "1.2rem" }}>
          <SectionCard
            title="Доступ бота к каналу"
            lead="Если бот не администратор канала, проверка подписки не пускает даже подписанных."
          >
            <Stack>
              <div className={styles.actionRow}>
                <Button
                  type="button"
                  kind="ghost"
                  onClick={() => void diagnoseQuery.refetch()}
                  disabled={diagnoseQuery.isFetching}
                >
                  {diagnoseQuery.isFetching ? "Проверяем…" : "Проверить доступ бота"}
                </Button>
              </div>
              {diagnoseQuery.isError ? (
                <Message tone="error">
                  {diagnoseQuery.error instanceof Error
                    ? diagnoseQuery.error.message
                    : "Не удалось выполнить проверку."}
                </Message>
              ) : null}
              {diagnose ? (
                <>
                  <PillRow>
                    <Pill tone={diagnose.chat_found ? "accent" : "default"}>
                      {diagnose.chat_found
                        ? `Канал найден${diagnose.chat_title ? `: «${diagnose.chat_title}»` : ""}`
                        : "Канал не найден"}
                    </Pill>
                    <Pill tone={diagnose.can_check_members ? "accent" : "default"}>
                      {diagnose.can_check_members
                        ? "Бот — админ, проверка работает"
                        : `Бот не админ${diagnose.bot_status ? ` (статус: ${diagnose.bot_status})` : ""}`}
                    </Pill>
                    {typeof diagnose.member_count === "number" ? (
                      <Pill>Подписчиков: {formatNumber(diagnose.member_count)}</Pill>
                    ) : null}
                  </PillRow>
                  {diagnose.error_hint ? (
                    <Message tone="error">{diagnose.error_hint}</Message>
                  ) : (
                    <Message tone="success">
                      Всё настроено: бот видит канал и может проверять подписку.
                    </Message>
                  )}
                </>
              ) : null}
            </Stack>
          </SectionCard>
          </div>

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

    if (section.startsWith("mp-")) {
      return <AdminMarketplacePanel tab={section.slice(3) as AdminMarketplaceTab} />;
    }

    return null;
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"users" | "marketplace" | "tools" | null>(null);
  const hoverTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = (menu: "users" | "marketplace" | "tools") => {
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
        {/* Обзор — прямая ссылка */}
        <button
          type="button"
          className={`${styles.headerSection}${section === "overview" ? ` ${styles.headerSectionPrimary}` : ""}`}
          onClick={() => { setSection("overview"); setActiveMenu(null); setDrawerOpen(false); }}
        >
          Обзор
        </button>

        {/* Статистика — прямая ссылка */}
        <button
          type="button"
          className={`${styles.headerSection}${section === "stats" ? ` ${styles.headerSectionPrimary}` : ""}`}
          onClick={() => { setSection("stats"); setActiveMenu(null); setDrawerOpen(false); }}
        >
          Статистика
        </button>

        {/* Пользователи — dropdown */}
        <div
          className={styles.headerDropdownWrap}
          onMouseEnter={() => openMenu("users")}
          onMouseLeave={closeMenu}
        >
          <button
            type="button"
            className={`${styles.headerSection}${section === "users" || section === "create-blogger" || section === "user-ledger" || section === "user-balance" || section === "user-card" ? ` ${styles.headerSectionActive}` : ""}${activeMenu === "users" ? ` ${styles.headerSectionHover}` : ""}`}
            onClick={() => { activeMenu === "users" ? (setActiveMenu(null), setDrawerOpen(false)) : openMenu("users"); }}
          >
            Пользователи
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={activeMenu === "users" ? styles.chevronOpen : undefined}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {activeMenu === "users" && (
            <div className={styles.dropdown} onMouseEnter={cancelClose} onMouseLeave={closeMenu}>
              <p className={styles.dropdownGroupTitle}>Управление</p>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "users" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("users"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Все пользователи</span>
                <span className={styles.dropdownItemDesc}>Таблица и редактор — роль, процент, статус.</span>
              </button>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "user-ledger" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("user-ledger"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Леджер пользователя</span>
                <span className={styles.dropdownItemDesc}>Начисления и списания выбранного партнёра.</span>
              </button>
              <div className={styles.dropdownDivider} />
              <p className={styles.dropdownGroupTitle}>Финансы партнёра</p>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "user-balance" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("user-balance"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Корректировка баланса</span>
                <span className={styles.dropdownItemDesc}>Начисление или списание с указанием причины.</span>
              </button>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "user-card" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("user-card"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Карта партнёра</span>
                <span className={styles.dropdownItemDesc}>Привязка карты для выплат.</span>
              </button>
              <div className={styles.dropdownDivider} />
              <p className={styles.dropdownGroupTitle}>Действия</p>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "create-blogger" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("create-blogger"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Создать блогера</span>
                <span className={styles.dropdownItemDesc}>Новый аккаунт блогера с автоматическим паролем.</span>
              </button>
            </div>
          )}
        </div>

        {/* Маркетплейс — dropdown */}
        <div
          className={styles.headerDropdownWrap}
          onMouseEnter={() => openMenu("marketplace")}
          onMouseLeave={closeMenu}
        >
          <button
            type="button"
            className={`${styles.headerSection}${section.startsWith("mp-") || section === "finance" || section === "finance-analytics" || section === "ledger" ? ` ${styles.headerSectionActive}` : ""}${activeMenu === "marketplace" ? ` ${styles.headerSectionHover}` : ""}`}
            onClick={() => { activeMenu === "marketplace" ? (setActiveMenu(null), setDrawerOpen(false)) : openMenu("marketplace"); }}
          >
            Маркетплейс
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={activeMenu === "marketplace" ? styles.chevronOpen : undefined}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {activeMenu === "marketplace" && (
            <div className={`${styles.dropdown} ${styles.dropdownWide}`} onMouseEnter={cancelClose} onMouseLeave={closeMenu}>
              <div className={styles.dropdownCol}>
                <p className={styles.dropdownGroupTitle}>Продажи</p>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-dashboard" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-dashboard"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Сводка</span>
                  <span className={styles.dropdownItemDesc}>Заказы, выручка, авторы и клиенты биржи.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-stats" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-stats"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Статистика</span>
                  <span className={styles.dropdownItemDesc}>Графики оборота, воронка, топы и активность.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-orders" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-orders"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Заказы</span>
                  <span className={styles.dropdownItemDesc}>Подтверждение оплаты, споры, возвраты.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-withdrawals" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-withdrawals"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Выводы</span>
                  <span className={styles.dropdownItemDesc}>Запросы на вывод средств, ручное подтверждение.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-tickets" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-tickets"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Тикеты</span>
                  <span className={styles.dropdownItemDesc}>Обращения по заказам от заказчиков и авторов.</span>
                </button>
              </div>
              <div className={styles.dropdownCol}>
                <p className={styles.dropdownGroupTitle}>Настройки</p>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-payments" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-payments"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Оплата и ЮKassa</span>
                  <span className={styles.dropdownItemDesc}>Карта, СБП, расчётный счёт, онлайн-оплата.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-settings" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-settings"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Комиссии</span>
                  <span className={styles.dropdownItemDesc}>Процент платформы и комиссия воркера.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-services" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-services"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Реестр услуг</span>
                  <span className={styles.dropdownItemDesc}>Единый список услуг для всех авторов.</span>
                </button>
              </div>
              <div className={styles.dropdownCol}>
                <p className={styles.dropdownGroupTitle}>Авторы и витрина</p>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-bloggers" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-bloggers"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Авторы</span>
                  <span className={styles.dropdownItemDesc}>Активность в каталоге, ER и рейтинг.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-moderation" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-moderation"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Модерация</span>
                  <span className={styles.dropdownItemDesc}>Заявки на подтверждение данных аудитории.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-premium" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-premium"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Премиум</span>
                  <span className={styles.dropdownItemDesc}>Заявки авторов на премиум-размещение.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "mp-hero" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("mp-hero"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Витрина</span>
                  <span className={styles.dropdownItemDesc}>Ниши и авторы на главной странице.</span>
                </button>
              </div>
              <div className={styles.dropdownCol}>
                <p className={styles.dropdownGroupTitle}>Платформа</p>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "finance" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("finance"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Сводка платформы</span>
                  <span className={styles.dropdownItemDesc}>Прибыль, баланс, обязательства, оборот.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "finance-analytics" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("finance-analytics"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Аналитика</span>
                  <span className={styles.dropdownItemDesc}>Обороты, заработок по ролям, динамика, топы.</span>
                </button>
                <button
                  type="button"
                  className={`${styles.dropdownItem}${section === "ledger" ? ` ${styles.dropdownItemActive}` : ""}`}
                  onClick={() => { setSection("ledger"); setActiveMenu(null); setDrawerOpen(false); }}
                >
                  <span className={styles.dropdownItemLabel}>Леджер и выплаты</span>
                  <span className={styles.dropdownItemDesc}>Начисления, запросы на выплаты, подтверждения.</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Инструменты — dropdown */}
        <div
          className={styles.headerDropdownWrap}
          onMouseEnter={() => openMenu("tools")}
          onMouseLeave={closeMenu}
        >
          <button
            type="button"
            className={`${styles.headerSection}${section === "scripts" || section === "telegram" ? ` ${styles.headerSectionActive}` : ""}${activeMenu === "tools" ? ` ${styles.headerSectionHover}` : ""}`}
            onClick={() => { activeMenu === "tools" ? (setActiveMenu(null), setDrawerOpen(false)) : openMenu("tools"); }}
          >
            Инструменты
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={activeMenu === "tools" ? styles.chevronOpen : undefined}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {activeMenu === "tools" && (
            <div className={styles.dropdown} onMouseEnter={cancelClose} onMouseLeave={closeMenu}>
              <p className={styles.dropdownGroupTitle}>Инструменты</p>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "scripts" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("scripts"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Скрипты для воркеров</span>
                <span className={styles.dropdownItemDesc}>Шаблоны сообщений для кабинета воркера.</span>
              </button>
              <button
                type="button"
                className={`${styles.dropdownItem}${section === "telegram" ? ` ${styles.dropdownItemActive}` : ""}`}
                onClick={() => { setSection("telegram"); setActiveMenu(null); setDrawerOpen(false); }}
              >
                <span className={styles.dropdownItemLabel}>Telegram-канал</span>
                <span className={styles.dropdownItemDesc}>Обязательная подписка, статистика, управление.</span>
              </button>
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
