/**
 * Activity feed API (#482).
 * GET /api/activity/feed/?days=N&lat=...&lng=...
 */
import { apiRequest } from './client';
import type { PaginatedResponse } from './types';

export interface ActivityActor {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export type ActivityVerb =
  | 'service_created'
  | 'handshake_accepted'
  | 'user_followed';

export interface ActivityServiceRef {
  id: string;
  title: string;
  type: 'Offer' | 'Need' | 'Event';
}

export interface ActivityEvent {
  id: number;
  verb: ActivityVerb;
  actor: ActivityActor;
  target_user: ActivityActor | null;
  service: ActivityServiceRef | null;
  created_at: string;
}

export interface ActivityFeedParams {
  days?: number;
  lat?: number;
  lng?: number;
  page?: number;
}

export function listActivityFeed(
  params?: ActivityFeedParams,
): Promise<PaginatedResponse<ActivityEvent>> {
  return apiRequest<PaginatedResponse<ActivityEvent>>('/activity/feed/', {
    params: params as Record<
      string,
      string | number | boolean | Array<string | number | boolean> | undefined
    >,
  });
}
