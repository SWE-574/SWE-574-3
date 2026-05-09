import apiClient from './api'
import type {
  RecommendationDebugAvailabilityResponse,
  RecommendationDebugResponse,
  Service,
} from '@/types'

export interface ServiceListParams {
  sort?: 'latest' | 'hot' | 'for_you'
  lat?: number
  lng?: number
  distance?: number
  search?: string
  type?: 'Offer' | 'Need' | 'Event'
  // Repeated `type=` keys for multi-select (Browse). Backend honors `type__in`.
  types?: ('Offer' | 'Need' | 'Event')[]
  // Repeated `location_type=` keys for Online + In-Person multi-select.
  location_types?: ('Online' | 'In-Person')[]
  schedule_type?: 'One-Time' | 'Recurrent'
  weekend?: boolean
  status?: string
  tags?: string[]
  page?: number
  page_size?: number
  user_id?: string
  explore_only?: boolean
  exclude_own?: boolean
  // FR-12c — only honored when type='Event'. ISO-8601 dates.
  date_from?: string
  date_to?: string
}

export interface ServiceListPagedResponse {
  results: Service[]
  count: number
}

export interface ServiceRankingDebugParams {
  service_ids: string[]
  selected_service_id?: string
  search?: string
  tags?: string[]
  lat?: number
  lng?: number
  distance?: number
  active_filter?: string
}

type ServiceListResponse = Service[] | { results: Service[]; count?: number }

export interface PublicFeaturedService {
  id: string
  title: string
  type: 'Offer' | 'Need' | 'Event'
  user: {
    id: string
    first_name: string
    last_name: string
    avatar_url?: string | null
  }
  tags: { id: string; name: string }[]
  participant_count: number
  max_participants: number
  location_area?: string | null
  created_at: string
}

export interface PublicFeaturedTopProvider {
  id: string
  first_name: string
  last_name: string
  avatar_url?: string | null
  completed_count: number
  positive_rep_count: number
}

export interface PublicFeaturedResponse {
  trending: PublicFeaturedService[]
  top_providers: PublicFeaturedTopProvider[]
}

export const serviceAPI = {
  list: async (params?: ServiceListParams, signal?: AbortSignal): Promise<Service[]> => {
    // URLSearchParams preserves repeated keys (?tags=a&tags=b) as expected by
    // DRF's request.query_params.getlist('tags').
    const queryParams = new URLSearchParams()
    if (params?.sort) queryParams.set('sort', params.sort)
    if (params?.lat != null) queryParams.set('lat', String(params.lat))
    if (params?.lng != null) queryParams.set('lng', String(params.lng))
    if (params?.distance != null) queryParams.set('distance', String(params.distance))
    if (params?.search) queryParams.set('search', params.search)
    if (params?.type) queryParams.set('type', params.type)
    if (params?.types?.length) params.types.forEach((t) => queryParams.append('type', t))
    if (params?.location_types?.length) {
      params.location_types.forEach((v) => queryParams.append('location_type', v))
    }
    if (params?.schedule_type) queryParams.set('schedule_type', params.schedule_type)
    if (params?.weekend) queryParams.set('weekend', 'true')
    if (params?.status) queryParams.set('status', params.status)
    if (params?.tags?.length) params.tags.forEach(t => queryParams.append('tags', t))
    if (params?.page) queryParams.set('page', String(params.page))
    if (params?.page_size) queryParams.set('page_size', String(params.page_size))
    if (params?.user_id) queryParams.set('user', params.user_id)
    if (params?.explore_only) queryParams.set('explore_only', 'true')
    if (params?.exclude_own) queryParams.set('exclude_own', 'true')
    if (params?.date_from) queryParams.set('date_from', params.date_from)
    if (params?.date_to) queryParams.set('date_to', params.date_to)

    const res = await apiClient.get<ServiceListResponse>('/services/', {
      params: queryParams,
      signal,
    })
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  // Paged variant — returns the DRF page envelope so callers (Browse) can
  // render a numbered pager. Same query params as `list()`.
  listPaged: async (
    params?: ServiceListParams,
    signal?: AbortSignal,
  ): Promise<ServiceListPagedResponse> => {
    const queryParams = new URLSearchParams()
    if (params?.sort) queryParams.set('sort', params.sort)
    if (params?.lat != null) queryParams.set('lat', String(params.lat))
    if (params?.lng != null) queryParams.set('lng', String(params.lng))
    if (params?.distance != null) queryParams.set('distance', String(params.distance))
    if (params?.search) queryParams.set('search', params.search)
    if (params?.type) queryParams.set('type', params.type)
    if (params?.types?.length) params.types.forEach((t) => queryParams.append('type', t))
    if (params?.location_types?.length) {
      params.location_types.forEach((v) => queryParams.append('location_type', v))
    }
    if (params?.schedule_type) queryParams.set('schedule_type', params.schedule_type)
    if (params?.weekend) queryParams.set('weekend', 'true')
    if (params?.status) queryParams.set('status', params.status)
    if (params?.tags?.length) params.tags.forEach((t) => queryParams.append('tags', t))
    if (params?.page) queryParams.set('page', String(params.page))
    if (params?.page_size) queryParams.set('page_size', String(params.page_size))
    if (params?.user_id) queryParams.set('user', params.user_id)
    if (params?.explore_only) queryParams.set('explore_only', 'true')
    if (params?.exclude_own) queryParams.set('exclude_own', 'true')
    if (params?.date_from) queryParams.set('date_from', params.date_from)
    if (params?.date_to) queryParams.set('date_to', params.date_to)

    const res = await apiClient.get<ServiceListResponse>('/services/', {
      params: queryParams,
      signal,
    })
    const data = res.data
    if (Array.isArray(data)) {
      return { results: data, count: data.length }
    }
    return {
      results: data.results ?? [],
      count: data.count ?? (data.results?.length ?? 0),
    }
  },

  get: async (id: string, signal?: AbortSignal): Promise<Service> => {
    const res = await apiClient.get<Service>(`/services/${id}/`, { signal })
    return res.data
  },

  create: async (data: FormData | Record<string, unknown>): Promise<Service> => {
    const isFormData = data instanceof FormData
    const res = await apiClient.post<Service>('/services/', data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    })
    return res.data
  },

  update: async (id: string, data: FormData | Partial<Service>): Promise<Service> => {
    const isFormData = data instanceof FormData
    const res = await apiClient.patch<Service>(`/services/${id}/`, data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    })
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/services/${id}/`)
  },

  expressInterest: async (serviceId: string, signal?: AbortSignal): Promise<{ id: string; status: string }> => {
    const res = await apiClient.post<{ id: string; status: string }>(
      `/services/${serviceId}/interest/`,
      {},
      { signal },
    )
    return res.data
  },

  setSaved: async (serviceId: string, saved: boolean): Promise<{ is_saved: boolean }> => {
    const res = saved
      ? await apiClient.post<{ is_saved: boolean }>(`/services/${serviceId}/save/`)
      : await apiClient.delete<{ is_saved: boolean }>(`/services/${serviceId}/save/`)
    return res.data
  },

  listSaved: async (signal?: AbortSignal): Promise<Service[]> => {
    const res = await apiClient.get<Service[] | { results: Service[] }>(
      '/services/saved/',
      { signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  report: async (
    serviceId: string,
    issueType: 'inappropriate_content' | 'spam' | 'service_issue' | 'scam' | 'harassment' | 'other',
    description: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    await apiClient.post(
      `/services/${serviceId}/report/`,
      { issue_type: issueType, description },
      { signal },
    )
  },

  // ─── Event actions ────────────────────────────────────────────────────────

  pinEvent: async (serviceId: string): Promise<Service> => {
    const res = await apiClient.post<Service>(`/services/${serviceId}/pin-event/`)
    return res.data
  },

  completeEvent: async (serviceId: string): Promise<void> => {
    await apiClient.post(`/services/${serviceId}/complete-event/`, {})
  },

  cancelEvent: async (serviceId: string, reason: string): Promise<void> => {
    await apiClient.post(`/services/${serviceId}/cancel-event/`, { reason })
  },

  generateQRToken: async (serviceId: string) => {
    const res = await apiClient.post<{
      id: string
      token: string
      attendance_code: string
      created_at: string
      expires_at: string
      qr_payload: string
    }>(`/services/${serviceId}/generate-qr-token/`)
    return res.data
  },

  getQRToken: async (serviceId: string) => {
    const res = await apiClient.get<{
      id: string
      token: string
      attendance_code: string
      created_at: string
      expires_at: string
      qr_payload: string
    }>(`/services/${serviceId}/qr-token/`)
    return res.data
  },

  setPrimaryMedia: async (serviceId: string, mediaId: string): Promise<Service> => {
    const res = await apiClient.patch<Service>(`/services/${serviceId}/set-primary-media/`, { media_id: mediaId })
    return res.data
  },

  getRankingDebug: async (
    payload: ServiceRankingDebugParams,
    signal?: AbortSignal,
  ): Promise<RecommendationDebugResponse> => {
    const res = await apiClient.post<RecommendationDebugResponse>('/services/debug-ranking/', payload, { signal })
    return res.data
  },

  getRankingDebugAvailability: async (signal?: AbortSignal): Promise<RecommendationDebugAvailabilityResponse> => {
    const res = await apiClient.get<RecommendationDebugAvailabilityResponse>('/services/debug-ranking-availability/', { signal })
    return res.data
  },

  // Anonymous-safe trending feed for the public landing page.
  // Tolerates the 5-minute server cache; caller should defensively handle [].
  getPublicFeatured: async (signal?: AbortSignal): Promise<PublicFeaturedResponse> => {
    const res = await apiClient.get<PublicFeaturedResponse>('/featured/public/', { signal })
    return res.data
  },
}
