/**
 * Unit tests for Forum API.
 */

import {
  listCategories,
  createCategory,
  getCategory,
  patchCategory,
  deleteCategory,
  listTopics,
  createTopic,
  getTopic,
  patchTopic,
  deleteTopic,
  lockTopic,
  pinTopic,
  listTopicPosts,
  createTopicPost,
  patchPost,
  deletePost,
  listRecentPosts,
  reportTopic,
  reportPost,
} from "../forum";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("forum", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listCategories GETs /forum/categories/", async () => {
    mockFetchResolve([]);
    await listCategories();
    expect(getLastFetchCall().url).toContain("/forum/categories/");
  });

  it("createCategory POSTs, getCategory GETs by slug", async () => {
    mockFetchResolve({ slug: "general", name: "General" });
    await createCategory({ name: "General" });
    expect(getLastFetchBody()).toEqual({ name: "General" });
    mockFetchResolve({ slug: "general" });
    await getCategory("general");
    expect(getLastFetchCall().url).toContain("/forum/categories/general/");
  });

  it("patchCategory PATCHes, deleteCategory DELETEs by slug", async () => {
    mockFetchResolve({});
    await patchCategory("general", { description: "Desc" });
    expect(getLastFetchCall().url).toContain("categories/general/");
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    mockFetchResolve(undefined);
    await deleteCategory("general");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("listTopics GETs /forum/topics/ with params", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listTopics({ page: 1, page_size: 10, category: "general" });
    const { url } = getLastFetchCall();
    expect(url).toContain("/forum/topics/");
    expect(url).toContain("category=general");
  });

  it("createTopic POSTs, getTopic GETs, patchTopic PATCHes, deleteTopic DELETEs", async () => {
    mockFetchResolve({ id: "t1", title: "T", category: "general" });
    await createTopic({ title: "T", category: "general", body: "body" });
    expect(getLastFetchBody()).toEqual({ title: "T", category: "general", body: "body" });
    mockFetchResolve({ id: "t1" });
    await getTopic("t1");
    expect(getLastFetchCall().url).toContain("/forum/topics/t1/");
    mockFetchResolve({});
    await patchTopic("t1", { title: "New" });
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    mockFetchResolve(undefined);
    await deleteTopic("t1");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("lockTopic and pinTopic POST to action endpoints", async () => {
    mockFetchResolve({});
    await lockTopic("t1");
    expect(getLastFetchCall().url).toContain("/forum/topics/t1/lock/");
    mockFetchResolve({});
    await pinTopic("t1");
    expect(getLastFetchCall().url).toContain("/forum/topics/t1/pin/");
  });

  it("listTopicPosts GETs /forum/topics/:id/posts/", async () => {
    mockFetchResolve({ count: 0, results: [], next: null, previous: null });
    await listTopicPosts("t1", { page: 1, page_size: 10 });
    expect(getLastFetchCall().url).toContain("/forum/topics/t1/posts/");
  });

  it("createTopicPost POSTs to topic posts", async () => {
    mockFetchResolve({ id: "p1", body: "Hello" });
    await createTopicPost("t1", { body: "Hello" });
    expect(getLastFetchCall().url).toContain("/forum/topics/t1/posts/");
    expect(getLastFetchBody()).toEqual({ body: "Hello" });
  });

  it("patchPost PATCHes /forum/posts/:id/, deletePost DELETEs", async () => {
    mockFetchResolve({});
    await patchPost("p1", { body: "Updated" });
    expect(getLastFetchCall().url).toContain("/forum/posts/p1/");
    expect(getLastFetchCall().init?.method).toBe("PATCH");
    mockFetchResolve(undefined);
    await deletePost("p1");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });

  it("listRecentPosts GETs /forum/posts/recent/ with limit", async () => {
    mockFetchResolve([]);
    await listRecentPosts({ limit: 5 });
    expect(getLastFetchCall().url).toContain("/forum/posts/recent/");
    expect(getLastFetchCall().url).toContain("limit=5");
  });

  it("reportTopic POSTs to /forum/topics/:id/report/ with type and description", async () => {
    mockFetchResolve({ id: "r1", type: "spam", status: "pending", description: "It is spam", created_at: "" });
    await reportTopic("t1", { type: "spam", description: "It is spam" });
    expect(getLastFetchCall().url).toContain("/forum/topics/t1/report/");
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual({ type: "spam", description: "It is spam" });
  });

  it("reportTopic POSTs with only type when description is omitted", async () => {
    mockFetchResolve({ id: "r2", type: "harassment", status: "pending", description: "", created_at: "" });
    await reportTopic("t2", { type: "harassment" });
    expect(getLastFetchCall().url).toContain("/forum/topics/t2/report/");
    expect(getLastFetchBody()).toEqual({ type: "harassment" });
  });

  it("reportPost POSTs to /forum/posts/:id/report/ with type and description", async () => {
    mockFetchResolve({ id: "r3", type: "inappropriate_content", status: "pending", description: "Offensive reply", created_at: "" });
    await reportPost("p1", { type: "inappropriate_content", description: "Offensive reply" });
    expect(getLastFetchCall().url).toContain("/forum/posts/p1/report/");
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual({ type: "inappropriate_content", description: "Offensive reply" });
  });

  it("reportPost POSTs with only type when description is omitted", async () => {
    mockFetchResolve({ id: "r4", type: "other", status: "pending", description: "", created_at: "" });
    await reportPost("p2", { type: "other" });
    expect(getLastFetchCall().url).toContain("/forum/posts/p2/report/");
    expect(getLastFetchBody()).toEqual({ type: "other" });
  });
});
