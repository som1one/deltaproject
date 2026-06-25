import type { MarketingNavItem } from "@/components/marketing/marketing-nav";
import { appConfig } from "@/lib/config";

export const NAV_ITEMS: MarketingNavItem[] = [
  { href: "/", label: "Главная" },
  { href: appConfig.marketplaceUrl, label: "Каталог" },
  { href: "/contacts", label: "Контакты" },
  { href: "/faq", label: "FAQ" },
];

export const NAV_CTA: MarketingNavItem = { href: "/register", label: "Войти" };

const BRAND_SUB_MAP: Record<string, string> = {
  "/faq": "агентство · faq",
  "/contacts": "агентство · контакты",
};

/**
 * Returns the brandSub subtitle for a given marketing pathname.
 * Falls back to "агентство" for unrecognized paths.
 */
export function getBrandSub(pathname: string): string {
  return BRAND_SUB_MAP[pathname] ?? "агентство";
}
