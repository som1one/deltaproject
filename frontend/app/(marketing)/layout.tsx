import type { ReactNode } from "react";

import { AgencyNav } from "@/components/marketing/agency-nav";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AgencyNav />
      {children}
    </>
  );
}
