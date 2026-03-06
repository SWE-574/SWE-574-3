import apiClient from './api'
import type { User, BadgeProgress } from '@/types'

export interface UserHistoryItem {
  service_title: string
  service_type: 'Offer' | 'Need' | 'Event'
  duration: number | string
  partner_name: string
  partner_id: string
  partner_avatar_url?: string | null
  completed_date: string
  was_provider: boolean
}

export interface UserUpdateData {
  first_name?: string
  last_name?: string
  bio?: string
  location?: string
  show_history?: boolean
  is_onboarded?: boolean
  /** Base64 data URL (e.g. "data:image/jpeg;base64,...") or https URL */
  avatar_url?: string
  /** Base64 data URL or https URL */
  banner_url?: string
  /** List of tag IDs (UUID strings or "custom:<name>") to set as user skills */
  skill_ids?: string[]
}

export const userAPI = {
  getMe: async (signal?: AbortSignal): Promise<User> => {
    const res = await apiClient.get<User>('/users/me/', { signal })
    return res.data
  },

  updateMe: async (data: UserUpdateData): Promise<User> => {
    const res = await apiClient.patch<User>('/users/me/', data)
    return res.data
  },

  getUser: async (id: string, signal?: AbortSignal): Promise<User> => {
    const res = await apiClient.get<User>(`/users/${id}/`, { signal })
    return res.data
  },

  getHistory: async (userId: string, signal?: AbortSignal): Promise<UserHistoryItem[]> => {
    const res = await apiClient.get<UserHistoryItem[] | { results: UserHistoryItem[] }>(
      `/users/${userId}/history/`,
      { signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },

  getBadgeProgress: async (userId: string, signal?: AbortSignal): Promise<BadgeProgress[]> => {
    const res = await apiClient.get<BadgeProgress[] | { results: BadgeProgress[] }>(
      `/users/${userId}/badge-progress/`,
      { signal },
    )
    const data = res.data
    return Array.isArray(data) ? data : (data.results ?? [])
  },
}
