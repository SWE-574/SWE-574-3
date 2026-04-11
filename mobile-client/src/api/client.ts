/**
 * API client for The Hive API (apiary.selmangunes.com).
 * BASE_URL matches API root; paths are relative to /api (e.g. /services/, /chats/).
 * Docs: https://apiary.selmangunes.com/api/docs/
 */

import { clearStoredTokens } from "./storage";
import { getApiUrl } from "../constants/env";

const BASE_URL = getApiUrl();

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
  params?: Record<
    string,
    string | number | boolean | Array<string | number | boolean> | undefined
  >;
  body?: object | string | FormData;
}

function buildUrl(
  path: string,
  params?: Record<
    string,
    string | number | boolean | Array<string | number | boolean> | undefined
  >,
): string {
  const url = path.startsWith("http")
    ? path
    : `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          search.append(key, String(item));
        }
      }
      continue;
    }

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
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
          : isFormData
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
