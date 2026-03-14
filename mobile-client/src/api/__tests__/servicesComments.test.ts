/**
 * Unit tests for Service Comments API.
 */

import {
  listServiceComments,
  createServiceComment,
  patchServiceComment,
  deleteServiceComment,
  listReviewableComments,
} from "../servicesComments";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("servicesComments", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listServiceComments GETs /services/:id/comments/ with params", async () => {
    mockFetchResolve({ results: [], count: 0, next: null, previous: null });
    await listServiceComments("s1", { page: 1, page_size: 10 });
    const { url } = getLastFetchCall();
    expect(url).toContain("/services/s1/comments/");
    expect(url).toContain("page=1");
  });

  it("createServiceComment POSTs to /services/:id/comments/", async () => {
    const body = { content: "Great service!", is_review: true };
    mockFetchResolve({ id: "c1", ...body });
    await createServiceComment("s1", body);
    expect(getLastFetchCall().url).toContain("/services/s1/comments/");
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual(body);
  });

  it("patchServiceComment PATCHes /services/:sid/comments/:cid/", async () => {
    mockFetchResolve({ id: "c1", content: "Updated" });
    await patchServiceComment("s1", "c1", { content: "Updated" });
    expect(getLastFetchCall().url).toContain("/services/s1/comments/c1/");
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    expect(getLastFetchBody()).toEqual({ content: "Updated" });
  });

  it("deleteServiceComment DELETEs comment", async () => {
    mockFetchResolve(undefined);
    await deleteServiceComment("s1", "c1");
    expect(getLastFetchCall().url).toContain("/services/s1/comments/c1/");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("listReviewableComments GETs /services/:id/comments/reviewable/", async () => {
    mockFetchResolve([]);
    await listReviewableComments("s1");
    expect(getLastFetchCall().url).toContain("/services/s1/comments/reviewable/");
  });
});
