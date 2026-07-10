import { appConfig } from "@/lib/config";
import { tokenStorage } from "@/lib/storage";
import type {
  AudienceStats,
  AudienceSubmission,
  AuthTokensResponse,
  BloggerProfileFull,
  BloggerSelfProfile,
  CatalogResponse,
  ChatMessage,
  Conversation,
  HeroConfigResponse,
  Order,
  OrderDetail,
  OrdersResponse,
  PremiumRequest,
  PriceItemFull,
  Review,
  ServiceType,
  SupportTicket,
  ThreadsList,
  UserMeRead,
  UserPeek,
  WorkerCommission,
  WorkerReferral,
  WorkerStats,
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

/**
 * Auth endpoints across the platform return `{ message, token, refresh_token }`,
 * but OAuth-style handlers may send `{ access_token, ... }`. Normalising both
 * shapes here means a non-atomic deploy of the frontend/backend (separate
 * Railway services) can never strand the session with an `undefined` token.
 */
type RawAuthTokens = {
  message?: string;
  token?: string;
  access_token?: string;
  refresh_token: string;
};

const normalizeAuthTokens = (raw: RawAuthTokens): AuthTokensResponse => ({
  message: raw.message ?? "",
  token: raw.token ?? raw.access_token ?? "",
  refresh_token: raw.refresh_token,
});

let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetch(`${appConfig.apiBaseUrl}/marketplace/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokenStorage.readRefreshToken() }),
  })
    .then(async (response) => {
      if (!response.ok) {
        tokenStorage.clear();
        throw new Error("Не удалось обновить сессию");
      }
      const data = normalizeAuthTokens((await response.json()) as RawAuthTokens);
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
 * Always coerce to a single human-readable line.
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

// ─── Marketplace API Client ─────────────────────────────────────────────────

export type OrderCreateBody = {
  blogger_id: string;
  message: string;
  amount_kopeks: number;
  service_type_id?: string | null;
  deadline_days?: number | null;
  publish_at?: string | null;
};

export type OfferCreateBody = {
  counterpart_id: string;
  message: string;
  amount_kopeks: number;
  service_type_id?: string | null;
  deadline_days?: number | null;
  publish_at?: string | null;
};

export type PriceListItemBody = {
  service_type_id: string;
  price_kopeks: number;
  description?: string | null;
  is_enabled: boolean;
};

export type ProfileUpdateBody = Partial<{
  category: string;
  gender: string | null;
  subscriber_count: number;
  average_price_kopeks: number;
  description: string;
  social_links: string[];
  portfolio_links: string[];
  photo_url: string | null;
  preferred_contact: string | null;
  is_active: boolean;
  orders_enabled: boolean;
  show_portfolio: boolean;
  show_socials: boolean;
}>;

export const api = {
  // ─── Auth ───────────────────────────────────────────────────────────────────
  login: async (body: { email: string; password: string }) =>
    normalizeAuthTokens(
      await request<RawAuthTokens>("/marketplace/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),

  register: async (body: { email: string; password: string; name: string; referral_code?: string }) =>
    normalizeAuthTokens(
      await request<RawAuthTokens>("/marketplace/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),

  refreshToken: async () =>
    normalizeAuthTokens(
      await request<RawAuthTokens>("/marketplace/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: tokenStorage.readRefreshToken() }),
      }),
    ),

  logout: () =>
    request<{ message: string }>("/auth/logout", {
      method: "POST",
      auth: true,
    }),

  /** Обмен одноразового SSO-кода главной платформы на JWT-пару. */
  platformExchange: async (code: string) =>
    normalizeAuthTokens(
      await request<RawAuthTokens>("/auth/platform/exchange", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    ),

  // ─── User ──────────────────────────────────────────────────────────────────
  getMe: () => request<UserMeRead>("/me", { auth: true }),

  updateMe: (body: {
    name?: string;
    email?: string;
    telegram?: string;
    password?: string;
    current_password?: string;
  }) =>
    request<UserMeRead>("/me", {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),

  // ─── Marketplace Catalog ───────────────────────────────────────────────────
  getBloggers: (query = "") =>
    request<CatalogResponse>(`/marketplace/bloggers${query}`, {}),

  getBlogger: (userId: string) =>
    request<BloggerProfileFull>(`/marketplace/bloggers/${userId}`, {}),

  getCategories: () =>
    request<{ value: string; label: string }[]>("/marketplace/categories", {}),

  getServiceTypes: () =>
    request<ServiceType[]>("/marketplace/service-types", {}),

  getHeroConfig: () =>
    request<HeroConfigResponse>("/marketplace/hero-config", {}),

  // ─── Профиль автора (кабинет) ─────────────────────────────────────────────
  getSelfProfile: () =>
    request<BloggerSelfProfile>("/marketplace/blogger/profile", { auth: true }),

  createSelfProfile: (body: {
    category: string;
    gender?: string | null;
    subscriber_count: number;
    average_price_kopeks: number;
    description: string;
    social_links: string[];
    portfolio_links?: string[];
    photo_url?: string | null;
    preferred_contact?: string | null;
  }) =>
    request<BloggerSelfProfile>("/marketplace/blogger/profile", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  updateSelfProfile: (body: ProfileUpdateBody) =>
    request<BloggerSelfProfile>("/marketplace/blogger/profile", {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(body),
    }),

  updatePriceList: (items: PriceListItemBody[]) =>
    request<PriceItemFull[]>("/marketplace/blogger/price-list", {
      method: "PUT",
      auth: true,
      body: JSON.stringify({ items }),
    }),

  createAudienceSubmission: (body: { payload: AudienceStats; screenshots: string[] }) =>
    request<AudienceSubmission>("/marketplace/blogger/audience-submission", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  uploadImage: async (file: File): Promise<{ url: string }> => {
    const doUpload = async (token: string) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`${appConfig.apiBaseUrl}/marketplace/uploads`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
    };

    let response = await doUpload(tokenStorage.readAccessToken());
    // FormData идёт мимо request(), поэтому повтор после refresh — вручную
    if (response.status === 401 && tokenStorage.readRefreshToken()) {
      const freshToken = await refreshAccessToken();
      response = await doUpload(freshToken);
    }
    return handleResponse<{ url: string }>(response);
  },

  // ─── Премиум-размещение ───────────────────────────────────────────────────
  createPremiumRequest: (comment?: string) =>
    request<PremiumRequest>("/marketplace/premium/requests", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ comment: comment || null }),
    }),

  getLatestPremiumRequest: () =>
    request<PremiumRequest>("/marketplace/premium/requests/latest", { auth: true }),

  // ─── Чаты ─────────────────────────────────────────────────────────────────
  getThreads: () =>
    request<ThreadsList>("/marketplace/messages", { auth: true }),

  getConversation: (partnerId: string, query = "") =>
    request<Conversation>(`/marketplace/messages/${partnerId}${query}`, {
      auth: true,
    }),

  sendMessage: (body: { recipient_id: string; text: string }) =>
    request<ChatMessage>("/marketplace/messages", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  markThreadRead: (partnerId: string) =>
    request<void>(`/marketplace/messages/${partnerId}/read`, {
      method: "PATCH",
      auth: true,
    }),

  peekUser: (partnerId: string) =>
    request<UserPeek>(`/marketplace/messages/${partnerId}/peek`, { auth: true }),

  // ─── Orders ────────────────────────────────────────────────────────────────
  createOrder: (body: OrderCreateBody) =>
    request<Order>("/marketplace/orders", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  getOrders: (query = "") =>
    request<OrdersResponse>(`/marketplace/orders${query}`, {
      auth: true,
    }),

  getOrder: (orderId: string) =>
    request<OrderDetail>(`/marketplace/orders/${orderId}`, {
      auth: true,
    }),

  createOfferFromChat: (body: OfferCreateBody) =>
    request<Order>("/marketplace/orders/offer", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  acceptOffer: (orderId: string) =>
    request<Order>(`/marketplace/orders/${orderId}/accept`, {
      method: "PATCH",
      auth: true,
    }),

  declineOffer: (orderId: string, reason?: string) =>
    request<Order>(`/marketplace/orders/${orderId}/decline`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ reason: reason || null }),
    }),

  markOrderPaid: (orderId: string) =>
    request<Order>(`/marketplace/orders/${orderId}/mark-paid`, {
      method: "PATCH",
      auth: true,
    }),

  submitWork: (orderId: string, result: string) =>
    request<Order>(`/marketplace/orders/${orderId}/submit-work`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ result }),
    }),

  requestChanges: (orderId: string, reason: string) =>
    request<Order>(`/marketplace/orders/${orderId}/request-changes`, {
      method: "PATCH",
      auth: true,
      body: JSON.stringify({ reason }),
    }),

  confirmOrder: (orderId: string) =>
    request<Order>(`/marketplace/orders/${orderId}/confirm`, {
      method: "PATCH",
      auth: true,
    }),

  cancelOrder: (orderId: string) =>
    request<Order>(`/marketplace/orders/${orderId}/cancel`, {
      method: "PATCH",
      auth: true,
    }),

  createReview: (orderId: string, body: { rating: number; text?: string | null }) =>
    request<Review>(`/marketplace/orders/${orderId}/review`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  // ─── Кабинет воркера ──────────────────────────────────────────────────────
  getWorkerStats: () =>
    request<WorkerStats>("/marketplace/worker/stats", { auth: true }),

  getWorkerReferralLink: () =>
    request<{ referral_url: string }>("/marketplace/worker/referral-link", {
      auth: true,
    }),

  getWorkerReferrals: (query = "") =>
    request<{ items: WorkerReferral[]; total: number; page: number; page_size: number }>(
      `/marketplace/worker/referrals${query}`,
      { auth: true },
    ),

  getWorkerCommissions: (query = "") =>
    request<{ items: WorkerCommission[]; total: number; page: number; page_size: number }>(
      `/marketplace/worker/commissions${query}`,
      { auth: true },
    ),

  // ─── Payments ──────────────────────────────────────────────────────────────
  createPayment: (orderId: string) =>
    request<{ order_id: string; payment_id: string; payment_url: string; expires_at: string }>(
      `/marketplace/payments/${orderId}/create`,
      { method: "POST", auth: true },
    ),

  // ─── Support ───────────────────────────────────────────────────────────────
  createTicket: (body: { subject: string; order_id?: string; message: string }) =>
    request<SupportTicket>("/marketplace/support/tickets", {
      method: "POST",
      auth: true,
      body: JSON.stringify(body),
    }),

  getTickets: (query = "") =>
    request<{ items: SupportTicket[]; total: number; page: number; page_size: number }>(
      `/marketplace/support/tickets${query}`,
      { auth: true },
    ),
};
