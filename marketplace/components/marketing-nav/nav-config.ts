import type { MarketingNavItem } from "./marketing-nav";

export const NAV_ITEMS: MarketingNavItem[] = [
  { href: "/", label: "Каталог" },
  { href: "/support", label: "Поддержка" },
];

export const NAV_CTA: MarketingNavItem = {
  href: "/auth/login",
  label: "Личный кабинет",
};

/**
 * Returns the brandSub subtitle for the marketplace navigation bar.
 */
export function getBrandSub(): string {
  return "агентство · каталог";
}
