"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { AuthProvider } from "@/lib/auth-context";
import { createQueryClient } from "@/lib/query-client";
import { ToastProvider } from "@/components/common/toast";

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
