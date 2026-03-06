import { create } from 'zustand'
import type { Notification } from '@/types'
import { notificationAPI } from '@/services/notificationAPI'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  hasMore: boolean
  currentPage: number

  fetchNotifications: (page?: number) => Promise<void>
  fetchUnreadCount: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  addNotification: (notification: Notification) => void
  reset: () => void
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: true,
  currentPage: 0,

  fetchNotifications: async (page = 1) => {
    set({ isLoading: true })
    try {
      const data = await notificationAPI.list(page)
      set((state) => ({
        notifications: page === 1 ? data.results : [...state.notifications, ...data.results],
        hasMore: data.next !== null,
        currentPage: page,
        isLoading: false,
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  fetchUnreadCount: async () => {
    try {
      const count = await notificationAPI.unreadCount()
      set({ unreadCount: count })
    } catch {
      // silent — badge simply won't update
    }
  },

  markAsRead: async (id: string) => {
    const prev = get().notifications
    const prevCount = get().unreadCount
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
    try {
      await notificationAPI.markAsRead(id)
    } catch {
      // Revert on failure
      set({ notifications: prev, unreadCount: prevCount })
    }
  },

  markAllAsRead: async () => {
    const prev = get().notifications
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }))
    try {
      await notificationAPI.markAllAsRead()
    } catch {
      // Revert
      set({ notifications: prev })
      get().fetchUnreadCount()
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }))
  },

  reset: () => set({ notifications: [], unreadCount: 0, isLoading: false, hasMore: true, currentPage: 0 }),
}))
