import type { ReactNode } from "react";

import { AdMarketplaceShell } from "./stitch-marketplace";

export function MarketplaceShell({ children }: { children: ReactNode }) {
  return <AdMarketplaceShell>{children}</AdMarketplaceShell>;
}
