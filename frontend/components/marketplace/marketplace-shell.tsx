import type { ReactNode } from "react";

import { AdMarketplaceShell } from "@/components/marketplace/stitch-marketplace";

export function MarketplaceShell({ children }: { children: ReactNode }) {
  return <AdMarketplaceShell>{children}</AdMarketplaceShell>;
}
