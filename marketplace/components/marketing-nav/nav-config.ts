import type { MarketingNavItem } from "./marketing-nav";

export const NAV_ITEMS: MarketingNavItem[] = [
  { href: "/", label: "Каталог" },
  { href: "/support", label: "Поддержка" },
];

export const NAV_CTA: MarketingNavItem = {
  href: "/auth/login",
  label: "Войти",
};

export const NAV_CTA_REGISTER: MarketingNavItem = {
  href: "/auth/register",
  label: "Регистрация",
};

/**
 * Returns the brandSub subtitle for the marketplace navigation bar.
 */
export function getBrandSub(): string {
  return "агентство · каталог";
}
