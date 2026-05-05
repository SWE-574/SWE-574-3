import apiClient from './api'

export interface ActivityActor {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
}

export type ActivityVerb =
  | 'service_created'
  | 'handshake_accepted'
  | 'handshake_completed'
  | 'user_followed'
  | 'service_endorsed'
  | 'event_filling_up'
  | 'new_neighbor'

export interface ActivityServiceRef {
  id: string
  title: string
  type: 'Offer' | 'Need' | 'Event'
  location_area?: string | null
  thumbnail_url?: string | null
}

export interface ActivityEvent {
  id: number
  verb: ActivityVerb
  actor: ActivityActor
  target_user: ActivityActor | null
  service: ActivityServiceRef | null
  created_at: string
  distance_km: number | null
  event_capacity_pct: number | null
  event_starts_in_seconds: number | null
  handshake_duration_hours: number | null
  actor_skills: string[] | null
  actor_location: string | null
}

interface PaginatedActivity {
  count: number
  next: string | null
  previous: string | null
  results: ActivityEvent[]
}

export interface ActivityFeedParams {
  days?: number
  lat?: number
  lng?: number
  page?: number
  sort?: 'nearby'
}

export const activityAPI = {
  feed: async (
    params?: ActivityFeedParams,
    signal?: AbortSignal,
  ): Promise<ActivityEvent[]> => {
    const query = new URLSearchParams()
    if (params?.days != null) query.set('days', String(params.days))
    if (params?.lat != null) query.set('lat', String(params.lat))
    if (params?.lng != null) query.set('lng', String(params.lng))
    if (params?.page != null) query.set('page', String(params.page))
    if (params?.sort) query.set('sort', params.sort)

    const res = await apiClient.get<PaginatedActivity | ActivityEvent[]>(
      '/activity/feed/',
      { params: query, signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },
}
