/**
 * Unit tests for Auth API: login, register, refresh, logout.
 */

import * as storage from "../storage";
import { login, register, refresh, logout } from "../auth";
import { getAuthToken, getRefreshToken, setAuthToken, setAuthTokens } from "../client";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

jest.mock("../storage", () => ({
  getStoredTokens: jest.fn(),
  setStoredTokens: jest.fn().mockResolvedValue(undefined),
  clearStoredTokens: jest.fn().mockResolvedValue(undefined),
}));

describe("auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
    setAuthToken(null);
    setAuthTokens("", "");
  });

  describe("login", () => {
    it("POSTs to /auth/login/ and sets tokens", async () => {
      const tokens = { access: "a1", refresh: "r1" };
      mockFetchResolve(tokens);
      const body = { email: "u@x.com", password: "pass" };
      const result = await login(body);
      expect(result).toEqual(tokens);
      const { url, init } = getLastFetchCall();
      expect(url).toContain("/auth/login/");
      expect(init?.method).toBe("POST");
      expect(getLastFetchBody()).toEqual(body);
      expect(storage.setStoredTokens).toHaveBeenCalledWith(tokens);
      expect(getAuthToken()).toBe("a1");
      expect(getRefreshToken()).toBe("r1");
    });

    it("handles response with only access token", async () => {
      mockFetchResolve({ access: "a2" });
      await login({ password: "p" });
      expect(getAuthToken()).toBe("a2");
      expect(storage.setStoredTokens).not.toHaveBeenCalled();
    });
  });

  describe("register", () => {
    it("POSTs to /auth/register/ and sets tokens", async () => {
      const tokens = { access: "a", refresh: "r" };
      mockFetchResolve(tokens);
      const body = { email: "e@x.com", username: "u", password: "p" };
      const result = await register(body);
      expect(result).toEqual(tokens);
      expect(getLastFetchCall().url).toContain("/auth/register/");
      expect(getLastFetchBody()).toEqual(body);
      expect(storage.setStoredTokens).toHaveBeenCalledWith(tokens);
    });
  });

  describe("refresh", () => {
    it("POSTs to /auth/refresh/ and updates access token", async () => {
      mockFetchResolve({ access: "new-access" });
      const result = await refresh({ refresh: "old-refresh" });
      expect(result).toEqual({ access: "new-access" });
      expect(getLastFetchBody()).toEqual({ refresh: "old-refresh" });
      expect(getAuthToken()).toBe("new-access");
    });
  });

  describe("logout", () => {
    it("calls clearStoredTokens", async () => {
      await logout();
      expect(storage.clearStoredTokens).toHaveBeenCalled();
    });
  });
});
