/**
 * 401 / refresh-token cascade tests for the mobile API client.
 *
 * Covers issue #452: before this change, every non-OK response (including 401
 * after JWT expiry) threw a generic Error. The user was trapped on stale
 * screens until the app was force-killed.
 */

import {
  apiRequest,
  setAuthTokens,
  setAuthToken,
  clearAuth,
  getAuthToken,
  getRefreshToken,
  onAuthEvent,
  ApiHttpError,
} from "../client";
import { useConnectivityStore } from "../../store/connectivityStore";

function setOnline(isOnline: boolean) {
  useConnectivityStore.setState({
    isOnline,
    isInternetReachable: isOnline,
    lastChangeAt: Date.now(),
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("apiRequest 401 / refresh cascade", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
    setAuthToken(null);
    setAuthTokens("", "");
    setAuthToken(null);
    setOnline(true);
  });

  it("refreshes the access token and retries the original request once", async () => {
    setAuthTokens("expired-access", "refresh-token");

    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      // 1) Original request with the expired access token → 401
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Token expired" }))
      // 2) /auth/refresh/ — issues a new access token
      .mockResolvedValueOnce(jsonResponse(200, { access: "fresh-access" }))
      // 3) Retried original request — succeeds
      .mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));

    const result = await apiRequest<{ id: string }>("/users/me/");

    expect(result).toEqual({ id: "u1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Original request used the stale token.
    const firstHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe("Bearer expired-access");

    // Refresh call goes to /auth/refresh/ with the refresh token in the body.
    const refreshUrl = fetchMock.mock.calls[1][0] as string;
    expect(refreshUrl).toContain("/auth/refresh/");
    const refreshBody = JSON.parse(
      fetchMock.mock.calls[1][1].body as string,
    ) as { refresh: string };
    expect(refreshBody).toEqual({ refresh: "refresh-token" });

    // Retry uses the new access token.
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-access");

    expect(getAuthToken()).toBe("fresh-access");
  });

  it("clears tokens and emits auth:logout when refresh fails", async () => {
    setAuthTokens("expired-access", "bad-refresh");

    const fetchMock = global.fetch as jest.Mock;
    fetchMock
      // 1) Original request → 401
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Token expired" }))
      // 2) /auth/refresh/ → 401 (refresh itself rejected)
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Refresh expired" }));

    const logoutListener = jest.fn();
    const unsubscribe = onAuthEvent("auth:logout", logoutListener);

    try {
      await expect(apiRequest("/users/me/")).rejects.toBeInstanceOf(ApiHttpError);
    } finally {
      unsubscribe();
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logoutListener).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("emits auth:logout exactly once when several concurrent 401s share a failing refresh", async () => {
    setAuthTokens("expired-access", "bad-refresh");

    const fetchMock = global.fetch as jest.Mock;
    // Hold the /auth/refresh/ response so all N callers observe the same
    // in-flight refresh promise and resume from the same `null` resolution.
    let resolveRefresh!: (value: Response) => void;
    const refreshDeferred = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    fetchMock.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/auth/refresh/")) {
        return refreshDeferred;
      }
      return Promise.resolve(jsonResponse(401, { detail: "Token expired" }));
    });

    const logoutListener = jest.fn();
    const unsubscribe = onAuthEvent("auth:logout", logoutListener);

    try {
      const concurrentRequests = Array.from({ length: 5 }, (_, idx) =>
        apiRequest(`/users/me/?req=${idx}`).catch((err) => err),
      );

      // Let all callers reach `await refreshAccessTokenOnce()` before the
      // shared refresh resolves. Without the loggingOut guard, every caller
      // would re-enter the `else` branch and emit `auth:logout` again.
      await Promise.resolve();
      resolveRefresh(jsonResponse(401, { detail: "Refresh expired" }));

      const results = await Promise.all(concurrentRequests);
      for (const result of results) {
        expect(result).toBeInstanceOf(ApiHttpError);
      }
    } finally {
      unsubscribe();
    }

    expect(logoutListener).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("does not attempt refresh when calling /auth/refresh/ itself", async () => {
    setAuthTokens("any-access", "any-refresh");

    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { detail: "Refresh expired" }),
    );

    await expect(
      apiRequest("/auth/refresh/", { method: "POST", body: { refresh: "x" } }),
    ).rejects.toBeInstanceOf(ApiHttpError);

    // No second call to /auth/refresh/ — would have been a refresh-on-refresh loop.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not attempt refresh when no refresh token is stored", async () => {
    setAuthToken("only-access");

    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { detail: "Token expired" }),
    );

    await expect(apiRequest("/users/me/")).rejects.toBeInstanceOf(ApiHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates non-401 errors without touching the refresh path", async () => {
    setAuthTokens("a", "r");

    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { detail: "Server error" }),
    );

    await expect(apiRequest("/users/me/")).rejects.toBeInstanceOf(ApiHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  afterAll(async () => {
    await clearAuth();
  });
});
