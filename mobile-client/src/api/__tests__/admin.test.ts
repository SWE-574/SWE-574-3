/**
 * Unit tests for Admin API.
 */

import {
  listReports,
  getReport,
  pauseReport,
  resolveReport,
  listAdminUsers,
  adjustKarma,
  banUser,
  unbanUser,
  warnUser,
  listAdminComments,
  getAdminComment,
  listAuditLogs,
} from "../admin";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("admin", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listReports GETs /admin/reports/ with params", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listReports({ page: 1, page_size: 10, status: "open" });
    const { url } = getLastFetchCall();
    expect(url).toContain("/admin/reports/");
    expect(url).toContain("status=open");
  });

  it("getReport GETs /admin/reports/:id/", async () => {
    const r = { id: "r1", reason: "spam" };
    mockFetchResolve(r);
    expect(await getReport("r1")).toEqual(r);
    expect(getLastFetchCall().url).toContain("/admin/reports/r1/");
  });

  it("pauseReport and resolveReport POST to action endpoints", async () => {
    mockFetchResolve({});
    await pauseReport("r1");
    expect(getLastFetchCall().url).toContain("/admin/reports/r1/pause/");
    mockFetchResolve({});
    await resolveReport("r1");
    expect(getLastFetchCall().url).toContain("/admin/reports/r1/resolve/");
  });

  it("listAdminUsers GETs /admin/users/", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listAdminUsers({ page: 1 });
    expect(getLastFetchCall().url).toContain("/admin/users/");
  });

  it("adjustKarma POSTs to /admin/users/:id/adjust-karma/", async () => {
    mockFetchResolve({ id: "u1", karma_score: 100 });
    await adjustKarma("u1", { amount: 10, reason: "Good deed" });
    expect(getLastFetchCall().url).toContain("/admin/users/u1/adjust-karma/");
    expect(getLastFetchBody()).toEqual({ amount: 10, reason: "Good deed" });
  });

  it("banUser POSTs to ban/, unbanUser to unban/, warnUser to warn/", async () => {
    mockFetchResolve({});
    await banUser("u1", { reason: "Spam" });
    expect(getLastFetchCall().url).toContain("/admin/users/u1/ban/");
    expect(getLastFetchBody()).toEqual({ reason: "Spam" });
    mockFetchResolve({});
    await unbanUser("u1");
    expect(getLastFetchCall().url).toContain("/admin/users/u1/unban/");
    mockFetchResolve({});
    await warnUser("u1", { message: "Warning" });
    expect(getLastFetchCall().url).toContain("/admin/users/u1/warn/");
  });

  it("listAdminComments GETs /admin/comments/, getAdminComment GETs by id", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listAdminComments({ page: 1 });
    expect(getLastFetchCall().url).toContain("/admin/comments/");
    mockFetchResolve({ id: "c1", body: "Comment" });
    expect(await getAdminComment("c1")).toEqual({ id: "c1", body: "Comment" });
    expect(getLastFetchCall().url).toContain("/admin/comments/c1/");
  });

  it("listAuditLogs GETs /admin/audit-logs/", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listAuditLogs({ page: 1, page_size: 20 });
    const { url } = getLastFetchCall();
    expect(url).toContain("/admin/audit-logs/");
    expect(url).toContain("page=1");
  });
});
