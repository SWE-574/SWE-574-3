import { create } from 'zustand';
import type { Notification } from '../api/notifications';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/notifications';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  currentPage: number;

  fetchNotifications: (page?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  reset: () => void;
}

const initialState = {
  notifications: [] as Notification[],
  unreadCount: 0,
  isLoading: false,
  hasMore: true,
  currentPage: 0,
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  ...initialState,

  fetchNotifications: async (page = 1) => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const data = await listNotifications({ page });
      set((state) => ({
        notifications:
          page === 1
            ? data.results
            : [...state.notifications, ...data.results],
        hasMore: data.next !== null,
        currentPage: page,
      }));
    } catch {
      // silently fail — user can pull-to-refresh
    } finally {
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { count } = await getUnreadCount();
      set({ unreadCount: count });
    } catch {
      // ignore
    }
  },

  markAsRead: async (id: string) => {
    const prev = get().notifications;
    const prevCount = get().unreadCount;
    const target = prev.find((n) => n.id === id);
    if (!target || target.is_read) return;

    // optimistic update
    set({
      notifications: prev.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      ),
      unreadCount: Math.max(0, prevCount - 1),
    });

    try {
      await markNotificationRead(id);
    } catch {
      // revert on failure
      set({ notifications: prev, unreadCount: prevCount });
    }
  },

  markAllAsRead: async () => {
    const prev = get().notifications;
    const prevCount = get().unreadCount;

    // optimistic update
    set({
      notifications: prev.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    });

    try {
      await markAllNotificationsRead();
    } catch {
      // revert on failure
      set({ notifications: prev, unreadCount: prevCount });
    }
  },

  addNotification: (notification: Notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  reset: () => set(initialState),
}));
