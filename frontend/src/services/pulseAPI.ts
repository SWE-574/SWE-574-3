import apiClient from './api'

export interface PulseStats {
  new_since_last_visit: number
  saved_count: number
  follow_handshakes_week: number
}

export interface PulseVisitResponse {
  last_pulse_visit_at: string
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
}

export default pulseAPI
