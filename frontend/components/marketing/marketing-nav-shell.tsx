"use client";

import { usePathname } from "next/navigation";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { getBrandSub, NAV_ITEMS, NAV_CTA } from "@/components/marketing/nav-config";

export const MarketingNavShell = () => {
  const pathname = usePathname();
  const brandSub = getBrandSub(pathname);

  return <MarketingNav brandSub={brandSub} items={NAV_ITEMS} cta={NAV_CTA} />;
};
