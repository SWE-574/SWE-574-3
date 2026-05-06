/**
 * Auth context: current user, login, register, logout, and session restore.
 *
 * Offline-aware:
 *  - The signed-in shell is cached on disk via `saveCurrentUser` and
 *    re-hydrated immediately on cold start so the app does not block on a
 *    network round-trip.
 *  - Network failures during `getMe` do NOT log the user out — they only
 *    set `isStale` so the UI can show a "showing cached data" hint. Only an
 *    HTTP 401 from `/auth/refresh/` clears the session.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { UserSummary } from "../api/types";
import * as authApi from "../api/auth";
import { useNotificationStore } from "../store/useNotificationStore";
import { initConnectivity } from "../store/connectivityStore";
import type { LoginRequest, RegisterRequest } from "../api/auth";
import { getMe } from "../api/users";
import { getStoredTokens } from "../api/storage";
import {
  setAuthTokens,
  getRefreshToken,
  ApiHttpError,
  ApiNetworkError,
} from "../api/client";
import {
  saveCurrentUser,
  readCurrentUser,
  clearCurrentUser,
  clearAllUserCaches,
} from "../cache/offlineCache";

interface AuthState {
  user: UserSummary | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** True when `user` came from the disk cache and hasn't been confirmed by the server yet. */
  isStale: boolean;
}

interface AuthContextValue extends AuthState {
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthFailure(err: unknown): boolean {
  return err instanceof ApiHttpError && (err.status === 401 || err.status === 403);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);

  const persistUser = useCallback((u: UserSummary) => {
    setUser(u);
    setIsStale(false);
    try {
      saveCurrentUser(u);
    } catch {
      /* cache write failures are non-fatal */
    }
  }, []);

  const clearSessionLocal = useCallback(async (prevUserId: string | null) => {
    setUser(null);
    setIsStale(false);
    clearCurrentUser();
    if (prevUserId) {
      try {
        clearAllUserCaches(prevUserId);
      } catch {
        /* best-effort cache wipe */
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const u = await getMe();
      persistUser(u);
    } catch (err) {
      if (err instanceof ApiNetworkError) {
        // Network blip — keep the (possibly cached) user and signal stale.
        setIsStale(true);
        return;
      }
      // HTTP failure: try once with refresh, then give up.
      const refresh = getRefreshToken();
      if (refresh) {
        try {
          await authApi.refresh({ refresh });
          const u = await getMe();
          persistUser(u);
          return;
        } catch (refreshErr) {
          if (refreshErr instanceof ApiNetworkError) {
            setIsStale(true);
            return;
          }
          // fallthrough to logout
        }
      }
      const prevId = user?.id ?? null;
      await authApi.logout();
      await clearSessionLocal(prevId);
    }
  }, [persistUser, clearSessionLocal, user]);

  const login = useCallback(
    async (body: LoginRequest) => {
      await authApi.login(body);
      await refreshUser();
    },
    [refreshUser],
  );

  const register = useCallback(
    async (body: RegisterRequest) => {
      await authApi.register(body);
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    const prevId = user?.id ?? null;
    await authApi.logout();
    useNotificationStore.getState().reset();
    await clearSessionLocal(prevId);
  }, [user, clearSessionLocal]);

  useEffect(() => {
    let cancelled = false;
    initConnectivity();

    async function restoreSession() {
      const tokens = await getStoredTokens();
      if (!tokens || cancelled) {
        setIsLoading(false);
        return;
      }
      setAuthTokens(tokens.access, tokens.refresh);

      // Hydrate from cached snapshot first so the shell renders immediately.
      const cached = await readCurrentUser();
      if (cached && !cancelled) {
        setUser(cached.data);
        setIsStale(true);
        setIsLoading(false);
      }

      try {
        const u = await getMe();
        if (cancelled) return;
        // Different user than cached? wipe the previous user's caches.
        if (cached && cached.data.id !== u.id) {
          try {
            clearAllUserCaches(cached.data.id);
          } catch {
            /* best-effort */
          }
        }
        persistUser(u);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiNetworkError) {
          // Stay signed in with whatever we have. The connectivity listener
          // will trigger a refresh on reconnect via `useCachedFetch`.
          setIsStale(Boolean(cached));
          return;
        }
        // HTTP error: try refresh once.
        const refresh = getRefreshToken();
        if (refresh) {
          try {
            await authApi.refresh({ refresh });
            const u = await getMe();
            if (!cancelled) persistUser(u);
            return;
          } catch (refreshErr) {
            if (cancelled) return;
            if (refreshErr instanceof ApiNetworkError) {
              setIsStale(Boolean(cached));
              return;
            }
            // refresh itself failed with HTTP — only now we log out.
          }
        }
        const prevId = cached?.data.id ?? null;
        await authApi.logout();
        if (!cancelled) await clearSessionLocal(prevId);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [persistUser, clearSessionLocal]);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isStale,
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
