import apiClient from './api'
import type { User, BadgeProgress, AchievementProgressItem } from '@/types'

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
  /** MinIO/https URL — set by the server after upload; do NOT send base64 */
  avatar_url?: string
  /** MinIO/https URL — set by the server after upload */
  banner_url?: string
  /** List of tag IDs (UUID strings or "custom:<name>") to set as user skills */
  skill_ids?: string[]
}

/** Convert a base64 data URL → Blob so it can be sent as a file */
export function dataURLtoBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

type RawAchievementProgressEntry = {
  achievement?: {
    name?: string
    description?: string
    icon_url?: string | null
    karma_points?: number
    is_hidden?: boolean
  }
  badge?: {
    name?: string
    description?: string
    icon_url?: string | null
    karma_points?: number
    is_hidden?: boolean
  }
  earned?: boolean
  current?: number | null
  threshold?: number | null
  progress_percent?: number
  earned_at?: string | null
}

type RawAchievementProgressResponse =
  | Record<string, RawAchievementProgressEntry>
  | { results?: AchievementProgressItem[] | RawAchievementProgressEntry[] }
  | AchievementProgressItem[]
  | RawAchievementProgressEntry[]

function normalizeAchievementProgress(data: RawAchievementProgressResponse): AchievementProgressItem[] {
  if (Array.isArray(data)) {
    return data.map((entry, index) => {
      const typed = entry as AchievementProgressItem & RawAchievementProgressEntry
      const nested = typed.achievement ?? typed.badge ?? {}
      return {
        badge_type: typed.badge_type ?? `achievement-${index}`,
        achievement: {
          name: nested.name ?? 'Achievement',
          description: nested.description ?? '',
          icon_url: nested.icon_url ?? null,
          karma_points: nested.karma_points ?? 0,
          is_hidden: nested.is_hidden ?? false,
        },
        earned: Boolean(typed.earned),
        current: typed.current ?? null,
        threshold: typed.threshold ?? null,
        progress_percent: typed.progress_percent ?? 0,
        earned_at: typed.earned_at ?? null,
      }
    })
  }

  if ('results' in data && Array.isArray(data.results)) {
    return normalizeAchievementProgress(data.results)
  }

  return Object.entries(data).map(([badgeType, entry]) => {
    const nested = entry.achievement ?? entry.badge ?? {}
    return {
      badge_type: badgeType,
      achievement: {
        name: nested.name ?? badgeType,
        description: nested.description ?? '',
        icon_url: nested.icon_url ?? null,
        karma_points: nested.karma_points ?? 0,
        is_hidden: nested.is_hidden ?? false,
      },
      earned: Boolean(entry.earned),
      current: entry.current ?? null,
      threshold: entry.threshold ?? null,
      progress_percent: entry.progress_percent ?? 0,
      earned_at: entry.earned_at ?? null,
    }
  })
}

export const userAPI = {
  getMe: async (signal?: AbortSignal): Promise<User> => {
    const res = await apiClient.get<User>('/users/me/', { signal })
    return res.data
  },

  /**
   * Update profile.
   * Pass a FormData when avatar/banner files are included (multipart);
   * pass a plain object for JSON-only updates.
   */
  updateMe: async (data: UserUpdateData | FormData): Promise<User> => {
    const isFormData = data instanceof FormData
    const res = await apiClient.patch<User>('/users/me/', data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    })
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
    const res = await apiClient.get<RawAchievementProgressResponse>(
      `/users/${userId}/badge-progress/`,
      { signal },
    )
    return normalizeAchievementProgress(res.data).map((item) => ({
      badge_type: item.badge_type,
      name: item.achievement.name,
      description: item.achievement.description,
      current_value: item.current ?? 0,
      threshold: item.threshold ?? 0,
      earned: item.earned,
      earned_at: item.earned_at ?? undefined,
      karma_points: item.achievement.karma_points ?? 0,
      is_hidden: item.achievement.is_hidden ?? false,
    }))
  },

  getAchievementProgress: async (userId: string, signal?: AbortSignal): Promise<AchievementProgressItem[]> => {
    const res = await apiClient.get<RawAchievementProgressResponse>(
      `/users/${userId}/badge-progress/`,
      { signal },
    )
    return normalizeAchievementProgress(res.data)
  },
}
