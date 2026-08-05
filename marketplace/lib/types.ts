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
  photo_url: string | null;
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
  | "OFFER_PENDING"
  | "OFFER_DECLINED"
  | "PENDING_PAYMENT"
  | "PAYMENT_FAILED"
  | "ESCROW_HELD"
  | "BLOGGER_CONFIRMED"
  | "COMPLETED"
  | "REFUNDED"
  | "CANCELLED";

/** Тип услуги из реестра (правится в админке главного сайта). */
export type ServiceType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

/** Позиция прайс-листа автора в публичной карточке. */
export type PriceItemPublic = {
  service_type_id: string;
  code: string;
  name: string;
  price_kopeks: number;
  description: string | null;
};

/** Позиция прайс-листа в кабинете автора. */
export type PriceItemFull = PriceItemPublic & {
  id: string;
  is_enabled: boolean;
};

/** Данные аудитории (заполняются автором, подтверждаются админом). */
export type AudienceStats = {
  audience_age?: AudienceGroup[] | null;
  audience_gender?: { female: number; male: number } | null;
  audience_geo?: AudienceGroup[] | null;
  audience_devices?: AudienceGroup[] | null;
  avg_views?: number | null;
  posting_frequency?: string | null;
  response_time?: string | null;
  subscriber_count?: number | null;
};

export type AudienceSubmissionStatus = "pending" | "approved" | "rejected";

export type AudienceSubmission = {
  id: string;
  profile_id: string;
  status: AudienceSubmissionStatus;
  payload: AudienceStats;
  screenshots: string[];
  review_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type PremiumRequest = {
  id: string;
  user_id: string;
  status: "new" | "contacted" | "closed";
  comment: string | null;
  created_at: string;
  resolved_at: string | null;
};

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
  orders_enabled?: boolean;
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

/** Привязка Telegram-бота для уведомлений: диплинк и текущий статус. */
export type TelegramConnectStatus = {
  connect_url: string;
  connected: boolean;
};

/** Действующие тарифы платформы — для публичных документов (оферта). */
export type MarketplaceTariffs = {
  platform_commission_pct: number;
  worker_referral_commission_pct: number;
  blogger_referral_commission_pct: number;
};

/** Распределение аудитории по группам с процентами (сумма = 100). */
export type AudienceGroup = { label: string; percent: number };

export type BloggerProfileFull = BloggerCard & {
  description: string | null;
  portfolio_links: string[];
  /** Названия публикаций из портфолио, параллельно portfolio_links. */
  portfolio_titles?: string[] | null;
  /** Обложки работ, параллельно portfolio_links; null — без обложки. */
  portfolio_covers?: (string | null)[] | null;
  social_links: string[];
  preferred_contact: string | null;
  orders_enabled: boolean;
  updated_at: string;
  /** Возрастные группы аудитории. */
  audience_age?: AudienceGroup[] | null;
  /** Пол аудитории — проценты женщин/мужчин. */
  audience_gender?: { female: number; male: number } | null;
  /** География аудитории — топ-регионы. */
  audience_geo?: AudienceGroup[] | null;
  /** Устройства — Mobile / Desktop / TV с процентами. */
  audience_devices?: AudienceGroup[] | null;
  /** Форматы, в которых автор берётся за интеграции. */
  formats?: string[] | null;
  /** Средние просмотры одной публикации. */
  avg_views?: number | null;
  /** Частота публикаций, свободный текст: «3 видео в неделю». */
  posting_frequency?: string | null;
  /** Среднее время ответа автора, свободный текст: «≈ 2 часа». */
  response_time?: string | null;
  /** Прайс-лист по типам услуг из реестра (включённые позиции). */
  price_list?: PriceItemPublic[];
  /** Подтверждённая админом статистика аудитории. */
  audience_stats?: AudienceStats | null;
  audience_verified_at?: string | null;
  show_portfolio?: boolean;
  show_socials?: boolean;
};

/** Профиль в кабинете автора: полный прайс и статус заявки на аудиторию. */
export type BloggerSelfProfile = BloggerProfileFull & {
  price_list_full: PriceItemFull[];
  latest_audience_submission: AudienceSubmission | null;
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
  /** Полный цикл: услуга, оффер, сроки, сдача работы, окно приёмки. */
  service_type_id: string | null;
  service_type_name: string | null;
  offered_by: string | null;
  deadline_days: number | null;
  publish_at: string | null;
  accepted_at: string | null;
  deadline_at: string | null;
  work_submitted_at: string | null;
  work_result: string | null;
  review_deadline_at: string | null;
  decline_reason: string | null;
  created_at: string;
  paid_at: string | null;
  blogger_confirmed_at: string | null;
  completed_at: string | null;
  updated_at: string;
  blogger_name: string | null;
  client_name: string | null;
};

export type Review = {
  id: string;
  order_id: string;
  author_id: string;
  target_id: string;
  rating: number;
  text: string | null;
  created_at: string;
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
  /** Отзывы по завершённой сделке: свой и адресованный мне. */
  my_review: Review | null;
  review_of_me: Review | null;
};

/* ── Чаты ──────────────────────────────────────────────────── */

export type MessageKind = "text" | "image" | "video" | "file" | "offer" | "system";

/** Ответ /marketplace/uploads/chat. */
export type ChatUploadResult = {
  url: string;
  kind: "image" | "video" | "file";
  name: string;
  size_bytes: number;
};

export type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  kind: MessageKind;
  order_id: string | null;
  /** Снапшот условий оффера / вложение для карточки в чате. */
  payload: {
    order_id?: string;
    service_type_name?: string | null;
    amount_kopeks?: number;
    deadline_days?: number | null;
    publish_at?: string | null;
    message?: string;
    status?: string;
    attachment_url?: string;
    attachment_name?: string;
    attachment_size?: number;
  } | null;
  is_read: boolean;
  created_at: string;
};

export type ChatPartner = {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  is_blogger: boolean;
};

export type ChatThread = {
  partner: ChatPartner;
  last_message: ChatMessage;
  unread_count: number;
};

export type ThreadsList = {
  items: ChatThread[];
  total_unread: number;
};

export type Conversation = {
  items: ChatMessage[];
  total: number;
  page: number;
  page_size: number;
  partner: ChatPartner | null;
};

export type UserPeek = {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  is_blogger: boolean;
  rating: number | null;
  reviews_count: number;
  completed_orders: number;
  registered_at: string | null;
  category: string | null;
};

/* ── Кабинет воркера ──────────────────────────────────────── */

export type WorkerStats = {
  total_earnings_kopeks: number;
  balance_kopeks: number;
  referral_count: number;
};

export type WorkerReferral = {
  client_id: string;
  client_name: string;
  registered_at: string;
};

export type WorkerCommission = {
  order_id: string;
  client_name: string;
  order_amount_kopeks: number;
  commission_pct: number;
  commission_amount_kopeks: number;
  date: string;
};

export type OrdersResponse = {
  items: Order[];
  total: number;
  page: number;
  page_size: number;
};

export type SupportTicketSubject = "dispute" | "payment" | "technical" | "general";

export type SupportTicket = {
  id: string;
  order_id: string | null;
  subject: SupportTicketSubject;
  submitter_id: string;
  submitter_role: string;
  message: string;
  status: "open" | "resolved";
  resolution_decision: string | null;
  resolution_reason: string | null;
  created_at: string;
  resolved_at: string | null;
};
