import apiClient from './api'
import type {
  RecommendationDebugAvailabilityResponse,
  RecommendationDebugResponse,
  Service,
} from '@/types'

export interface ServiceListParams {
  sort?: 'latest' | 'hot'
  lat?: number
  lng?: number
  distance?: number
  search?: string
  type?: 'Offer' | 'Need' | 'Event'
  status?: string
  tags?: string[]
  page?: number
  page_size?: number
  user_id?: string
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
    if (params?.status) queryParams.set('status', params.status)
    if (params?.tags?.length) params.tags.forEach(t => queryParams.append('tags', t))
    if (params?.page) queryParams.set('page', String(params.page))
    if (params?.page_size) queryParams.set('page_size', String(params.page_size))
    if (params?.user_id) queryParams.set('user', params.user_id)

    const res = await apiClient.get<ServiceListResponse>('/services/', {
      params: queryParams,
      signal,
    })
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
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

  cancelEvent: async (serviceId: string): Promise<void> => {
    await apiClient.post(`/services/${serviceId}/cancel-event/`, {})
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
