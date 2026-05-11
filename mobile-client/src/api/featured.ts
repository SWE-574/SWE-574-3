/**
 * Featured API – chip strip for the Browse tag filter row.
 * GET /api/featured/chips/
 */

import { ApiHttpError, apiRequest, getApiBaseUrl } from './client';

export interface FeaturedChip {
  qid: string;
  label: string;
  count: number;
}

export interface FeaturedChipsResponse {
  chips: FeaturedChip[];
}

export async function getFeaturedChips(): Promise<FeaturedChipsResponse> {
  // The chips endpoint accepts anonymous viewers (returns top global tags),
  // but DRF still runs the configured authentication classes first. A stale
  // Bearer token after a backend reset triggers JWTAuthentication ->
  // InvalidToken -> 401 even though permissions allow anonymous. Fall back
  // to a no-auth fetch in that case so the chip strip still populates.
  try {
    const response = await apiRequest<FeaturedChipsResponse>('/featured/chips/');
    return { chips: response.chips ?? [] };
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 401) {
      const url = `${getApiBaseUrl()}/featured/chips/`;
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) return { chips: [] };
      const data = (await res.json()) as FeaturedChipsResponse;
      return { chips: data.chips ?? [] };
    }
    throw err;
  }
}
