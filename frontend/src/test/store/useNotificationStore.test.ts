import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNotificationStore } from '@/store/useNotificationStore'

vi.mock('@/services/notificationAPI', () => ({
  notificationAPI: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}))

const notificationAPI = await import('@/services/notificationAPI').then((m) => m.notificationAPI)

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().reset()
    vi.mocked(notificationAPI.markAsRead).mockReset()
    vi.mocked(notificationAPI.markAllAsRead).mockReset()
  })

  it('markAsRead reverts state when API fails', async () => {
    const id = 'notif-1'
    useNotificationStore.setState({
      notifications: [
        { id, title: 'Test', message: 'Test', is_read: false, type: 'handshake', created_at: '', related_handshake: null, related_service: null },
      ],
      unreadCount: 1,
    })

    vi.mocked(notificationAPI.markAsRead).mockRejectedValueOnce(new Error('Network error'))

    await useNotificationStore.getState().markAsRead(id)

    expect(useNotificationStore.getState().notifications[0].is_read).toBe(false)
    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  it('markAsRead keeps optimistic state when API succeeds', async () => {
    const id = 'notif-1'
    useNotificationStore.setState({
      notifications: [
        { id, title: 'Test', message: 'Test', is_read: false, type: 'handshake', created_at: '', related_handshake: null, related_service: null },
      ],
      unreadCount: 1,
    })

    vi.mocked(notificationAPI.markAsRead).mockResolvedValueOnce({
      id,
      title: 'Test',
      message: 'Test',
      is_read: true,
      type: 'handshake',
      created_at: '',
      related_handshake: null,
      related_service: null,
    })

    await useNotificationStore.getState().markAsRead(id)

    expect(useNotificationStore.getState().notifications[0].is_read).toBe(true)
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })

  it('markAllAsRead reverts notifications when API fails', async () => {
    useNotificationStore.setState({
      notifications: [
        { id: 'n1', title: 'A', message: 'A', is_read: false, type: 'handshake', created_at: '', related_handshake: null, related_service: null },
      ],
      unreadCount: 1,
    })

    vi.mocked(notificationAPI.markAllAsRead).mockRejectedValueOnce(new Error('Server error'))

    await useNotificationStore.getState().markAllAsRead()

    expect(useNotificationStore.getState().notifications[0].is_read).toBe(false)
  })
})
