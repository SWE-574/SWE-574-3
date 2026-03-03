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
  created_at: string
  updated_at: string
}

export const handshakeAPI = {
  list: async (signal?: AbortSignal): Promise<Handshake[]> => {
    const res = await apiClient.get<Handshake[]>('/handshakes/', { signal })
    return Array.isArray(res.data) ? res.data : []
  },

  accept: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/accept/`)
    return res.data
  },

  deny: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/deny/`)
    return res.data
  },

  cancel: async (id: string): Promise<Handshake> => {
    const res = await apiClient.post<Handshake>(`/handshakes/${id}/cancel/`)
    return res.data
  },
}
