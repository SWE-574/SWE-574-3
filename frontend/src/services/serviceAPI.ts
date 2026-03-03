import apiClient from './api'
import type { Service } from '@/types'

export interface ServiceListParams {
  lat?: number
  lng?: number
  distance?: number
  search?: string
  type?: 'Offer' | 'Need'
  status?: string
  tags?: string[]
  page?: number
  page_size?: number
}

type ServiceListResponse = Service[] | { results: Service[]; count?: number }

export const serviceAPI = {
  list: async (params?: ServiceListParams, signal?: AbortSignal): Promise<Service[]> => {
    // URLSearchParams preserves repeated keys (?tags=a&tags=b) as expected by
    // DRF's request.query_params.getlist('tags').
    const queryParams = new URLSearchParams()
    if (params?.lat != null) queryParams.set('lat', String(params.lat))
    if (params?.lng != null) queryParams.set('lng', String(params.lng))
    if (params?.distance != null) queryParams.set('distance', String(params.distance))
    if (params?.search) queryParams.set('search', params.search)
    if (params?.type) queryParams.set('type', params.type)
    if (params?.status) queryParams.set('status', params.status)
    if (params?.tags?.length) params.tags.forEach(t => queryParams.append('tags', t))
    if (params?.page) queryParams.set('page', String(params.page))
    if (params?.page_size) queryParams.set('page_size', String(params.page_size))

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
    const res = await apiClient.post<Service>('/services/', data)
    return res.data
  },

  update: async (id: string, data: Partial<Service>): Promise<Service> => {
    const res = await apiClient.patch<Service>(`/services/${id}/`, data)
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
}
