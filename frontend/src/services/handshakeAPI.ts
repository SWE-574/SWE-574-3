import apiClient from './api'

export type HandshakeStatus =
  | 'pending'
  | 'accepted'
  | 'completed'
  | 'denied'
  | 'cancelled'
  | 'reported'
  | 'paused'

/** Handshake as returned by /api/handshakes/ — service and requester may be
 *  returned as nested objects or bare IDs depending on the endpoint. */
export interface Handshake {
  id: string
  service: string | { id: string; [key: string]: unknown }
  requester: string
  provider: string
  status: HandshakeStatus
  proposed_time?: string
  actual_duration?: number
  requester_confirmed?: boolean
  provider_confirmed?: boolean
  created_at: string
  updated_at: string
  notes?: string
}

type HandshakeListResponse = Handshake[] | { results: Handshake[]; count?: number }

export const handshakeAPI = {
  list: async (signal?: AbortSignal): Promise<Handshake[]> => {
    const res = await apiClient.get<HandshakeListResponse>('/handshakes/', { signal })
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  get: async (id: string, signal?: AbortSignal): Promise<Handshake> => {
    const res = await apiClient.get<Handshake>(`/handshakes/${id}/`, { signal })
    return res.data
  },

  updateStatus: async (
    id: string,
    status: HandshakeStatus,
    signal?: AbortSignal,
  ): Promise<Handshake> => {
    const res = await apiClient.patch<Handshake>(`/handshakes/${id}/`, { status }, { signal })
    return res.data
  },
}
