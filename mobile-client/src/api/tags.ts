/**
 * Tags API – list, create, retrieve, update, delete tags
 * GET/POST /api/tags/, GET/PUT/PATCH/DELETE /api/tags/{id}/
 *
 * Also: Wikidata search + ensure-in-db for profile skills (web `tagAPI` parity).
 */

import { apiRequest, ApiHttpError } from "./client";
import type { Tag, PaginatedResponse } from "./types";

export interface TagRequest {
  name: string;
}

export interface TagsListParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export function listTags(
  params?: TagsListParams,
): Promise<Tag[] | PaginatedResponse<Tag>> {
  return apiRequest<Tag[] | PaginatedResponse<Tag>>("/tags/", {
    params: params as Record<string, string | number | undefined>,
  });
}

export function getTag(id: string): Promise<Tag> {
  return apiRequest<Tag>(`/tags/${id}/`);
}

export function createTag(body: TagRequest): Promise<Tag> {
  return apiRequest<Tag>("/tags/", { method: "POST", body });
}

export function updateTag(id: string, body: Partial<TagRequest>): Promise<Tag> {
  return apiRequest<Tag>(`/tags/${id}/`, { method: "PUT", body });
}

export function patchTag(id: string, body: Partial<TagRequest>): Promise<Tag> {
  return apiRequest<Tag>(`/tags/${id}/`, { method: "PATCH", body });
}

export function deleteTag(id: string): Promise<void> {
  return apiRequest<void>(`/tags/${id}/`, { method: "DELETE" });
}

/** Wikidata search row — includes optional description for the autocomplete UI */
export type WikidataTagSuggestion = Tag & { description?: string };

type WikidataItem = {
  id: string;
  label: string;
  description?: string;
};

/** Search Wikidata-backed suggestions (may return QIDs not yet in local DB). */
export function searchWikidataTags(
  query: string,
  signal?: AbortSignal,
): Promise<WikidataTagSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return Promise.resolve([]);
  return apiRequest<WikidataItem[]>("/wikidata/search/", {
    params: { q, limit: 10 },
    signal,
  }).then((rows) =>
    (rows ?? [])
      .filter((item) => item?.id && item?.label)
      .map((item) => ({
        id: item.id,
        name: item.label,
        description: item.description,
      })),
  );
}

/**
 * Ensure a tag exists in our DB (creates via POST /tags/ or resolves duplicate).
 * Mirrors web `tagAPI.ensureInDb` — sends `{ id, name }` for Wikidata QIDs.
 */
export async function ensureTagInDb(tag: Tag): Promise<Tag> {
  const name = tag.name.trim();
  try {
    return await apiRequest<Tag>("/tags/", {
      method: "POST",
      body: { id: tag.id, name },
    });
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 400) {
      const results = await apiRequest<Tag[] | PaginatedResponse<Tag>>(
        "/tags/",
        {
          params: { search: name },
        },
      );
      const rows = Array.isArray(results)
        ? results
        : results?.results ?? [];
      const exact = rows.find(
        (t) =>
          t.id === tag.id || t.name.toLowerCase() === name.toLowerCase(),
      );
      if (exact) return exact;
    }
    throw err;
  }
}
