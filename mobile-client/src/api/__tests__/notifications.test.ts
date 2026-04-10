/**
 * Unit tests for Notifications API.
 */

import { listNotifications, getNotification, markAllNotificationsRead } from "../notifications";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("notifications", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listNotifications GETs /notifications/ with params", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listNotifications({ page: 1, page_size: 10, unread_only: true });
    const { url } = getLastFetchCall();
    expect(url).toContain("/notifications/");
    expect(url).toContain("unread_only=true");
  });

  it("getNotification GETs /notifications/:id/", async () => {
    const n = { id: "n1", message: "Hi", read: false };
    mockFetchResolve(n);
    expect(await getNotification("n1")).toEqual(n);
    expect(getLastFetchCall().url).toContain("/notifications/n1/");
  });

  it("markAllNotificationsRead POSTs to /notifications/read/", async () => {
    mockFetchResolve({});
    await markAllNotificationsRead();
    expect(getLastFetchCall().url).toContain("/notifications/read/");
  });
});
