export type UserRole = "Worker" | "Bloger" | "Admin" | "Tech_Admin";

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
