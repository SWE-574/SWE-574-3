/**
 * Unit tests for Reputation API.
 */

import {
  listReputation,
  getReputation,
  createReputation,
  updateReputation,
  patchReputation,
  deleteReputation,
  createNegativeReputation,
} from "../reputation";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("reputation", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listReputation GETs /reputation/ with params", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listReputation({ page: 1, page_size: 10 });
    expect(getLastFetchCall().url).toContain("/reputation/");
  });

  it("getReputation GETs /reputation/:id/", async () => {
    const r = { id: "r1", handshake: "h1", rating: 5 };
    mockFetchResolve(r);
    expect(await getReputation("r1")).toEqual(r);
    expect(getLastFetchCall().url).toContain("/reputation/r1/");
  });

  it("createReputation POSTs to /reputation/", async () => {
    const body = { handshake: "h1", rating: 5, comment: "Great!" };
    mockFetchResolve({ id: "r1", ...body });
    await createReputation(body);
    expect(getLastFetchBody()).toEqual(body);
    expect(getLastFetchCall().init?.method).toBe("POST");
  });

  it("updateReputation PUTs, patchReputation PATCHes, deleteReputation DELETEs", async () => {
    mockFetchResolve({});
    await updateReputation("r1", { comment: "Updated" });
    expect(getLastFetchCall().init?.method).toBe("PUT");
    mockFetchResolve({});
    await patchReputation("r1", { rating: 4 });
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    mockFetchResolve(undefined);
    await deleteReputation("r1");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("createNegativeReputation POSTs to /reputation/negative/", async () => {
    const body = { handshake: "h1", comment: "Issue" };
    mockFetchResolve({ id: "r1" });
    await createNegativeReputation(body);
    expect(getLastFetchCall().url).toContain("/reputation/negative/");
    expect(getLastFetchBody()).toEqual(body);
  });
});
