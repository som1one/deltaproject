import { appConfig } from "@/lib/config";
import { tokenStorage } from "@/lib/storage";
import type {
  AdminAuditListResponse,
  AdminBalanceAdjustmentResponse,
  AdminBloggerCreateResponse,
  AdminOverviewResponse,
  AdminUserListResponse,
  AdminUserRead,
  AdminUserStatsResponse,
  AuthTokensResponse,
  BloggerOptionRead,
  DealRead,
  FinancePreviewResponse,
  FinanceSchemeAdminListResponse,
  FinanceSchemeAdminRead,
  LedgerEntryRead,
  LedgerListResponse,
  MeDealsResponse,
  MeStatsResponse,
  PayoutWidgetConfigResponse,
  PlatformFinanceDashboard,
  QuestionResponse,
  ReferralRead,
  ReportingPeriod,
  TelegramOAuthConfigResponse,
  UserMeRead,
  WorkerMessageScriptRead,
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

export const api = {
  getTelegramConfig: () => request<TelegramOAuthConfigResponse>("/auth/telegram/config"),
  exchangeTelegramTicket: (ticket: string) =>
    request<AuthTokensResponse>("/auth/telegram/exchange", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    }),
  bloggerLogin: (body: { nickname: string; password: string }) =>
    request<AuthTokensResponse>("/auth/blogger-login", {
      method: "POST",
      body: JSON.stringify(body),
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
  setPayoutCard: (cardNumber: string) =>
    request<UserMeRead>("/me/payout-card", {
      method: "POST",
      auth: true,
      credentials: "include",
      body: JSON.stringify({ card_number: cardNumber }),
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
  getMyDeals: () =>
    request<MeDealsResponse>("/me/deals", {
      auth: true,
      credentials: "include",
    }),
  getAvailableBloggers: () =>
    request<BloggerOptionRead[]>("/me/available-bloggers", {
      auth: true,
    }),
  getWorkerScripts: () =>
    request<WorkerMessageScriptRead[]>("/me/worker-message-scripts", {
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
  setPartnerPayoutCard: (id: string, body: { card_number: string }) =>
    request<AdminUserRead>(`/admin/users/${id}/payout-card`, {
      method: "POST",
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
  getAdminDeals: (query = "") => request<DealRead[]>(`/admin/deals${query}`, { auth: true }),
  getAdminDeal: (id: string) => request<DealRead>(`/admin/deals/${id}`, { auth: true }),
  patchAdminDealStatus: (id: string, body: { status: string; reason: string }) =>
    request<DealRead>(`/admin/deals/${id}/status`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  patchAdminDealPrice: (id: string, body: { agreed_price_kopeks: number; reason: string }) =>
    request<DealRead>(`/admin/deals/${id}/agreed-price`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),
  recalcAdminDealFinance: (id: string, body: { reason: string }) =>
    request<DealRead>(`/admin/deals/${id}/recalc-finance`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
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
  getFinanceSchemes: (query = "") =>
    request<FinanceSchemeAdminListResponse>(`/admin/finance-schemes${query}`, { auth: true }),
  getFinanceScheme: (id: string) =>
    request<FinanceSchemeAdminRead>(`/admin/finance-schemes/${id}`, { auth: true }),
  putFinanceScheme: (
    id: string,
    body: {
      weight_worker: number;
      weight_bloger: number;
      weight_upline: number;
      weight_platform: number;
    },
  ) =>
    request<FinanceSchemeAdminRead>(`/admin/finance-schemes/${id}`, {
      method: "PUT",
      auth: true,
      body: JSON.stringify(body),
    }),
  getFinancePreview: (bloggerId: string, priceKopeks: number) =>
    request<FinancePreviewResponse>(
      `/admin/finance/preview?bloger_id=${bloggerId}&price_kopeks=${priceKopeks}`,
      { auth: true },
    ),
  getAdminWorkerScripts: () => request<WorkerMessageScriptRead[]>("/admin/worker-message-scripts", { auth: true }),
  createAdminWorkerScript: (body: { title: string; body: string; sort_order: number }) =>
    request<WorkerMessageScriptRead>("/admin/worker-message-scripts", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),
  patchAdminWorkerScript: (id: string, body: { title?: string; body?: string; sort_order?: number }) =>
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
};
