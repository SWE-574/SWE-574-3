import apiClient from './api'

export interface PulseStats {
  new_since_last_visit: number
  saved_count: number
  follow_handshakes_week: number
}

export interface PulseVisitResponse {
  last_pulse_visit_at: string
}

export interface DismissResponse {
  is_dismissed: boolean
}

export const pulseAPI = {
  getStats: async (signal?: AbortSignal): Promise<PulseStats> => {
    const res = await apiClient.get<PulseStats>('/pulse/stats/', { signal })
    return res.data
  },

  recordVisit: async (): Promise<PulseVisitResponse> => {
    const res = await apiClient.post<PulseVisitResponse>('/pulse/visit/')
    return res.data
  },

  setDismissed: async (
    serviceId: string,
    dismissed: boolean,
  ): Promise<DismissResponse> => {
    const res = dismissed
      ? await apiClient.post<DismissResponse>(`/services/${serviceId}/dismiss/`)
      : await apiClient.delete<DismissResponse>(`/services/${serviceId}/dismiss/`)
    return res.data
  },
}

export default pulseAPI
