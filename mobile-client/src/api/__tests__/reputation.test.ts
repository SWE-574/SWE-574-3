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
  attachReviewImages,
  submitCombinedEvaluation,
  submitCombinedEventEvaluation,
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

describe("attachReviewImages", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("POSTs FormData to /reputation/add-review/", async () => {
    mockFetchResolve({ ok: true });
    await attachReviewImages("h1", ["/tmp/photo1.jpg", "/tmp/photo2.jpg"]);

    const { url, init } = getLastFetchCall();
    expect(url).toContain("/reputation/add-review/");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("includes handshake_id and image entries in the FormData", async () => {
    mockFetchResolve({ ok: true });
    await attachReviewImages("h42", ["/path/img.jpg"]);

    const body = getLastFetchCall().init?.body;
    expect(body).toBeInstanceOf(FormData);
    const fd = body as FormData;
    expect(fd.get("handshake_id")).toBe("h42");
  });
});

describe("submitCombinedEvaluation", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("throws when no traits are selected", async () => {
    await expect(
      submitCombinedEvaluation({
        handshake_id: "h1",
        positive: { punctual: false, helpful: false, kindness: false },
        negative: { is_late: false, is_unhelpful: false, is_rude: false },
      }),
    ).rejects.toThrow("Select at least one trait");
  });

  it("submits only positive when no negative traits selected", async () => {
    mockFetchResolve({ id: "r1" });
    const result = await submitCombinedEvaluation({
      handshake_id: "h1",
      positive: { punctual: true, helpful: false, kindness: false },
      negative: { is_late: false, is_unhelpful: false, is_rude: false },
      comment: "Nice",
    });
    expect(result.positive).toBeDefined();
    expect(result.negative).toBeUndefined();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("submits only negative when no positive traits selected", async () => {
    mockFetchResolve({ id: "n1" });
    const result = await submitCombinedEvaluation({
      handshake_id: "h1",
      positive: { punctual: false, helpful: false, kindness: false },
      negative: { is_late: true, is_unhelpful: false, is_rude: false },
    });
    expect(result.positive).toBeUndefined();
    expect(result.negative).toBeDefined();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("submits both positive and negative when both have traits", async () => {
    mockFetchResolve({ id: "r1" });
    mockFetchResolve({ id: "n1" });
    const result = await submitCombinedEvaluation({
      handshake_id: "h1",
      positive: { punctual: true, helpful: false, kindness: false },
      negative: { is_late: true, is_unhelpful: false, is_rude: false },
    });
    expect(result.positive).toBeDefined();
    expect(result.negative).toBeDefined();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2);
  });

  it("trims whitespace-only comments", async () => {
    mockFetchResolve({ id: "r1" });
    await submitCombinedEvaluation({
      handshake_id: "h1",
      positive: { punctual: true, helpful: false, kindness: false },
      negative: { is_late: false, is_unhelpful: false, is_rude: false },
      comment: "   ",
    });
    const body = getLastFetchBody() as Record<string, unknown>;
    expect(body.comment).toBeUndefined();
  });
});

describe("submitCombinedEventEvaluation", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("throws when no event traits are selected", async () => {
    await expect(
      submitCombinedEventEvaluation({
        handshake_id: "h1",
        positive: { well_organized: false, engaging: false, welcoming: false },
        negative: { disorganized: false, boring: false, unwelcoming: false },
      }),
    ).rejects.toThrow("Select at least one trait");
  });

  it("submits positive event traits to /reputation/", async () => {
    mockFetchResolve({ id: "r1" });
    const result = await submitCombinedEventEvaluation({
      handshake_id: "h1",
      positive: { well_organized: true, engaging: false, welcoming: true },
      negative: { disorganized: false, boring: false, unwelcoming: false },
      comment: "Great event!",
    });
    expect(result.positive).toBeDefined();
    expect(result.negative).toBeUndefined();

    const body = getLastFetchBody() as Record<string, unknown>;
    expect(body.handshake_id).toBe("h1");
    expect(body.well_organized).toBe(true);
    expect(body.welcoming).toBe(true);
    expect(body.comment).toBe("Great event!");
    expect(getLastFetchCall().url).toContain("/reputation/");
  });

  it("submits negative event traits to /reputation/negative/", async () => {
    mockFetchResolve({ id: "n1" });
    const result = await submitCombinedEventEvaluation({
      handshake_id: "h1",
      positive: { well_organized: false, engaging: false, welcoming: false },
      negative: { disorganized: true, boring: false, unwelcoming: false },
    });
    expect(result.negative).toBeDefined();
    expect(result.positive).toBeUndefined();
    expect(getLastFetchCall().url).toContain("/reputation/negative/");
  });

  it("submits both positive and negative event traits", async () => {
    mockFetchResolve({ id: "r1" });
    mockFetchResolve({ id: "n1" });
    const result = await submitCombinedEventEvaluation({
      handshake_id: "h1",
      positive: { well_organized: true, engaging: false, welcoming: false },
      negative: { disorganized: true, boring: false, unwelcoming: false },
    });
    expect(result.positive).toBeDefined();
    expect(result.negative).toBeDefined();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2);
  });
});
