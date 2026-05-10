/**
 * Regression coverage for the anonymous-chip-set lock-in: HomeScreen is
 * reachable without a session (Login lives inside ProfileStack), so
 * TagChipsRow used to mount with `authToken = null`, fetch the global
 * fallback chips returned by `/featured/chips/` for unauthenticated
 * viewers, and stash that response forever — the per-user chip set the
 * web Browse grid shows never landed on mobile after login.
 *
 * The fix re-runs the fetch whenever the active user identity changes
 * (anon → login → switch user → logout). These tests pin both the
 * single fetch on cold mount and the refetch on auth change.
 */

import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";

import TagChipsRow from "../TagChipsRow";
import { getFeaturedChips } from "../../../api/featured";

jest.mock("../../../api/featured", () => ({
  getFeaturedChips: jest.fn(),
}));

const mockUser: { id: string | null } = { id: null };
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser.id ? { id: mockUser.id } : null }),
}));

const fetchMock = getFeaturedChips as jest.MockedFunction<typeof getFeaturedChips>;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    chips: [{ qid: "Q1", label: "Cooking", count: 3 }],
  });
  mockUser.id = null;
});

describe("TagChipsRow", () => {
  it("fetches the chip strip once on mount", async () => {
    const onSelect = jest.fn();
    render(<TagChipsRow activeQid={null} onSelect={onSelect} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("refetches when the authenticated user identity flips", async () => {
    const onSelect = jest.fn();
    const { rerender } = render(
      <TagChipsRow activeQid={null} onSelect={onSelect} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockUser.id = "user-elif";
    });
    rerender(<TagChipsRow activeQid={null} onSelect={onSelect} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("refetches when switching to a different signed-in user", async () => {
    mockUser.id = "user-elif";
    const onSelect = jest.fn();
    const { rerender } = render(
      <TagChipsRow activeQid={null} onSelect={onSelect} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockUser.id = "user-yusuf";
    });
    rerender(<TagChipsRow activeQid={null} onSelect={onSelect} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("refetches on logout so the global fallback chips replace the personalized set", async () => {
    mockUser.id = "user-elif";
    const onSelect = jest.fn();
    const { rerender } = render(
      <TagChipsRow activeQid={null} onSelect={onSelect} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockUser.id = null;
    });
    rerender(<TagChipsRow activeQid={null} onSelect={onSelect} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
