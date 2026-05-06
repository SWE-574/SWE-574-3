/**
 * Featured API – fetch trending services, friend activity, and top providers
 * GET /api/featured/
 */

import { apiRequest } from './client';
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
