/**
 * Auth context: current user, login, register, logout, and session restore.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { UserSummary } from "../api/types";
import * as authApi from "../api/auth";
import { useNotificationStore } from "../store/useNotificationStore";
import type { LoginRequest, RegisterRequest } from "../api/auth";
import { getMe } from "../api/users";
import { getStoredTokens } from "../api/storage";
import { setAuthTokens, getRefreshToken } from "../api/client";

interface AuthState {
  user: UserSummary | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    await authApi.login(body);
    await refreshUser();
  }, [refreshUser]);

  const register = useCallback(async (body: RegisterRequest) => {
    await authApi.register(body);
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await authApi.logout();
    useNotificationStore.getState().reset();
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const tokens = await getStoredTokens();
      if (!tokens || cancelled) {
        setIsLoading(false);
        return;
      }
      setAuthTokens(tokens.access, tokens.refresh);
      try {
        const u = await getMe();
        if (!cancelled) setUser(u);
      } catch {
        const refresh = getRefreshToken();
        if (refresh && !cancelled) {
          try {
            await authApi.refresh({ refresh });
            const u = await getMe();
            if (!cancelled) setUser(u);
          } catch {
            await authApi.logout();
          }
        }
      }
      if (!cancelled) setIsLoading(false);
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
