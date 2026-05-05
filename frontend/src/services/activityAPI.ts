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
  | 'user_followed'

export interface ActivityServiceRef {
  id: string
  title: string
  type: 'Offer' | 'Need' | 'Event'
}

export interface ActivityEvent {
  id: number
  verb: ActivityVerb
  actor: ActivityActor
  target_user: ActivityActor | null
  service: ActivityServiceRef | null
  created_at: string
}

interface PaginatedActivity {
  count: number
  next: string | null
  previous: string | null
  results: ActivityEvent[]
}

export const activityAPI = {
  feed: async (
    params?: { days?: number; lat?: number; lng?: number; page?: number },
    signal?: AbortSignal,
  ): Promise<ActivityEvent[]> => {
    const query = new URLSearchParams()
    if (params?.days != null) query.set('days', String(params.days))
    if (params?.lat != null) query.set('lat', String(params.lat))
    if (params?.lng != null) query.set('lng', String(params.lng))
    if (params?.page != null) query.set('page', String(params.page))

    const res = await apiClient.get<PaginatedActivity | ActivityEvent[]>(
      '/activity/feed/',
      { params: query, signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },
}
