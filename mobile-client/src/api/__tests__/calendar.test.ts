/**
 * Unit tests for calendar API – fetchUpcoming.
 */

import { fetchUpcoming } from "../calendar";
import { mockFetchResolve, getLastFetchCall } from "./helpers";

describe("calendar", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("fetchUpcoming GETs /users/me/calendar/ with from and to params", async () => {
    const mockResponse = {
      items: [],
      conflicts: [],
      range: { from: "2024-06-01", to: "2024-07-31" },
    };
    mockFetchResolve(mockResponse);

    const result = await fetchUpcoming({ from: "2024-06-01", to: "2024-07-31" });

    const { url, init } = getLastFetchCall();
    expect(url).toContain("/users/me/calendar/");
    expect(url).toContain("from=2024-06-01");
    expect(url).toContain("to=2024-07-31");
    expect(init?.method ?? "GET").toBe("GET");
    expect(result).toEqual(mockResponse);
  });

  it("fetchUpcoming returns typed CalendarResponse with items array", async () => {
    const item = {
      id: "item-1",
      kind: "service_session",
      title: "Test session",
      start: "2024-06-10T10:00:00Z",
      end: "2024-06-10T11:00:00Z",
      duration_hours: 1,
      location_type: "Online",
      location_label: null,
      service_type: "Offer",
      service_id: "svc-1",
      handshake_id: null,
      chat_id: null,
      counterpart: null,
      is_owner: true,
      status: "accepted",
      accent_token: "GREEN",
      link: { type: "service", id: "svc-1" },
    };
    mockFetchResolve({ items: [item], conflicts: [], range: { from: "2024-06-01", to: "2024-07-31" } });

    const result = await fetchUpcoming({ from: "2024-06-01", to: "2024-07-31" });

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("item-1");
    expect(result.items[0].accent_token).toBe("GREEN");
  });

  it("fetchUpcoming returns empty items array when no events", async () => {
    mockFetchResolve({ items: [], conflicts: [], range: { from: "2024-06-01", to: "2024-06-30" } });

    const result = await fetchUpcoming({ from: "2024-06-01", to: "2024-06-30" });

    expect(result.items).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("fetchUpcoming passes AbortSignal to fetch", async () => {
    mockFetchResolve({ items: [], conflicts: [], range: { from: "2024-06-01", to: "2024-06-30" } });
    const ac = new AbortController();

    await fetchUpcoming({ from: "2024-06-01", to: "2024-06-30" }, ac.signal);

    const { init } = getLastFetchCall();
    expect(init?.signal).toBe(ac.signal);
  });
});
