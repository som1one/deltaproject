"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function RefTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref && typeof window !== "undefined") {
      window.localStorage.setItem("marketplace_referral_code", ref);
    }
  }, [searchParams]);

  return null;
}
