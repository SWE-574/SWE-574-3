/**
 * Smoke tests for TimeActivityScreen — confirms the consolidated initial
 * loading state stays up until every screen-level loader (transactions,
 * insights, agreements, event history) resolves.
 *
 * We mock the four loader endpoints so we can control which one finishes
 * last, then assert the loading spinner / text disappear only after the
 * slowest fetch is done.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("../../../api/transactions", () => ({
  __esModule: true,
  listTransactions: jest.fn(),
  EMPTY_SUMMARY: { current_balance: 0, total_earned: 0, total_spent: 0 },
}));

jest.mock("../../../api/handshakes", () => ({
  __esModule: true,
  listHandshakes: jest.fn(),
}));

jest.mock("../../../api/users", () => ({
  __esModule: true,
  getUserHistory: jest.fn(),
}));

jest.mock("../../../api/chats", () => ({
  __esModule: true,
  getGroupChat: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", first_name: "Selin", last_name: "Kaya" },
  }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

import TimeActivityScreen from "../TimeActivityScreen";
import { listTransactions } from "../../../api/transactions";
import { listHandshakes } from "../../../api/handshakes";
import { getUserHistory } from "../../../api/users";

describe("TimeActivityScreen initial loading", () => {
  beforeEach(() => {
    (listTransactions as jest.Mock).mockReset();
    (listHandshakes as jest.Mock).mockReset();
    (getUserHistory as jest.Mock).mockReset();
  });

  it("shows the consolidated loading state until every loader resolves", async () => {
    let resolveAgreements: (value: unknown) => void = () => undefined;
    (listTransactions as jest.Mock).mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
      summary: { current_balance: 0, total_earned: 0, total_spent: 0 },
    });
    (listHandshakes as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAgreements = resolve;
        }),
    );
    (getUserHistory as jest.Mock).mockResolvedValue([]);

    const { getByText, queryByText } = render(<TimeActivityScreen />);

    expect(getByText("Loading your time activity…")).toBeTruthy();

    resolveAgreements({ results: [], count: 0, next: null, previous: null });

    await waitFor(() => {
      expect(queryByText("Loading your time activity…")).toBeNull();
    });
  });

  it("issues all four loader requests on first mount", async () => {
    (listTransactions as jest.Mock).mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
      summary: { current_balance: 0, total_earned: 0, total_spent: 0 },
    });
    (listHandshakes as jest.Mock).mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });
    (getUserHistory as jest.Mock).mockResolvedValue([]);

    render(<TimeActivityScreen />);
    await waitFor(() => {
      expect(listTransactions).toHaveBeenCalled();
      expect(listHandshakes).toHaveBeenCalled();
      expect(getUserHistory).toHaveBeenCalled();
    });
  });
});
