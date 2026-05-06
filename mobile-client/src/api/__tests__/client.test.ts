/**
 * Unit tests for API client: apiRequest, URL building, auth header, error handling.
 */

import {
  apiRequest,
  setAuthToken,
  setAuthTokens,
  getAuthToken,
  getRefreshToken,
  clearAuth,
  BASE_URL,
  ApiNetworkError,
  ApiHttpError,
  OfflineMutationError,
} from "../client";
import { mockFetchResolve, mockFetchReject, getLastFetchCall, getLastFetchBody } from "./helpers";
import { useConnectivityStore } from "../../store/connectivityStore";

function setOnline(isOnline: boolean) {
  useConnectivityStore.setState({
    isOnline,
    isInternetReachable: isOnline,
    lastChangeAt: Date.now(),
  });
}

describe("client", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
    setAuthToken(null);
    setAuthTokens("", "");
    setAuthToken(null); // ensure null after setAuthTokens clears in-memory state
    setOnline(true);
  });

  describe("apiRequest", () => {
    it("builds URL with BASE_URL for relative path", async () => {
      mockFetchResolve({ id: "1" });
      await apiRequest<{ id: string }>("/services/");
      const { url } = getLastFetchCall();
      expect(url).toBe(`${BASE_URL}/services/`);
    });

    it("appends path without double slash when path starts with /", async () => {
      mockFetchResolve({});
      await apiRequest("/users/me/");
      expect(getLastFetchCall().url).toBe(`${BASE_URL}/users/me/`);
    });

    it("adds params to URL", async () => {
      mockFetchResolve({ results: [] });
      await apiRequest("/services/", { params: { page: 1, page_size: 10, type: "Offer" } });
      const { url } = getLastFetchCall();
      expect(url).toContain("page=1");
      expect(url).toContain("page_size=10");
      expect(url).toContain("type=Offer");
    });

    it("omits undefined params", async () => {
      mockFetchResolve({});
      await apiRequest("/x/", { params: { a: 1, b: undefined } });
      const { url } = getLastFetchCall();
      expect(url).toContain("a=1");
      expect(url).not.toMatch(/[?&]b=/);
    });

    it("uses absolute URL when path starts with http", async () => {
      mockFetchResolve({});
      await apiRequest("https://other.com/foo");
      expect(getLastFetchCall().url).toBe("https://other.com/foo");
    });

    it("sends GET by default", async () => {
      mockFetchResolve({});
      await apiRequest("/services/");
      expect(getLastFetchCall().init?.method).toBeUndefined();
    });

    it("sends POST with JSON body", async () => {
      mockFetchResolve({ id: "1" });
      const body = { title: "Test", type: "Offer" };
      await apiRequest("/services/", { method: "POST", body });
      const { init } = getLastFetchCall();
      expect(init?.method).toBe("POST");
      expect(getLastFetchBody()).toEqual(body);
      expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    });

    it("sends FormData without forcing JSON content-type", async () => {
      mockFetchResolve({ id: "1" });
      const body = new FormData();
      body.append("title", "Test");
      await apiRequest("/services/", { method: "POST", body });
      const { init } = getLastFetchCall();
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(body);
      expect(init?.headers).not.toMatchObject({ "Content-Type": "application/json" });
    });

    it("adds Authorization header when auth token is set", async () => {
      setAuthToken("secret-token");
      mockFetchResolve({});
      await apiRequest("/users/me/");
      expect(getLastFetchCall().init?.headers).toMatchObject({
        Authorization: "Bearer secret-token",
      });
    });

    it("returns parsed JSON when content-type is application/json", async () => {
      const data = { id: "1", name: "Test" };
      mockFetchResolve(data);
      const result = await apiRequest<typeof data>("/services/1/");
      expect(result).toEqual(data);
    });

    it("returns undefined for empty JSON response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(""),
      });
      const result = await apiRequest<void>("/services/1/", { method: "DELETE" });
      expect(result).toBeUndefined();
    });

    it("throws on non-ok response with detail message", async () => {
      mockFetchReject("Invalid credentials", 401);
      await expect(apiRequest("/auth/login/", { method: "POST", body: {} })).rejects.toThrow(
        "Invalid credentials"
      );
    });

    it("throws on non-ok with message fallback", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve(JSON.stringify({ message: "Server error" })),
      });
      await expect(apiRequest("/x/")).rejects.toThrow("Server error");
    });

    it("throws ApiHttpError with status on non-ok responses", async () => {
      mockFetchReject("Unauthorized", 401);
      try {
        await apiRequest("/users/me/");
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiHttpError);
        expect((e as ApiHttpError).status).toBe(401);
      }
    });

    it("throws ApiNetworkError when fetch itself rejects", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"));
      try {
        await apiRequest("/users/me/");
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiNetworkError);
      }
    });
  });

  describe("offline mutation gate", () => {
    it("blocks POST when offline without calling fetch", async () => {
      setOnline(false);
      await expect(
        apiRequest("/services/", { method: "POST", body: { title: "x" } }),
      ).rejects.toBeInstanceOf(OfflineMutationError);
      expect((global.fetch as jest.Mock)).not.toHaveBeenCalled();
    });

    it.each(["PUT", "PATCH", "DELETE"])(
      "blocks %s when offline",
      async (method) => {
        setOnline(false);
        await expect(
          apiRequest(`/services/1/`, { method }),
        ).rejects.toBeInstanceOf(OfflineMutationError);
      },
    );

    it("allows GET while offline (cached fetch logic decides what to do)", async () => {
      setOnline(false);
      // GET passes the gate; the underlying fetch will then fail with a
      // network error, which callers handle separately.
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("offline"));
      await expect(apiRequest("/services/")).rejects.toBeInstanceOf(ApiNetworkError);
    });

    it("does not block mutations when back online", async () => {
      setOnline(true);
      mockFetchResolve({ id: "1" });
      await apiRequest("/services/", { method: "POST", body: {} });
      expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(1);
    });
  });

  describe("auth token helpers", () => {
    it("setAuthToken and getAuthToken", () => {
      expect(getAuthToken()).toBeNull();
      setAuthToken("access");
      expect(getAuthToken()).toBe("access");
      setAuthToken(null);
      expect(getAuthToken()).toBeNull();
    });

    it("setAuthTokens sets both access and refresh", () => {
      setAuthTokens("a", "r");
      expect(getAuthToken()).toBe("a");
      expect(getRefreshToken()).toBe("r");
    });

    it("clearAuth clears in-memory tokens", async () => {
      setAuthTokens("a", "r");
      await clearAuth();
      expect(getAuthToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });
});
