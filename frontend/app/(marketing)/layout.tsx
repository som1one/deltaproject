import type { ReactNode } from "react";

import { MarketingNavShell } from "@/components/marketing/marketing-nav-shell";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingNavShell />
      {children}
    </>
  );
}
