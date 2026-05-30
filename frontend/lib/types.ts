export type UserRole = "Worker" | "Bloger" | "Admin" | "Tech_Admin";

export type DealStatus = "NEW" | "REVIEW" | "CONFIRMED" | "PAID" | "COMPLETED" | "REJECTED";

export type LedgerEntryStatus =
  | "payout_request"
  | "freeze"
  | "pending_confirmation"
  | "completed"
  | "rejected";

export type AuthTokensResponse = {
  message: string;
  token: string;
  refresh_token: string;
};

export type TelegramOAuthConfigResponse = {
  enabled: boolean;
  bot_username: string | null;
};

export type TelegramAuthExchangeRequest = {
  ticket: string;
};

export type UserMeRead = {
  id: string;
  name: string;
  email: string;
  nickname: string | null;
  telegram: string | null;
  role: UserRole;
  linked_to: string | null;
  percent: number;
  balance: number;
  balance_pending_confirmation_kopeks: number;
  payout_card_last4: string | null;
  blogger_cabinet_locked: boolean;
  referral_invite_url: string | null;
};

export type WorkerMeStatsRead = {
  role: "Worker";
  deals: number;
  agree: number;
  paid: number;
  earn: number;
};

export type BloggerMeStatsRead = {
  role: "Bloger";
  deals: number;
  earn: number;
  workers: number;
};

export type MeStatsResponse = WorkerMeStatsRead | BloggerMeStatsRead;

export type DealRead = {
  id: string;
  worker_id: string;
  bloger_id: string;
  shop_link: string;
  item_name: string;
  status: DealStatus;
  price: number;
  seller_tg: string;
  seller_number: string;
  created_at: string;
  client_contacted_at: string | null;
  agreed_price_kopeks: number | null;
  effective_price_kopeks: number;
  sensitive_masked: boolean;
  finance_visible: boolean;
  preview_worker_kopeks: number | null;
  preview_blogger_kopeks: number | null;
  preview_platform_kopeks: number | null;
};

export type MeDealsResponse = {
  deals: DealRead[];
};

export type BloggerOptionRead = {
  id: string;
  name: string;
  email: string;
  telegram: string | null;
  nickname: string | null;
};

export type WorkerMessageScriptRead = {
  id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
};

export type LedgerEntryRead = {
  id: string;
  user_id: string;
  deal_id: string | null;
  amount_kopeks: number;
  status: LedgerEntryStatus;
  created_at: string;
  updated_at: string;
  idempotency_key: string | null;
  note: string | null;
  yookassa_payout_id: string | null;
};

export type LedgerListResponse = {
  items: LedgerEntryRead[];
  total: number;
};

export type PayoutWidgetConfigResponse = {
  enabled: boolean;
  gateway_id: string | null;
};

export type ReferralRead = {
  id: string;
  user_id: string;
  link: string;
};

export type QuestionResponse = {
  id: string;
  name: string;
  telegram: string;
  title: string;
  text: string;
  created_at: string;
};

export type AdminOverviewResponse = {
  users_total: number;
  users_active: number;
  users_inactive: number;
  users_by_role: Record<string, number>;
  balance_total_kopeks: number;
  balance_by_role: Record<string, number>;
  deals_total: number;
  deals_by_status: Record<string, number>;
};

export type AdminUserRead = {
  id: string;
  name: string;
  email: string;
  nickname: string | null;
  telegram: string | null;
  role: UserRole;
  linked_to: string | null;
  percent: number;
  balance: number;
  is_active: boolean;
  payout_card_last4: string | null;
};

export type AdminUserListResponse = {
  items: AdminUserRead[];
  total: number;
};

export type AdminBloggerCreateResponse = {
  user: AdminUserRead;
  nickname: string;
  generated_password: string;
};

export type AdminUserStatsResponse = {
  role: "Worker" | "Bloger";
  deals: number;
  earn: number;
  workers?: number;
  agree?: number;
  paid?: number;
  balance_pending_confirmation_kopeks: number;
};

export type FinanceSchemeAdminRead = {
  blogger_id: string;
  blogger_name: string;
  blogger_email: string;
  scheme_id: string | null;
  weight_worker: number;
  weight_bloger: number;
  weight_upline: number;
  weight_platform: number;
};

export type FinanceSchemeAdminListResponse = {
  items: FinanceSchemeAdminRead[];
  total: number;
};

export type FinancePreviewResponse = {
  bloger_id: string;
  price_kopeks: number;
  worker_kopeks: number;
  bloger_kopeks: number;
  upline_kopeks: number;
  platform_kopeks: number;
  weight_worker: number;
  weight_bloger: number;
  weight_upline: number;
  weight_platform: number;
};
