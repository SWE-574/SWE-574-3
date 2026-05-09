/**
 * Featured API – fetch trending services, friend activity, and top providers
 * GET /api/featured/
 */

import { ApiHttpError, apiRequest, getApiBaseUrl } from './client';
import { normalizeRuntimeUrl } from '../constants/env';

export interface FeaturedServiceUser {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface FeaturedServiceTag {
  id: string;
  name: string;
}

export interface FeaturedService {
  id: string;
  title: string;
  type: 'Offer' | 'Need' | 'Event';
  user: FeaturedServiceUser;
  tags: FeaturedServiceTag[];
  participant_count: number;
  max_participants: number;
  location_area: string | null;
  created_at: string;
  // Only on friends category
  friend_count?: number;
  friend_names?: string[];
}

export interface FeaturedProvider {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  completed_count: number;
  positive_rep_count: number;
}

export interface FeaturedResponse {
  trending: FeaturedService[];
  friends: FeaturedService[];
  top_providers: FeaturedProvider[];
}

function normalizeFeaturedUser<T extends FeaturedServiceUser | FeaturedProvider>(user: T): T {
  return {
    ...user,
    avatar_url: normalizeRuntimeUrl(user.avatar_url),
  };
}

function normalizeFeaturedService(service: FeaturedService): FeaturedService {
  return {
    ...service,
    user: normalizeFeaturedUser(service.user),
  };
}

export function getFeatured(): Promise<FeaturedResponse> {
  return apiRequest<FeaturedResponse>('/featured/').then((response) => ({
    ...response,
    trending: (response.trending ?? []).map(normalizeFeaturedService),
    friends: (response.friends ?? []).map(normalizeFeaturedService),
    top_providers: (response.top_providers ?? []).map(normalizeFeaturedUser),
  }));
}

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
