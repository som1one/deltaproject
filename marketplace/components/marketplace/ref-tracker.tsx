"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "marketplace_referral_code";

export function readReferralCode(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function clearReferralCode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function RefTrackerInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      window.localStorage.setItem(STORAGE_KEY, ref);
    }
  }, [searchParams]);

  return null;
}

// Ловит ?ref= на любой странице маркета: код лежит в localStorage до регистрации,
// поэтому приглашённый может сначала посмотреть платформу и зарегистрироваться позже.
export function RefTracker() {
  return (
    <Suspense fallback={null}>
      <RefTrackerInner />
    </Suspense>
  );
}
