export type UserRole = "Worker" | "Bloger" | "Admin" | "Tech_Admin" | "Client";

export type AuthTokensResponse = {
  message: string;
  token: string;
  refresh_token: string;
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
  payout_card_brand: string | null;
  payout_card_holder: string | null;
  payout_card_bank: string | null;
  blogger_cabinet_locked: boolean;
  referral_invite_url: string | null;
};

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_FAILED"
  | "ESCROW_HELD"
  | "BLOGGER_CONFIRMED"
  | "COMPLETED"
  | "REFUNDED"
  | "CANCELLED";

export type BloggerCard = {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  gender: string | null;
  subscriber_count: number;
  average_price_kopeks: number;
  photo_url: string | null;
  engagement_rate?: number | null;
  rating?: number | null;
  reviews_count?: number;
  platforms?: string[];
  is_active: boolean;
  created_at: string;
};

export type MarketplaceCategory = {
  value: string;
  label: string;
};

export type HeroConfigResponse = {
  categories: MarketplaceCategory[];
  authors_all: BloggerCard[];
  authors_by_category: Record<string, BloggerCard[]>;
};

export type BloggerProfileFull = BloggerCard & {
  description: string | null;
  portfolio_links: string[];
  social_links: string[];
  preferred_contact: string | null;
  orders_enabled: boolean;
  updated_at: string;
};

export type CatalogResponse = {
  items: BloggerCard[];
  total: number;
  page: number;
  page_size: number;
};

export type Order = {
  id: string;
  client_id: string;
  blogger_id: string;
  worker_id: string | null;
  status: OrderStatus;
  amount_kopeks: number;
  message: string;
  platform_commission_pct: number;
  worker_commission_pct: number;
  yookassa_payment_id: string | null;
  payment_url: string | null;
  payment_expires_at: string | null;
  payment_reported_at: string | null;
  created_at: string;
  paid_at: string | null;
  blogger_confirmed_at: string | null;
  completed_at: string | null;
  updated_at: string;
  blogger_name: string | null;
  client_name: string | null;
};

export type SettlementAccount = {
  account_number: string;
  bic: string;
  bank_name: string;
  recipient_name: string;
  updated_at: string;
};

export type CardRequisites = {
  card_number: string;
  card_holder: string | null;
  card_bank: string | null;
  sbp_phone: string | null;
};

export type OrderDetail = Order & {
  settlement_account: SettlementAccount | null;
  card_requisites: CardRequisites | null;
  yookassa_available: boolean;
  available_actions: string[];
};

export type OrdersResponse = {
  items: Order[];
  total: number;
  page: number;
  page_size: number;
};

export type SupportTicket = {
  id: string;
  order_id: string;
  submitter_id: string;
  submitter_role: string;
  message: string;
  status: "open" | "resolved";
  resolution_decision: string | null;
  resolution_reason: string | null;
  created_at: string;
  resolved_at: string | null;
};
