/**
 * Unit tests for Tags API.
 */

import {
  listTags,
  getTag,
  createTag,
  updateTag,
  patchTag,
  deleteTag,
} from "../tags";
import { mockFetchResolve, getLastFetchCall, getLastFetchBody } from "./helpers";

describe("tags", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("listTags GETs /tags/ with optional params", async () => {
    const data = { results: [], count: 0, next: null, previous: null };
    mockFetchResolve(data);
    await listTags({ search: "x", page: 1, page_size: 10 });
    const { url } = getLastFetchCall();
    expect(url).toContain("/tags/");
    expect(url).toContain("search=x");
    expect(url).toContain("page=1");
    expect(url).toContain("page_size=10");
  });

  it("getTag GETs /tags/:id/", async () => {
    const tag = { id: "t1", name: "Tag1" };
    mockFetchResolve(tag);
    expect(await getTag("t1")).toEqual(tag);
    expect(getLastFetchCall().url).toContain("/tags/t1/");
  });

  it("createTag POSTs to /tags/", async () => {
    mockFetchResolve({ id: "t1", name: "New" });
    await createTag({ name: "New" });
    expect(getLastFetchCall().init?.method).toBe("POST");
    expect(getLastFetchBody()).toEqual({ name: "New" });
  });

  it("updateTag PUTs to /tags/:id/", async () => {
    mockFetchResolve({ id: "t1", name: "Updated" });
    await updateTag("t1", { name: "Updated" });
    expect(getLastFetchCall().init?.method).toBe("PUT");
  });

  it("patchTag PATCHes /tags/:id/", async () => {
    mockFetchResolve({ id: "t1", name: "Patched" });
    await patchTag("t1", { name: "Patched" });
    expect(getLastFetchCall().init?.method).toBe("PATCH");
  });

  it("deleteTag DELETEs /tags/:id/", async () => {
    mockFetchResolve(undefined);
    await deleteTag("t1");
    expect(getLastFetchCall().url).toContain("/tags/t1/");
    expect(getLastFetchCall().init?.method).toBe("DELETE");
  });
});
