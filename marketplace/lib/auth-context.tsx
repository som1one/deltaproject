"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { tokenStorage } from "@/lib/storage";

type AuthContextValue = {
  isHydrated: boolean;
  accessToken: string;
  refreshToken: string;
  isAuthenticated: boolean;
  isBlogger: boolean;
  setSession: (accessToken: string, refreshToken: string) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  useEffect(() => {
    const nextAccessToken = tokenStorage.readAccessToken();
    const nextRefreshToken = tokenStorage.readRefreshToken();
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    setIsHydrated(true);
  }, []);

  const setSession = (nextAccessToken: string, nextRefreshToken: string) => {
    tokenStorage.setTokens(nextAccessToken, nextRefreshToken);
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
  };

  const clearSession = () => {
    tokenStorage.clear();
    setAccessToken("");
    setRefreshToken("");
    queryClient.clear();
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Best-effort logout so stale sessions don't trap the user.
    }
    clearSession();
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      isHydrated,
      accessToken,
      refreshToken,
      isAuthenticated: Boolean(accessToken),
      isBlogger: false,
      setSession,
      clearSession,
      logout,
    }),
    [accessToken, isHydrated, refreshToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
