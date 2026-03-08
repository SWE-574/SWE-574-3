import apiClient from './api'
import type { Notification } from '@/types'

interface PaginatedNotifications {
  count: number
  next: string | null
  previous: string | null
  results: Notification[]
}

export const notificationAPI = {
  /** GET /api/notifications/?page=N — paginated list for the current user. */
  list: async (page = 1, signal?: AbortSignal): Promise<PaginatedNotifications> => {
    const res = await apiClient.get<PaginatedNotifications | Notification[]>(
      '/notifications/',
      { params: { page }, signal },
    )
    // Backend returns flat array when no page param, paginated otherwise
    if (Array.isArray(res.data)) {
      return { count: res.data.length, next: null, previous: null, results: res.data }
    }
    return res.data
  },

  /** GET /api/notifications/unread-count/ */
  unreadCount: async (signal?: AbortSignal): Promise<number> => {
    const res = await apiClient.get<{ count: number }>('/notifications/unread-count/', { signal })
    return res.data.count
  },

  /** PATCH /api/notifications/{id}/read/ — mark one notification as read. */
  markAsRead: async (id: string): Promise<Notification> => {
    const res = await apiClient.patch<Notification>(`/notifications/${id}/read/`)
    return res.data
  },

  /** POST /api/notifications/read/ — mark all unread as read. */
  markAllAsRead: async (): Promise<void> => {
    await apiClient.post('/notifications/read/')
  },
}
