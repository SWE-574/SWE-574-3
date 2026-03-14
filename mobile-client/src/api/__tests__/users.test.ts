/**
 * Unit tests for Users API.
 */

import {
  getMe,
  updateMe,
  patchMe,
  getUser,
  updateUser,
  patchUser,
  getBadgeProgress,
  getUserHistory,
  getVerifiedReviews,
} from "../users";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("users", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("getMe GETs /users/me/", async () => {
    const me = { id: "u1", first_name: "A", last_name: "B" };
    mockFetchResolve(me);
    expect(await getMe()).toEqual(me);
    expect(getLastFetchCall().url).toContain("/users/me/");
  });

  it("updateMe PUTs to /users/me/", async () => {
    mockFetchResolve({ id: "u1" });
    await updateMe({ first_name: "X", bio: "Hello" });
    expect(getLastFetchCall().init?.method).toBe("PUT");
    expect(getLastFetchBody()).toEqual({ first_name: "X", bio: "Hello" });
  });

  it("patchMe PATCHes /users/me/", async () => {
    mockFetchResolve({ id: "u1" });
    await patchMe({ avatar_url: "https://x.com/a.png" });
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    expect(getLastFetchBody()).toEqual({ avatar_url: "https://x.com/a.png" });
  });

  it("getUser GETs /users/:id/", async () => {
    const user = { id: "u2", first_name: "C" };
    mockFetchResolve(user);
    expect(await getUser("u2")).toEqual(user);
    expect(getLastFetchCall().url).toContain("/users/u2/");
  });

  it("updateUser PUTs to /users/:id/", async () => {
    mockFetchResolve({ id: "u2" });
    await updateUser("u2", { last_name: "D" });
    expect(getLastFetchCall().url).toContain("/users/u2/");
    expect(getLastFetchBody()).toEqual({ last_name: "D" });
  });

  it("patchUser PATCHes /users/:id/", async () => {
    mockFetchResolve({ id: "u2" });
    await patchUser("u2", { bio: "Bio" });
    expect(getLastFetchCall().init?.method).toBe("PATCH");
  });

  it("getBadgeProgress GETs /users/:id/badge-progress/", async () => {
    mockFetchResolve({ badges: [] });
    await getBadgeProgress("u1");
    expect(getLastFetchCall().url).toContain("/users/u1/badge-progress/");
  });

  it("getUserHistory GETs /users/:id/history/ with params", async () => {
    mockFetchResolve({ results: [] });
    await getUserHistory("u1", { page: 2, page_size: 20 });
    const { url } = getLastFetchCall();
    expect(url).toContain("/users/u1/history/");
    expect(url).toContain("page=2");
    expect(url).toContain("page_size=20");
  });

  it("getVerifiedReviews GETs /users/:id/verified-reviews/", async () => {
    mockFetchResolve({ results: [] });
    await getVerifiedReviews("u1", { page: 1 });
    expect(getLastFetchCall().url).toContain("/users/u1/verified-reviews/");
  });
});
