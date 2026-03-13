/**
 * Unit tests for Public Chat API.
 */

import { getPublicChat, postPublicChat } from "../publicChat";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("publicChat", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("getPublicChat GETs /public-chat/:id/", async () => {
    const messages = [{ id: "m1", content: "Hi" }];
    mockFetchResolve(messages);
    const result = await getPublicChat("chat1");
    expect(result).toEqual(messages);
    expect(getLastFetchCall().url).toContain("/public-chat/chat1/");
  });

  it("postPublicChat POSTs to /public-chat/:id/ with body", async () => {
    const msg = { id: "m1", content: "Hello" };
    mockFetchResolve(msg);
    const result = await postPublicChat("chat1", { content: "Hello" });
    expect(result).toEqual(msg);
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual({ content: "Hello" });
  });
});
