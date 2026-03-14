/**
 * Unit tests for Chats API.
 */

import { listChats, createChat, getChat } from "../chats";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("chats", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listChats GETs /chats/ with optional params", async () => {
    const data: unknown[] = [];
    mockFetchResolve(data);
    await listChats({ page: 1, page_size: 20 });
    const { url } = getLastFetchCall();
    expect(url).toContain("/chats/");
    expect(url).toContain("page=1");
    expect(url).toContain("page_size=20");
  });

  it("createChat POSTs to /chats/", async () => {
    const chat = { handshake_id: "h1", service_id: "s1" };
    mockFetchResolve(chat);
    const result = await createChat({ handshake_id: "h1" });
    expect(result).toEqual(chat);
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual({ handshake_id: "h1" });
  });

  it("getChat GETs /chats/:id/", async () => {
    const chat = { handshake_id: "h1", service_title: "Test" };
    mockFetchResolve(chat);
    expect(await getChat("c1")).toEqual(chat);
    expect(getLastFetchCall().url).toContain("/chats/c1/");
  });
});
