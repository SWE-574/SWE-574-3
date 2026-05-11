/**
 * Wikidata API – search
 * GET /api/wikidata/search/
 */

import { apiRequest } from "./client";

export interface WikidataSearchParams {
  q: string;
  limit?: number;
}

export interface WikidataSearchResult {
  id: string;
  label?: string;
  description?: string;
  [key: string]: unknown;
}

// Module-level LRU cache. The autocomplete repeatedly types the same prefixes
// while the user is editing a service; with a 5s round-trip in the worst case
// (live Wikidata call), in-process caching is essential UX. Backend also caches
// for 1h; this layer keeps even the network round-trip out of the loop.
const _CACHE = new Map<string, WikidataSearchResult[]>();
const _CACHE_MAX = 100;

function _cacheGet(key: string): WikidataSearchResult[] | undefined {
  const value = _CACHE.get(key);
  if (value !== undefined) {
    _CACHE.delete(key);
    _CACHE.set(key, value);
  }
  return value;
}

function _cacheSet(key: string, value: WikidataSearchResult[]): void {
  if (_CACHE.has(key)) _CACHE.delete(key);
  _CACHE.set(key, value);
  while (_CACHE.size > _CACHE_MAX) {
    const oldest = _CACHE.keys().next().value;
    if (oldest === undefined) break;
    _CACHE.delete(oldest);
  }
}

export function searchWikidata(
  params: WikidataSearchParams,
): Promise<WikidataSearchResult[]> {
  const cacheKey = `${(params.q ?? "").trim().toLowerCase()}|${params.limit ?? 10}`;
  const cached = _cacheGet(cacheKey);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  return apiRequest<WikidataSearchResult[]>("/wikidata/search/", {
    params: params as unknown as Record<string, string | number | undefined>,
  }).then((results) => {
    _cacheSet(cacheKey, results);
    return results;
  });
}
