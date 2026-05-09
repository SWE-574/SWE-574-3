/**
 * AuthContext logout tests.
 *
 * The bug being guarded against: a thrown error in token cleanup or the
 * notification store reset would short-circuit the callback before
 * `setUser(null)` ran, leaving the user appearing signed in despite tokens
 * having been wiped. The fix clears local UI state first; native teardown
 * runs as best-effort.
 */

import React from "react";
import { Text, View } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";

// First mount of AuthProvider in CI can take longer than the 5s default
// (Expo / RN test renderer cold start). Local runs are ~1.6s; give CI
// headroom.
jest.setTimeout(20000);

const mockAuthApiLogout = jest.fn();
const mockNotificationReset = jest.fn();
const mockClearCurrentUser = jest.fn();
const mockClearAllUserCaches = jest.fn();
const mockInitConnectivity = jest.fn();
const mockGetStoredTokens = jest.fn();

jest.mock("../../api/auth", () => ({
  __esModule: true,
  login: jest.fn(),
  register: jest.fn(),
  refresh: jest.fn(),
  logout: () => mockAuthApiLogout(),
}));

jest.mock("../../api/users", () => ({
  __esModule: true,
  getMe: jest.fn(),
}));

jest.mock("../../api/storage", () => ({
  __esModule: true,
  getStoredTokens: () => mockGetStoredTokens(),
}));

jest.mock("../../api/client", () => ({
  __esModule: true,
  setAuthTokens: jest.fn(),
  getRefreshToken: jest.fn().mockReturnValue(null),
  ApiHttpError: class ApiHttpError extends Error {
    status = 0;
    body = "";
  },
  ApiNetworkError: class ApiNetworkError extends Error {},
}));

jest.mock("../../store/useNotificationStore", () => ({
  __esModule: true,
  useNotificationStore: {
    getState: () => ({ reset: mockNotificationReset }),
  },
}));

jest.mock("../../store/connectivityStore", () => ({
  __esModule: true,
  initConnectivity: () => mockInitConnectivity(),
}));

jest.mock("../../cache/offlineCache", () => ({
  __esModule: true,
  saveCurrentUser: jest.fn(),
  readCurrentUser: jest.fn().mockResolvedValue(null),
  clearCurrentUser: () => mockClearCurrentUser(),
  clearAllUserCaches: (id: string) => mockClearAllUserCaches(id),
}));

import { AuthProvider, useAuth } from "../AuthContext";

function Probe() {
  const { user, isAuthenticated, logout } = useAuth();
  (globalThis as unknown as { __logout?: () => Promise<void> }).__logout = logout;
  return (
    <View>
      <Text testID="user">{user ? user.id : "null"}</Text>
      <Text testID="auth">{isAuthenticated ? "yes" : "no"}</Text>
    </View>
  );
}

async function renderWithSignedInUser() {
  const cached = {
    data: {
      id: "u-1",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
    },
    cachedAt: Date.now(),
  };
  mockGetStoredTokens.mockResolvedValue({ access: "a", refresh: "r" });
  // Pull the already-mocked modules via require so we can program their
  // return values for this render.
  const offlineCache = jest.requireMock("../../cache/offlineCache");
  offlineCache.readCurrentUser.mockResolvedValue(cached);
  const users = jest.requireMock("../../api/users");
  const { ApiNetworkError } = jest.requireMock("../../api/client");
  // Force getMe to fail with a network error so the provider keeps the
  // cached user instead of trying refresh and clearing the session.
  users.getMe.mockRejectedValue(new ApiNetworkError("offline"));

  const utils = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => {
    expect(utils.getByTestId("user").props.children).toBe("u-1");
  });
  return utils;
}

describe("AuthContext.logout", () => {
  beforeEach(() => {
    mockAuthApiLogout.mockReset().mockResolvedValue(undefined);
    mockNotificationReset.mockReset();
    mockClearCurrentUser.mockReset();
    mockClearAllUserCaches.mockReset();
    mockInitConnectivity.mockReset();
    mockGetStoredTokens.mockReset();
  });

  it("clears user state even when authApi.logout throws", async () => {
    const utils = await renderWithSignedInUser();
    mockAuthApiLogout.mockRejectedValue(new Error("SecureStore unavailable"));

    await act(async () => {
      await (globalThis as unknown as { __logout: () => Promise<void> }).__logout();
    });

    expect(utils.getByTestId("user").props.children).toBe("null");
    expect(utils.getByTestId("auth").props.children).toBe("no");
    expect(mockClearCurrentUser).toHaveBeenCalled();
    expect(mockAuthApiLogout).toHaveBeenCalled();
  });

  it("clears user state even when notification store reset throws", async () => {
    const utils = await renderWithSignedInUser();
    mockNotificationReset.mockImplementation(() => {
      throw new Error("subscriber blew up");
    });

    await act(async () => {
      await (globalThis as unknown as { __logout: () => Promise<void> }).__logout();
    });

    expect(utils.getByTestId("user").props.children).toBe("null");
    expect(utils.getByTestId("auth").props.children).toBe("no");
    expect(mockClearCurrentUser).toHaveBeenCalled();
    // authApi.logout still runs because the reset error is caught.
    expect(mockAuthApiLogout).toHaveBeenCalled();
  });

  it("clears user state on the happy path and runs all teardown", async () => {
    const utils = await renderWithSignedInUser();

    await act(async () => {
      await (globalThis as unknown as { __logout: () => Promise<void> }).__logout();
    });

    expect(utils.getByTestId("user").props.children).toBe("null");
    expect(utils.getByTestId("auth").props.children).toBe("no");
    expect(mockClearCurrentUser).toHaveBeenCalled();
    expect(mockClearAllUserCaches).toHaveBeenCalledWith("u-1");
    expect(mockNotificationReset).toHaveBeenCalled();
    expect(mockAuthApiLogout).toHaveBeenCalled();
  });
});
