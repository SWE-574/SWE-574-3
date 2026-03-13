/**
 * Unit tests for Wikidata API.
 */

import { searchWikidata } from "../wikidata";
import { mockFetchResolve, getLastFetchCall } from "./helpers";

describe("wikidata", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  it("searchWikidata GETs /wikidata/search/ with q and optional limit", async () => {
    const results = [{ id: "Q1", label: "Item" }];
    mockFetchResolve(results);
    const out = await searchWikidata({ q: "test", limit: 10 });
    expect(out).toEqual(results);
    const { url } = getLastFetchCall();
    expect(url).toContain("/wikidata/search/");
    expect(url).toContain("q=test");
    expect(url).toContain("limit=10");
  });

  it("searchWikidata works with only q", async () => {
    mockFetchResolve([]);
    await searchWikidata({ q: "query" });
    expect(getLastFetchCall().url).toContain("q=query");
  });
});
