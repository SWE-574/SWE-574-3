/**
 * API client for The Hive API (apiary.selmangunes.com).
 * BASE_URL matches API root; paths are relative to /api (e.g. /services/, /chats/).
 * Docs: https://apiary.selmangunes.com/api/docs/
 */

import { clearStoredTokens } from "./storage";
import { getApiUrl } from "../constants/env";
import { getConnectivitySnapshot } from "../store/connectivityStore";

const BASE_URL = getApiUrl();

/**
 * Lightweight auth event bus. The API client publishes `auth:logout` when a
 * 401 cannot be recovered (refresh failed / no refresh token) so navigation
 * can reset to the login stack. Kept here, not in `store/`, because the API
 * client itself is the lowest layer that detects unrecoverable auth state.
 */
export type AuthEvent = "auth:logout";
type AuthListener = () => void;

const authListeners: Record<AuthEvent, Set<AuthListener>> = {
  "auth:logout": new Set(),
};

export function onAuthEvent(event: AuthEvent, listener: AuthListener): () => void {
  authListeners[event].add(listener);
  return () => {
    authListeners[event].delete(listener);
  };
}

function emitAuthEvent(event: AuthEvent): void {
  for (const listener of authListeners[event]) {
    try {
      listener();
    } catch {
      // Listeners must not break the emit loop. Logout flows are best-effort
      // and the next 401 will retry the cascade if needed.
    }
  }
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

/**
 * Thrown when `fetch` itself fails (no DNS, no route, request aborted).
 * Distinct from HTTP error responses (4xx/5xx) which still throw a plain
 * `ApiHttpError`. Auth restore in `AuthContext` uses this to keep the user
 * signed in across transient network failures rather than logging them out.
 */
export class ApiNetworkError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ApiNetworkError";
    this.cause = cause;
  }
}

/** Thrown for HTTP error responses (4xx/5xx). */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, message: string, body: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Thrown when a mutating request (POST/PUT/PATCH/DELETE) is attempted while
 * the device is offline. The API client refuses these instead of letting
 * them fail at the network layer so the UI can show a meaningful message.
 */
export class OfflineMutationError extends Error {
  constructor() {
    super("You are offline. This action will be available again when you reconnect.");
    this.name = "OfflineMutationError";
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  try {
    await clearStoredTokens();
  } catch {
    // Tokens are already cleared in memory; SecureStore may fail on some devices.
    // Callers must still clear React/session state — do not throw here.
  }
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

/**
 * Paths that must NEVER trigger the 401-refresh cascade. Refreshing on the
 * refresh endpoint itself (or login) would loop; refreshing on logout would
 * resurrect a session the user is trying to end.
 */
const REFRESH_BYPASS_PATHS = ["/auth/refresh/", "/auth/login/", "/auth/logout/"];

function shouldBypassRefresh(path: string): boolean {
  return REFRESH_BYPASS_PATHS.some((suffix) => path.endsWith(suffix));
}

/**
 * In-flight refresh promise so concurrent 401s share a single refresh call
 * instead of racing each other. Cleared as soon as the refresh settles.
 */
let inflightRefresh: Promise<string | null> | null = null;

async function refreshAccessTokenOnce(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  const refresh = refreshToken;
  if (!refresh) return null;

  inflightRefresh = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (!text) return null;
      const data = JSON.parse(text) as { access?: string };
      if (!data.access) return null;
      authToken = data.access;
      return data.access;
    } catch {
      return null;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

async function performRequest(
  url: string,
  init: RequestInit,
  body: object | string | FormData | undefined,
  isFormData: boolean,
): Promise<Response> {
  let serializedBody: BodyInit | undefined;
  if (body !== undefined) {
    if (typeof body === "string") {
      serializedBody = body;
    } else if (isFormData) {
      serializedBody = body as FormData;
    } else {
      serializedBody = JSON.stringify(body);
    }
  }
  return fetch(url, { ...init, body: serializedBody });
}

export async function apiRequest<T>(
  path: string,
  config: RequestConfig = {},
): Promise<T> {
  const { params, body, headers: customHeaders, ...init } = config;
  const url = buildUrl(path, params);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const baseHeaders: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(customHeaders as Record<string, string>),
  };

  const buildHeaders = (token: string | null): Record<string, string> => {
    const next = { ...baseHeaders };
    if (token) next["Authorization"] = `Bearer ${token}`;
    return next;
  };

  const method = (init.method ?? "GET").toUpperCase();
  if (MUTATING_METHODS.has(method) && !getConnectivitySnapshot().isOnline) {
    throw new OfflineMutationError();
  }

  let response: Response;
  try {
    response = await performRequest(
      url,
      { ...init, headers: buildHeaders(authToken) },
      body,
      isFormData,
    );
  } catch (err) {
    // `fetch` rejecting (vs returning a non-OK response) means we never got
    // an HTTP reply — DNS failure, no route, aborted, etc. Surface as a
    // typed network error so callers can branch on it.
    throw new ApiNetworkError(
      err instanceof Error ? err.message : "Network request failed",
      err,
    );
  }

  // 401 cascade: try a single refresh + retry if we have a refresh token and
  // this isn't a request that would loop (refresh / login / logout itself).
  if (
    response.status === 401 &&
    !shouldBypassRefresh(path) &&
    refreshToken
  ) {
    const newAccess = await refreshAccessTokenOnce();
    if (newAccess) {
      try {
        response = await performRequest(
          url,
          { ...init, headers: buildHeaders(newAccess) },
          body,
          isFormData,
        );
      } catch (err) {
        throw new ApiNetworkError(
          err instanceof Error ? err.message : "Network request failed",
          err,
        );
      }
    } else {
      // Refresh failed. The session is unrecoverable from the API client's
      // point of view — clear in-memory + persisted tokens and let the
      // navigator reset to the auth stack via the auth:logout event.
      await clearAuth();
      emitAuthEvent("auth:logout");
    }
  }

  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message =
        json.detail || json.message || json.error || JSON.stringify(json);
    } catch {
      // Non-JSON body (HTML error page, plain text, empty). Do not surface
      // the raw body as the user-facing message — callers render it directly.
      message =
        response.statusText || `Request failed with status ${response.status}`;
    }
    throw new ApiHttpError(response.status, message, text);
  }
  const contentType = response.headers.get("content-type");
  const text = await response.text();
  if (contentType?.includes("application/json") && text) {
    return JSON.parse(text) as T;
  }
  return undefined as unknown as T;
}

export { BASE_URL };
