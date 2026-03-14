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

export function searchWikidata(
  params: WikidataSearchParams,
): Promise<WikidataSearchResult[]> {
  return apiRequest<WikidataSearchResult[]>("/wikidata/search/", {
    params: params as unknown as Record<string, string | number | undefined>,
  });
}
