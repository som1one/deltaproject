export type UserRole = "Worker" | "Bloger" | "Client" | "Admin" | "Tech_Admin";

export type DealStatus =
  | "NEW"
  | "REVIEW"
  | "CONFIRMED"
  | "ESCROW_HELD"
  | "PAID"
  | "COMPLETED"
  | "REJECTED"
  | "REFUNDED";

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
  marketplace_balance_kopeks: number;
  payout_card_last4: string | null;
  payout_card_brand: string | null;
  payout_card_holder: string | null;
  payout_card_bank: string | null;
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
  rejection_reason: string | null;
  payment_requisites: PaymentRequisites | null;
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
  category: string;
  keywords: string[];
  sort_order: number;
  created_at: string;
};

export type WorkerScriptCategoriesResponse = {
  categories: string[];
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

export type MarketplaceWithdrawalStatus = "pending" | "completed" | "failed";

export type MarketplaceWithdrawalRead = {
  id: string;
  user_id: string;
  amount_kopeks: number;
  status: MarketplaceWithdrawalStatus;
  yookassa_payout_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type MarketplaceWithdrawalListResponse = {
  items: MarketplaceWithdrawalRead[];
  total: number;
  page: number;
  page_size: number;
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
  photo_url: string | null;
  role: UserRole;
  linked_to: string | null;
  balance: number;
  marketplace_balance_kopeks: number;
  is_active: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  payout_card_last4: string | null;
  payout_card_brand: string | null;
  payout_card_holder: string | null;
  payout_card_bank: string | null;
  is_owner_admin: boolean;
};

export type AdminMarketplaceBloggerProfile = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  gender: string | null;
  subscriber_count: number;
  average_price_kopeks: number;
  engagement_rate: number | null;
  rating: number | null;
  reviews_count: number;
  description: string;
  portfolio_links: string[];
  social_links: string[];
  photo_url: string | null;
  preferred_contact: string | null;
  is_active: boolean;
  orders_enabled: boolean;
  created_at: string;
  updated_at: string;
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

export type ReportingPeriod = "today" | "week" | "month" | "all";

export type TopParticipant = {
  user_id: string;
  earnings_kopeks: number;
  paid_deals_count: number;
  name: string;
  nickname: string | null;
};

export type TimeSeriesPoint = {
  date: string;
  // Когорта по дате создания сделки.
  turnover_kopeks: number;
  deals_created: number;
  paid_deals_count: number;
  // По дате распределения долей — деньги, реально прошедшие в этот день.
  accrued_platform_share_kopeks: number;
  turnover_paid_kopeks: number;
  payments_count: number;
};

export type ReferralShareByBlogger = {
  upline_blogger_id: string;
  amount_kopeks: number;
  name: string;
  nickname: string | null;
};

export type FinanceFunnelStage = {
  key: string;
  count: number;
};

export type FinanceAmountBucket = {
  label: string;
  count: number;
  amount_kopeks: number;
};

export type FinancePeriodComparison = {
  turnover_kopeks: number;
  turnover_paid_kopeks: number;
  platform_share_kopeks: number;
  deals_created: number;
  paid_deals_count: number;
};

export type FinanceParticipantCounts = {
  workers_total: number;
  bloggers_total: number;
  clients_total: number;
  active_workers: number;
  active_bloggers: number;
  banned_total: number;
};

export type FinancePayoutQueue = {
  pending_count: number;
  pending_kopeks: number;
  completed_count: number;
  completed_kopeks: number;
  rejected_count: number;
};

export type ActiveReferralLinks = {
  bloggers_with_upline: number;
  workers_with_link: number;
};

export type PlatformFinanceDashboard = {
  period: ReportingPeriod;

  // Базовые показатели
  platform_balance_kopeks: number;
  net_profit_kopeks: number;
  earnings_by_role_kopeks: Record<string, number>;
  total_completed_payouts_kopeks: number;

  // A. Оборот и сделки
  turnover_total_kopeks: number;
  turnover_by_status_kopeks: Record<string, number>;
  deal_counts_by_status: Record<string, number>;
  average_order_value_kopeks: number;
  average_platform_commission_kopeks: number;

  // B. Обязательства
  platform_liabilities_kopeks: number;
  net_free_funds_kopeks: number;

  // C. Разбивка доли платформы
  accrued_platform_share_kopeks: number;
  platform_withdrawn_kopeks: number;
  platform_pending_funds_kopeks: number;
  available_for_payout_kopeks: number;

  // D. Динамика
  time_series: TimeSeriesPoint[];

  // E. Топ-участники
  top_bloggers: TopParticipant[];
  top_workers: TopParticipant[];

  // F. Ожидаемые начисления
  expected_accruals_total_kopeks: number;
  expected_future_shares_kopeks: Record<string, number>;

  // G. Реферальная аналитика
  total_referral_share_to_uplines_kopeks: number;
  referral_share_by_blogger: ReferralShareByBlogger[];
  active_referral_links: ActiveReferralLinks;

  // H. Расширенная аналитика периода
  deals_created_period: number;
  paid_deals_period: number;
  turnover_paid_period_kopeks: number;
  payments_period_count: number;
  period_platform_share_kopeks: number;
  earnings_by_role_period_kopeks: Record<string, number>;
  previous_period: FinancePeriodComparison | null;
  funnel: FinanceFunnelStage[];
  take_rate_pct: number;
  conversion_to_paid_pct: number;
  rejection_rate_pct: number;
  refund_rate_pct: number;
  avg_hours_to_payment: number | null;
  avg_hours_to_first_contact: number | null;
  median_order_value_kopeks: number;
  max_order_value_kopeks: number;
  amounts_histogram: FinanceAmountBucket[];
  participants: FinanceParticipantCounts;
  payouts: FinancePayoutQueue;
  deals_heatmap: number[][];
};

export type AdminAuditEntry = {
  id: string;
  actor_id: string;
  target_user_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export type AdminAuditListResponse = {
  items: AdminAuditEntry[];
  total: number;
};

export type AdminBalanceAdjustmentRequest = {
  amount_kopeks: number;
  reason: string;
};

export type AdminBalanceAdjustmentResponse = {
  user: AdminUserRead;
  ledger_entry: LedgerEntryRead;
};

export type AdminPartnerCardSet = {
  card_number: string;
};

export type PaymentRequisites = {
  collection_card_full: string | null;
  payment_link: string | null;
  available: boolean;
};

export type BloggerProfile = {
  id: string;
  user_id: string;
  name: string;
  telegram_username?: string;
  profile_image_url?: string;
  category?: string;
  description?: string;
  audience_size?: number;
  price_per_post?: number;
  gender?: string;
};

// ─── Telegram Channel Subscription ─────────────────────────────────────────

export type TelegramChannelConfigRead = {
  channel_id: string;
  channel_title: string;
  channel_url: string;
  is_enabled: boolean;
};

export type TelegramChannelConfigSet = {
  channel_id: string;
  channel_title: string;
  channel_url: string;
  is_enabled: boolean;
};

export type TelegramChannelStatsResponse = {
  total: number;
  today: number;
  this_week: number;
  this_month: number;
  period_count: number | null;
};

export type TelegramChannelMemberCountResponse = {
  count: number | null;
};

export type TelegramChannelDiagnoseResponse = {
  bot_configured: boolean;
  chat_found: boolean;
  chat_title: string;
  bot_status: string;
  can_check_members: boolean;
  member_count: number | null;
  error_hint: string;
};

export type DailyCountPoint = {
  date: string;
  count: number;
};

export type AdminDailySeriesResponse = {
  days: number;
  series: DailyCountPoint[];
};
