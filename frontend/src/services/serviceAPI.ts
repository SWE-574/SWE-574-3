import apiClient from './api'
import type { Service } from '@/types'

export interface ServiceListParams {
  lat?: number
  lng?: number
  distance?: number
  search?: string
  type?: 'Offer' | 'Need'
  status?: string
}

type ServiceListResponse = Service[] | { results: Service[]; count?: number }

export const serviceAPI = {
  list: async (params?: ServiceListParams, signal?: AbortSignal): Promise<Service[]> => {
    const queryParams: Record<string, string> = {}
    if (params?.lat != null) queryParams.lat = String(params.lat)
    if (params?.lng != null) queryParams.lng = String(params.lng)
    if (params?.distance != null) queryParams.distance = String(params.distance)
    if (params?.search) queryParams.search = params.search
    if (params?.type) queryParams.type = params.type
    if (params?.status) queryParams.status = params.status

    const res = await apiClient.get<ServiceListResponse>('/services/', {
      params: queryParams,
      signal,
    })
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  get: async (id: string): Promise<Service> => {
    const res = await apiClient.get<Service>(`/services/${id}/`)
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
}
