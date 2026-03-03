import apiClient from './api'

export interface Handshake {
  id: string
  service: string | { id: string }
  service_title: string
  requester: string
  requester_name: string
  provider_name: string
  status: 'pending' | 'accepted' | 'denied' | 'cancelled' | 'completed' | 'reported' | 'paused'
  provisioned_hours: number
  provider_confirmed_complete: boolean
  receiver_confirmed_complete: boolean
  /** Set after provider fills in session details via /initiate/ */
  provider_initiated?: boolean
  /** Set after requester approves details via /approve/ */
  requester_initiated?: boolean
  exact_location?: string | null
  exact_duration?: number | null
  scheduled_time?: string | null
  created_at: string
  updated_at: string
}

export interface InitiatePayload {
  exact_location: string
  exact_duration: number
  scheduled_time: string
}

export const handshakeAPI = {
  list: async (signal?: AbortSignal): Promise<Handshake[]> => {
    const res = await apiClient.get<Handshake[]>('/handshakes/', { signal })
    return Array.isArray(res.data) ? res.data : []
  },

  get: async (id: string, signal?: AbortSignal): Promise<Handshake> => {
    const res = await apiClient.get<Handshake>(`/handshakes/${id}/`, { signal })
    return res.data
  },

  accept: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/accept/`, {})
    return res.data
  },

  deny: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/deny/`, {})
    return res.data
  },

  cancel: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/cancel/`, {})
    return res.data
  },

  /**
   * Provider fills in session details (location, duration, scheduled_time).
   * Sets provider_initiated=true; status stays pending until requester approves.
   */
  initiate: async (id: string, payload: InitiatePayload): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/initiate/`, payload)
    return res.data
  },

  /**
   * Requester reviews provider's details and approves.
   * Transitions status pending → accepted and provisions TimeBank.
   */
  approve: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/approve/`, {})
    return res.data
  },

  /**
   * Either party confirms service completion.
   * When both confirm, status transitions to completed.
   */
  confirm: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/confirm/`, {})
    return res.data
  },
}
