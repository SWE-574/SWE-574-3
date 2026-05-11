/**
 * ActivityListScreen tests
 *
 * Covers the View More flow that lets users see a full paginated list per
 * activity category (offers, needs, events, history, reviews). The screen
 * picks one of four data sources via the `category` route param, so each
 * test sets up the corresponding mocked endpoint and verifies the rendered
 * list shape (or empty state) before pagination kicks in.
 */

import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import type { Service, UserHistoryItem } from "../../../api/types";
import type { ProfileReview } from "../../../api/users";

jest.mock("../../../api/services", () => ({
  listServices: jest.fn(),
}));
jest.mock("../../../api/users", () => ({
  getUserHistory: jest.fn(),
  getVerifiedReviews: jest.fn(),
}));
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const mockNavigate = jest.fn();
const routeParamsRef: { current: { category: string } } = {
  current: { category: "offers" },
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: routeParamsRef.current }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
jest.mock("../../../constants/env", () => ({
  normalizeRuntimeUrl: (v: string | null | undefined) => v,
}));

import { listServices } from "../../../api/services";
import { getUserHistory, getVerifiedReviews } from "../../../api/users";
import ActivityListScreen, {
  ACTIVITY_LIST_TITLES,
} from "../ActivityListScreen";

const makeService = (overrides: Partial<Service> = {}): Service =>
  ({
    id: overrides.id ?? "s-1",
    user: {
      id: "u-1",
      first_name: "Cem",
      last_name: "Yılmaz",
      email: "",
    },
    title: overrides.title ?? "Service title",
    description: overrides.description ?? "Service description",
    type: overrides.type ?? "Offer",
    duration: overrides.duration ?? "1",
    location_type: overrides.location_type ?? "in_person",
    location_area: overrides.location_area ?? "Kadıköy",
    status: overrides.status ?? "Active",
    max_participants: overrides.max_participants ?? 1,
    participant_count: overrides.participant_count ?? 0,
    created_at: overrides.created_at ?? "2026-04-30T10:00:00Z",
    tags: [],
    is_visible: overrides.is_visible ?? true,
    ...overrides,
  }) as Service;

const baseHistoryRow = {
  service_id: "svc-h1",
  service_title: "Pottery basics",
  service_type: "Offer",
  partner_id: "partner-1",
  partner_name: "Deniz Eren",
  partner_avatar_url: null,
  duration: 2,
  completed_date: "2026-04-12T12:00:00Z",
  schedule_type: "One-Time",
  max_participants: 1,
  was_provider: true,
} as unknown as UserHistoryItem;

const baseReview: ProfileReview = {
  id: "r-1",
  service: "svc-1",
  service_title: "Sourdough class",
  user_id: "u-2",
  user_name: "Ayşe Demir",
  body: "Loved every minute.",
  is_verified_review: true,
  handshake_hours: 2,
  reviewed_user_role: "receiver",
  reply_count: 0,
  replies: [],
  created_at: "2026-04-12T12:00:00Z",
  updated_at: "2026-04-12T12:00:00Z",
};

describe("ActivityListScreen", () => {
  // CI runners can be significantly slower than local — 15s gives the
  // `findByText` polls headroom without masking real hangs.
  jest.setTimeout(15000);

  beforeEach(() => {
    mockNavigate.mockReset();
    (listServices as jest.Mock).mockReset();
    (getUserHistory as jest.Mock).mockReset();
    (getVerifiedReviews as jest.Mock).mockReset();
  });

  it("exposes a title mapping for every activity category", () => {
    expect(Object.keys(ACTIVITY_LIST_TITLES).sort()).toEqual(
      ["events", "history", "needs", "offers", "reviews"].sort(),
    );
    expect(ACTIVITY_LIST_TITLES.offers).toBe("All offers");
    expect(ACTIVITY_LIST_TITLES.history).toBe("Exchange history");
  });

  it("renders only ongoing Offer services for the 'offers' category", async () => {
    routeParamsRef.current = { category: "offers" };
    // Server-side filtering: the screen forwards `type` to listServices, so
    // mirror real backend behaviour by returning only matching rows.
    const catalog = [
      makeService({ id: "a", title: "Offer A", type: "Offer" }),
      makeService({ id: "b", title: "Need B", type: "Need" }),
      makeService({ id: "c", title: "Event C", type: "Event" }),
    ];
    (listServices as jest.Mock).mockImplementation(
      (params?: { type?: string }) =>
        Promise.resolve({
          results: params?.type
            ? catalog.filter((s) => s.type === params.type)
            : catalog,
        }),
    );
    const { findByText, queryByText } = render(<ActivityListScreen />);
    expect(await findByText("Offer A")).toBeTruthy();
    expect(queryByText("Need B")).toBeNull();
    expect(queryByText("Event C")).toBeNull();
    // Server-side pagination contract: type filter + small page size.
    expect(listServices).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "user-1",
        type: "Offer",
        page: 1,
        page_size: 10,
      }),
    );
  });

  it("renders grouped history entries for the 'history' category", async () => {
    routeParamsRef.current = { category: "history" };
    (getUserHistory as jest.Mock).mockResolvedValue([
      baseHistoryRow,
      { ...baseHistoryRow, partner_id: "partner-2", partner_name: "Hakan" },
    ]);
    const { findAllByText } = render(<ActivityListScreen />);
    const titles = await findAllByText("Pottery basics");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("renders the reviews list and count header", async () => {
    routeParamsRef.current = { category: "reviews" };
    (getVerifiedReviews as jest.Mock).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      results: [baseReview],
    });
    const { findByText } = render(<ActivityListScreen />);
    expect(await findByText("3 reviews")).toBeTruthy();
    expect(await findByText(baseReview.body)).toBeTruthy();
  });

  it("renders the empty state when no items are returned", async () => {
    routeParamsRef.current = { category: "needs" };
    (listServices as jest.Mock).mockResolvedValue({ results: [] });
    const { findByText } = render(<ActivityListScreen />);
    expect(await findByText("Nothing here yet")).toBeTruthy();
  });

  it("navigates to ServiceDetail when a service row is tapped", async () => {
    routeParamsRef.current = { category: "offers" };
    (listServices as jest.Mock).mockResolvedValue({
      results: [makeService({ id: "x", title: "Open me", type: "Offer" })],
    });
    const { findByLabelText } = render(<ActivityListScreen />);
    fireEvent.press(await findByLabelText("Open service Open me"));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("ServiceDetail", { id: "x" });
    });
  });

  it("requests the second page when end is reached and more reviews exist", async () => {
    routeParamsRef.current = { category: "reviews" };
    (getVerifiedReviews as jest.Mock)
      .mockResolvedValueOnce({
        count: 12,
        next: "next-page-url",
        previous: null,
        results: [baseReview],
      })
      .mockResolvedValueOnce({
        count: 12,
        next: null,
        previous: null,
        results: [{ ...baseReview, id: "r-2", body: "Second page review." }],
      });

    const { findByText, getByTestId } = render(<ActivityListScreen />);
    await findByText(baseReview.body);
    fireEvent(getByTestId("activity-list-reviews"), "endReached");

    await waitFor(() => {
      expect(getVerifiedReviews).toHaveBeenCalledTimes(2);
    });
    expect(getVerifiedReviews).toHaveBeenLastCalledWith("user-1", {
      page: 2,
      page_size: 10,
    });
  });
});
