"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { tokenStorage } from "@/lib/storage";
import type { UserRole } from "@/lib/types";

type AuthContextValue = {
  isHydrated: boolean;
  accessToken: string;
  refreshToken: string;
  isAuthenticated: boolean;
  isBlogger: boolean;
  isClient: boolean;
  isWorker: boolean;
  userRole: UserRole | null;
  userName: string | null;
  userPhoto: string | null;
  setSession: (accessToken: string, refreshToken: string) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
};

const ROLE_KEY = "delta_user_role";
const NAME_KEY = "delta_user_name";
const PHOTO_KEY = "delta_user_photo";

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);

  // Fetch user profile to determine role
  const fetchProfile = useCallback(async (token: string) => {
    if (!token) return;
    try {
      const me = await api.getMe();
      setUserRole(me.role);
      setUserName(me.name);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ROLE_KEY, me.role);
        window.localStorage.setItem(NAME_KEY, me.name);
      }
      // Фото живёт в профиле автора; у заказчиков и воркеров его нет
      if (me.role === "Bloger") {
        try {
          const profile = await api.getSelfProfile();
          setUserPhoto(profile.photo_url ?? null);
          if (typeof window !== "undefined") {
            if (profile.photo_url) window.localStorage.setItem(PHOTO_KEY, profile.photo_url);
            else window.localStorage.removeItem(PHOTO_KEY);
          }
        } catch {
          // Профиль ещё не создан — остаёмся на монограмме
        }
      } else {
        setUserPhoto(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(PHOTO_KEY);
      }
    } catch {
      // Token might be expired — clear cached role
      setUserRole(null);
      setUserName(null);
      setUserPhoto(null);
    }
  }, []);

  useEffect(() => {
    const nextAccessToken = tokenStorage.readAccessToken();
    const nextRefreshToken = tokenStorage.readRefreshToken();
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);

    // Restore cached role from localStorage for instant hydration
    if (typeof window !== "undefined" && nextAccessToken) {
      const cachedRole = window.localStorage.getItem(ROLE_KEY) as UserRole | null;
      const cachedName = window.localStorage.getItem(NAME_KEY);
      const cachedPhoto = window.localStorage.getItem(PHOTO_KEY);
      if (cachedRole) setUserRole(cachedRole);
      if (cachedName) setUserName(cachedName);
      if (cachedPhoto) setUserPhoto(cachedPhoto);
      // Also fetch fresh profile in background
      fetchProfile(nextAccessToken);
    }

    setIsHydrated(true);
  }, [fetchProfile]);

  const setSession = (nextAccessToken: string, nextRefreshToken: string) => {
    tokenStorage.setTokens(nextAccessToken, nextRefreshToken);
    setAccessToken(nextAccessToken);
    setRefreshToken(nextRefreshToken);
    // Fetch profile to get the role
    fetchProfile(nextAccessToken);
  };

  const clearSession = () => {
    tokenStorage.clear();
    setAccessToken("");
    setRefreshToken("");
    setUserRole(null);
    setUserName(null);
    setUserPhoto(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ROLE_KEY);
      window.localStorage.removeItem(NAME_KEY);
      window.localStorage.removeItem(PHOTO_KEY);
    }
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
      isBlogger: userRole === "Bloger",
      isClient: userRole === "Client",
      isWorker: userRole === "Worker",
      userRole,
      userName,
      userPhoto,
      setSession,
      clearSession,
      logout,
    }),
    [accessToken, isHydrated, refreshToken, userRole, userName, userPhoto],
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
