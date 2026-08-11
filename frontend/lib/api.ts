import { appConfig } from "@/lib/config";
import { tokenStorage } from "@/lib/storage";
import type {
  AdminAuditListResponse,
  AdminBalanceAdjustmentResponse,
  AdminBloggerCreateResponse,
  AdminDailySeriesResponse,
  AdminMarketplaceBloggerProfile,
  AdminOverviewResponse,
  AdminUserListResponse,
  AdminUserRead,
  AdminUserStatsResponse,
  AuthTokensResponse,
  BloggerOptionRead,
  BroadcastPreview,
  BroadcastResult,
  DealRead,
  LedgerEntryRead,
  LedgerListResponse,
  MarketplaceWithdrawalListResponse,
  MarketplaceWithdrawalRead,
  MeDealsResponse,
  MeStatsResponse,
  NudgeLogResponse,
  NudgeRuleRead,
  PayoutWidgetConfigResponse,
  PlatformFinanceDashboard,
  QuestionResponse,
  ReferralRead,
  ReportingPeriod,
  TelegramChannelConfigRead,
  TelegramChannelConfigSet,
  TelegramChannelDiagnoseResponse,
  TelegramChannelMemberCountResponse,
  TelegramChannelStatsResponse,
  TelegramOAuthConfigResponse,
  UserMeRead,
  WorkerBotOverview,
  WorkerBotSettingsRead,
  WorkerMessageScriptRead,
  WorkerScriptCategoriesResponse,
} from "@/lib/types";

type RequestInitWithAuth = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetch(`${appConfig.apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokenStorage.readRefreshToken() }),
  })
    .then(async (response) => {
      if (!response.ok) {
        tokenStorage.clear();
        throw new Error("Не удалось обновить сессию");
      }
      const data = (await response.json()) as Pick<AuthTokensResponse, "token" | "refresh_token">;
      tokenStorage.setTokens(data.token, data.refresh_token);
      return data.token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
};

/**
 * FastAPI returns `detail` in three flavours:
 *   • plain string for business errors
 *   • array of `{loc, msg, type, ...}` for 422 validation errors
 *   • dict (`{message, code, ...}`) when a custom handler is wired
 *
 * Always coerce to a single human-readable line — otherwise the UI ends up
 * rendering `[object Object]`.
 */
const stringifyDetail = (detail: unknown): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (entry && typeof entry === "object" && "msg" in entry) {
          const msg = String((entry as { msg?: unknown }).msg ?? "").trim();
          const loc = Array.isArray((entry as { loc?: unknown }).loc)
            ? ((entry as { loc: unknown[] }).loc.filter((x) => x !== "body") as string[]).join(".")
            : "";
          return loc ? `${loc}: ${msg}` : msg;
        }
        if (typeof entry === "string") return entry;
        return "";
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    const candidate = detail as { message?: unknown; detail?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.detail === "string") return candidate.detail;
  }
  return "";
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  let detail = "Что-то пошло не так";
  try {
    const payload = (await response.json()) as { detail?: unknown };
    const text = stringifyDetail(payload.detail);
    if (text) detail = text;
  } catch {
    detail = response.statusText || detail;
  }

  throw new ApiError(detail, response.status);
};

async function request<T>(path: string, init: RequestInitWithAuth = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth) {
    const token = tokenStorage.readAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && init.auth && tokenStorage.readRefreshToken()) {
    const freshToken = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${freshToken}`);
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  return handleResponse<T>(response);
}

/**
 * Универсальный запрос к API для экранов без обёртки в `api.*`.
 * Даёт то же, что и остальная админка: свежий токен из tokenStorage,
 * авто-refresh на 401 с повтором и человекочитаемые ошибки (ApiError).
 */
export const apiRequest = request;

export const api = {
  getTelegramConfig: () => request<TelegramOAuthConfigResponse>("/auth/telegram/config"),
  exchangeTelegramTicket: (ticket: string) =>
    request<AuthTokensResponse>("/auth/telegram/exchange", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    }),
  /** Повторная проверка подписки на канал: без нового прохода Telegram OAuth. */
  recheckTelegramSubscription: (token: string) =>
    request<AuthTokensResponse>("/auth/telegram/recheck", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  bloggerLogin: (body: { nickname: string; password: string }) =>
    request<AuthTokensResponse>("/auth/blogger-login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** SSO в маркетплейс: одноразовый код для redirect_uri маркетплейса. */
  platformAuthorize: (redirectUri: string) =>
    request<{ code: string; redirect_uri: string }>("/auth/platform/authorize", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ redirect_uri: redirectUri }),
    }),
  adminLogin: (body: { email: string; password: string }) =>
    request<AuthTokensResponse>("/auth/admin-login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () =>
    request<{ message: string }>("/auth/logout", {
      method: "POST",
      auth: true,
    }),
  getMe: () => request<UserMeRead>("/me", { auth: true, credentials: "include" }),
  patchMe: (body: Record<string, unknown>) =>
    request<UserMeRead>("/me", {
      method: "PATCH",
      auth: true,
      credentials: "include",
      body: JSON.stringify(body),
    }),
  setPayoutCard: (cardNumber: string, cardHolder: string, cardBrand: string, cardBank: string) =>
    request<UserMeRead>("/me/payout-card", {
      method: "POST",
      auth: true,
      credentials: "include",
      body: JSON.stringify({ card_number: cardNumber, card_holder: cardHolder, card_brand: cardBrand, card_bank: cardBank }),
    }),
  unlockCabinet: (pin: string) =>
    request<{ ok: boolean; unlock_token: string }>("/me/cabinet-unlock", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ pin }),
      credentials: "include",
    }),
  getMeStats: () =>
    request<MeStatsResponse>("/me/stats", {
      auth: true,
      credentials: "include",
    }),
  /** Диплинк подключения Telegram-бота уведомлений (Worker/Bloger). */
  getTelegramConnect: () =>
    request<{ connect_url: string; connected: boolean }>("/me/telegram-connect", {
      auth: true,
      credentials: "include",
    }),
  getMyDeals: () =>
    request<MeDealsResponse>("/me/deals", {
      auth: true,
      credentials: "include",
    }),
  getAvailableBloggers: () =>
    request<BloggerOptionRead[]>("/me/available-bloggers", {
      auth: true,
    }),
  getWorkerScripts: (params?: { category?: string; keyword?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.keyword) query.set("keyword", params.keyword);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return request<WorkerMessageScriptRead[]>(`/me/worker-message-scripts${qs ? `?${qs}` : ""}`, {
      auth: true,
    });
  },
  getWorkerScriptCategories: () =>
    request<WorkerScriptCategoriesResponse>("/me/worker-message-scripts/categories", {
      auth: true,
    }),
  getLedger: (query = "") =>
    request<LedgerListResponse>(`/me/ledger${query}`, {
      auth: true,
      credentials: "include",
    }),
  getPayoutWidgetConfig: () =>
    request<PayoutWidgetConfigResponse>("/me/payout-widget-config", {
      auth: true,
      credentials: "include",
    }),
  requestPayout: (body: { amount_kopeks: number; payout_token?: string | null }) =>
    request<LedgerEntryRead>("/me/payout-requests", {
      method: "POST",
      auth: true,
      credentials: "include",
      body: JSON.stringify(body),
    }),
  /** Маркетплейс: история выводов с marketplace_balance_kopeks. */
  getMarketplaceWithdrawals: () =>
    request<MarketplaceWithdrawalListResponse>("/marketplace/withdrawals", {
      auth: true,
    }),
  /** Маркетплейс: вывод заработка на привязанную карту (мгновенная выплата). */
  createMarketplaceWithdrawal: (amountKopeks: number) =>
    request<MarketplaceWithdrawalRead>("/marketplace/withdrawals", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ amount_kopeks: amountKopeks }),
    }),
  createDeal: (body: {
    shop_link: string;
    item_name: string;
    seller_tg: string;
    seller_number: string;
    price: number;
    bloger_id: string;
  }) =>
    request<DealRead>("/deals", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  acceptDeal: (dealId: string) =>
    request<DealRead>(`/deals/${dealId}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ status: "REVIEW" }),
    }),
  patchDealFields: (
    dealId: string,
    body: Partial<{
      shop_link: string;
      item_name: string;
      seller_tg: string;
      seller_number: string;
      price: number;
    }>,
  ) =>
    request<DealRead>(`/deals/${dealId}/fields`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  resolveReferral: (username: string) => request<ReferralRead>(`/referral/${username}`),
  sendQuestion: (body: { name: string; telegram: string; title: string; text: string }) =>
    request<QuestionResponse>("/question", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getAdminOverview: () => request<AdminOverviewResponse>("/admin/overview", { auth: true }),
  getAdminDailyLogins: (days = 30) =>
    request<AdminDailySeriesResponse>(`/admin/stats/logins-daily?days=${days}`, { auth: true }),
  getAdminUsers: (query = "") => request<AdminUserListResponse>(`/admin/users${query}`, { auth: true }),
  getAdminUser: (id: string) => request<AdminUserRead>(`/admin/users/${id}`, { auth: true }),
  patchAdminUser: (id: string, body: Record<string, unknown>) =>
    request<AdminUserRead>(`/admin/users/${id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  deleteAdminUser: (id: string) =>
    request<void>(`/admin/users/${id}`, {
      method: "DELETE",
      auth: true,
    }),
  createAdminBlogger: (body: { nickname: string; name?: string; telegram?: string }) =>
    request<AdminBloggerCreateResponse>("/admin/bloggers", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  getAdminUserStats: (id: string) =>
    request<AdminUserStatsResponse>(`/admin/users/${id}/stats`, { auth: true }),
  getAdminUserLedger: (id: string) =>
    request<LedgerListResponse>(`/admin/users/${id}/ledger`, { auth: true }),
  adjustUserBalance: (id: string, body: { amount_kopeks: number; reason: string }) =>
    request<AdminBalanceAdjustmentResponse>(`/admin/users/${id}/balance-adjustment`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  setPartnerPayoutCard: (id: string, body: { card_number: string; card_brand: string | null; card_holder: string | null }) =>
    request<AdminUserRead>(`/admin/users/${id}/payout-card`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  banAdminUser: (id: string, body: { reason: string }) =>
    request<AdminUserRead>(`/admin/users/${id}/ban`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  unbanAdminUser: (id: string) =>
    request<AdminUserRead>(`/admin/users/${id}/unban`, {
      method: "POST",
      auth: true,
    }),
  getAdminUserMarketplaceProfile: (userId: string) =>
    request<AdminMarketplaceBloggerProfile>(`/admin/marketplace/bloggers/by-user/${userId}`, { auth: true }),
  patchAdminMarketplaceBlogger: (profileId: string, body: Record<string, unknown>) =>
    request<AdminMarketplaceBloggerProfile>(`/admin/marketplace/bloggers/${profileId}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  getUserAudit: (id: string, query = "") =>
    request<AdminAuditListResponse>(`/admin/users/${id}/audit${query}`, { auth: true }),
  getPlatformFinanceDashboard: (period?: ReportingPeriod) =>
    request<PlatformFinanceDashboard>(
      `/admin/finance/dashboard${period ? `?period=${period}` : ""}`,
      { auth: true },
    ),
  getAdminLedger: (query = "") => request<LedgerListResponse>(`/admin/ledger${query}`, { auth: true }),
  getAdminLedgerEntry: (id: string) => request<LedgerEntryRead>(`/admin/ledger/${id}`, { auth: true }),
  patchAdminLedgerEntry: (id: string, body: { status: string; note?: string }) =>
    request<LedgerEntryRead>(`/admin/ledger/${id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  completePayout: (id: string) =>
    request<LedgerEntryRead>(`/admin/payouts/${id}/complete`, {
      method: "POST",
      auth: true,
    }),
  getAdminWorkerScripts: () => request<WorkerMessageScriptRead[]>("/admin/worker-message-scripts", { auth: true }),
  getAdminWorkerScriptCategories: () =>
    request<WorkerScriptCategoriesResponse>("/admin/worker-message-scripts/categories", { auth: true }),
  createAdminWorkerScript: (body: { title: string; body: string; category: string; keywords: string[]; sort_order: number }) =>
    request<WorkerMessageScriptRead>("/admin/worker-message-scripts", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  patchAdminWorkerScript: (id: string, body: { title?: string; body?: string; category?: string; keywords?: string[]; sort_order?: number }) =>
    request<WorkerMessageScriptRead>(`/admin/worker-message-scripts/${id}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  deleteAdminWorkerScript: (id: string) =>
    request<void>(`/admin/worker-message-scripts/${id}`, {
      method: "DELETE",
      auth: true,
    }),

  // ─── Telegram Channel Subscription ──────────────────────────────────────
  getAdminTelegramChannel: () =>
    request<TelegramChannelConfigRead | null>("/admin/telegram-channel", { auth: true }),
  setAdminTelegramChannel: (body: TelegramChannelConfigSet) =>
    request<TelegramChannelConfigRead>("/admin/telegram-channel", {
      method: "PUT",
      auth: true,
      body: JSON.stringify(body),
    }),
  getAdminTelegramChannelStats: (query = "") =>
    request<TelegramChannelStatsResponse>(`/admin/telegram-channel/stats${query}`, { auth: true }),
  getAdminTelegramChannelDailyStats: (days = 30) =>
    request<AdminDailySeriesResponse>(`/admin/telegram-channel/stats/daily?days=${days}`, { auth: true }),
  getAdminTelegramChannelMemberCount: () =>
    request<TelegramChannelMemberCountResponse>("/admin/telegram-channel/member-count", { auth: true }),
  diagnoseAdminTelegramChannel: () =>
    request<TelegramChannelDiagnoseResponse>("/admin/telegram-channel/diagnose", { auth: true }),
  checkAdminTelegramSubscription: (telegramUserId: string) =>
    request<{ subscribed: boolean; channel_id?: string; reason?: string }>(
      `/admin/telegram-channel/check/${telegramUserId}`,
      { auth: true },
    ),

  // ─── Бот воркеров: настройки, ростер, рассылки ──────────────────────────
  getWorkerBotOverview: () =>
    request<WorkerBotOverview>("/admin/worker-bot/overview", { auth: true }),
  updateWorkerBotSettings: (body: { auto_nudges_enabled: boolean; paused_until: string | null }) =>
    request<WorkerBotSettingsRead>("/admin/worker-bot/settings", {
      method: "PUT",
      auth: true,
      body: JSON.stringify(body),
    }),
  getWorkerBotNudges: () =>
    request<NudgeRuleRead[]>("/admin/worker-bot/nudges", { auth: true }),
  patchWorkerBotNudge: (
    kind: string,
    body: {
      is_enabled?: boolean;
      cooldown_days?: number;
      threshold_days?: number;
      text_template?: string;
    },
  ) =>
    request<NudgeRuleRead>(`/admin/worker-bot/nudges/${kind}`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  previewWorkerBotBroadcast: (body: { segment: string; text: string }) =>
    request<BroadcastPreview>("/admin/worker-bot/broadcast/preview", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  sendWorkerBotBroadcast: (body: { segment: string; text: string }) =>
    request<BroadcastResult>("/admin/worker-bot/broadcast", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  getWorkerBotNudgeLog: (limit = 50) =>
    request<NudgeLogResponse>(`/admin/worker-bot/nudge-log?limit=${limit}`, { auth: true }),
};
