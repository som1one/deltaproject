"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/types";

/**
 * RoleGuard ensures only allowed roles see the children.
 * - If session not hydrated yet, renders fallback.
 * - If unauthenticated, redirects to `redirectTo` (default "/").
 * - If authenticated but wrong role, redirects to a sensible cabinet for that role.
 */
export const RoleGuard = ({
  allow,
  children,
  redirectTo = "/",
  fallback = null,
}: {
  allow: UserRole | UserRole[];
  children: ReactNode;
  redirectTo?: string;
  fallback?: ReactNode;
}) => {
  const router = useRouter();
  const { isHydrated, isAuthenticated } = useAuth();
  const allowed = useMemo<UserRole[]>(
    () => (Array.isArray(allow) ? allow : [allow]),
    [allow],
  );

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    enabled: isHydrated && isAuthenticated,
  });

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isHydrated, redirectTo, router]);

  useEffect(() => {
    if (!meQuery.data) return;
    if (allowed.includes(meQuery.data.role)) return;
    if (meQuery.data.role === "Admin") {
      router.replace("/admin");
    } else if (meQuery.data.role === "Bloger" || meQuery.data.role === "Worker") {
      router.replace("/cabinet");
    } else {
      router.replace(redirectTo);
    }
  }, [meQuery.data, allowed, router, redirectTo]);

  if (!isHydrated || !isAuthenticated || !meQuery.data) {
    return <>{fallback}</>;
  }
  if (!allowed.includes(meQuery.data.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
