/**
 * API client: BASE_URL is the API root; paths are relative (e.g. /services/, /chats/).
 *
 * - `EXPO_PUBLIC_API_URL` overrides everything when set (e.g. Android emulator:
 *   http://10.0.2.2:8000/api — physical device: http://<your-lan-ip>:8000/api).
 * - In __DEV__, default is local `make dev` backend; release builds default to production.
 */

import { clearStoredTokens } from "./storage";

const PROD_API = "https://apiary.selmangunes.com/api";
const DEV_LOCAL_API = "http://localhost:8000/api";

const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const BASE_URL =
  envUrl && envUrl.length > 0
    ? envUrl
    : __DEV__
      ? DEV_LOCAL_API
      : PROD_API;

let authToken: string | null = null;
let refreshToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setAuthTokens(access: string, refresh: string): void {
  authToken = access;
  refreshToken = refresh;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

/** Clears in-memory tokens and persistent storage. */
export async function clearAuth(): Promise<void> {
  authToken = null;
  refreshToken = null;
  await clearStoredTokens();
}

export interface RequestConfig extends Omit<RequestInit, "body"> {
  params?: Record<string, string | number | boolean | undefined>;
  body?: object | string;
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = path.startsWith("http")
    ? path
    : `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
}

export async function apiRequest<T>(
  path: string,
  config: RequestConfig = {},
): Promise<T> {
  const { params, body, headers: customHeaders, ...init } = config;
  const url = buildUrl(path, params);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const response = await fetch(url, {
    ...init,
    headers,
    body:
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message =
        json.detail || json.message || json.error || JSON.stringify(json);
    } catch {
      message = message || response.statusText;
    }
    throw new Error(message);
  }
  const contentType = response.headers.get("content-type");
  const text = await response.text();
  if (contentType?.includes("application/json") && text) {
    return JSON.parse(text) as T;
  }
  return undefined as unknown as T;
}

export { BASE_URL };
