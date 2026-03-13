/**
 * Auth API – login, register, refresh token, logout
 * POST /api/auth/login/, POST /api/auth/register/, POST /api/auth/refresh/
 */

import { apiRequest, setAuthToken, setAuthTokens, clearAuth } from "./client";
import { setStoredTokens } from "./storage";
import type { TokenPair } from "./types";

export interface LoginRequest {
  username?: string;
  email?: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username?: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface RefreshRequest {
  refresh: string;
}

export async function login(body: LoginRequest): Promise<TokenPair> {
  const data = await apiRequest<TokenPair>("/auth/login/", {
    method: "POST",
    body,
  });
  if (data.access && data.refresh) {
    setAuthTokens(data.access, data.refresh);
    await setStoredTokens({ access: data.access, refresh: data.refresh });
  } else if (data.access) {
    setAuthToken(data.access);
  }
  return data;
}

export async function register(body: RegisterRequest): Promise<TokenPair> {
  const data = await apiRequest<TokenPair>("/auth/register/", {
    method: "POST",
    body,
  });
  if (data.access && data.refresh) {
    setAuthTokens(data.access, data.refresh);
    await setStoredTokens({ access: data.access, refresh: data.refresh });
  } else if (data.access) {
    setAuthToken(data.access);
  }
  return data;
}

export async function refresh(body: RefreshRequest): Promise<TokenPair> {
  const data = await apiRequest<TokenPair>("/auth/refresh/", {
    method: "POST",
    body,
  });
  if (data.access) setAuthToken(data.access);
  return data;
}

/** Clears auth state (in-memory and stored tokens). */
export async function logout(): Promise<void> {
  await clearAuth();
}
