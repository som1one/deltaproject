import { appConfig } from "@/lib/config";
import { tokenStorage } from "@/lib/storage";
import type {
  AuthTokensResponse,
  BloggerProfileFull,
  CatalogResponse,
  HeroConfigResponse,
  Order,
  OrderDetail,
  OrdersResponse,
  SupportTicket,
  UserMeRead,
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
};

export const api = {
  // ─── Auth ───────────────────────────────────────────────────────────────────
  login: (body: { email: string; password: string }) =>
    request<AuthTokensResponse>("/marketplace/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  register: (body: { email: string; password: string; name: string; referral_code?: string }) =>
    request<AuthTokensResponse>("/marketplace/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  refreshToken: () =>
    request<Pick<AuthTokensResponse, "token" | "refresh_token">>("/marketplace/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: tokenStorage.readRefreshToken() }),
    }),

  logout: () =>
    request<{ message: string }>("/auth/logout", {
      method: "POST",
      auth: true,
    }),

  /** Обмен одноразового SSO-кода главной платформы на JWT-пару. */
  platformExchange: (code: string) =>
    request<AuthTokensResponse>("/auth/platform/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  // ─── User ──────────────────────────────────────────────────────────────────
  getMe: () => request<UserMeRead>("/me", { auth: true }),

  // ─── Marketplace Catalog ───────────────────────────────────────────────────
  getBloggers: (query = "") =>
    request<CatalogResponse>(`/marketplace/bloggers${query}`, {}),

  getBlogger: (userId: string) =>
    request<BloggerProfileFull>(`/marketplace/bloggers/${userId}`, {}),

  getCategories: () =>
    request<{ value: string; label: string }[]>("/marketplace/categories", {}),

  getHeroConfig: () =>
    request<HeroConfigResponse>("/marketplace/hero-config", {}),

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

  markOrderPaid: (orderId: string) =>
    request<Order>(`/marketplace/orders/${orderId}/mark-paid`, {
      method: "PATCH",
      auth: true,
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

  completeOrder: (orderId: string) =>
    request<Order>(`/marketplace/orders/${orderId}/complete`, {
      method: "PATCH",
      auth: true,
    }),

  // ─── Payments ──────────────────────────────────────────────────────────────
  createPayment: (orderId: string) =>
    request<{ order_id: string; payment_id: string; payment_url: string; expires_at: string }>(
      `/marketplace/payments/${orderId}/create`,
      { method: "POST", auth: true },
    ),

  // ─── Support ───────────────────────────────────────────────────────────────
  createTicket: (body: { order_id: string; message: string }) =>
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
