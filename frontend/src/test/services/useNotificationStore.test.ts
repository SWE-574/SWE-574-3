/**
 * Tests for useNotificationStore.
 *
 * Exercises addNotification (dedup), markAsRead (optimistic update + revert),
 * markAllAsRead (optimistic update + revert), and reset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Notification } from '@/types'

const markAsReadAPIMock = vi.fn().mockResolvedValue(undefined)
const markAllAsReadAPIMock = vi.fn().mockResolvedValue(undefined)
const listAPIMock = vi.fn()
const unreadCountAPIMock = vi.fn().mockResolvedValue(3)

vi.mock('@/services/notificationAPI', () => ({
  notificationAPI: {
    list: listAPIMock,
    unreadCount: unreadCountAPIMock,
    markAsRead: markAsReadAPIMock,
    markAllAsRead: markAllAsReadAPIMock,
  },
}))

function makeNotification(id: string, is_read = false): Notification {
  return {
    id,
    type: 'handshake_request',
    title: `Notification ${id}`,
    message: 'msg',
    is_read,
    related_handshake: null,
    related_service: null,
    related_service_type: null,
    related_report: null,
    related_user: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.resetModules()
    markAsReadAPIMock.mockResolvedValue(undefined)
    markAllAsReadAPIMock.mockResolvedValue(undefined)
  })

  it('addNotification prepends new notification and increments unreadCount', async () => {
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()

    const n = makeNotification('n1')
    store.addNotification(n)

    const state = useNotificationStore.getState()
    expect(state.notifications[0].id).toBe('n1')
    expect(state.unreadCount).toBe(1)
  })

  it('addNotification ignores duplicate ids', async () => {
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()

    const n = makeNotification('n2')
    store.addNotification(n)
    store.addNotification(n)

    const state = useNotificationStore.getState()
    expect(state.notifications.length).toBe(1)
    expect(state.unreadCount).toBe(1)
  })

  it('markAsRead optimistically marks notification as read and decrements count', async () => {
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()
    store.addNotification(makeNotification('n3', false))

    await store.markAsRead('n3')

    const state = useNotificationStore.getState()
    expect(state.notifications.find((n) => n.id === 'n3')?.is_read).toBe(true)
    expect(state.unreadCount).toBe(0)
    expect(markAsReadAPIMock).toHaveBeenCalledWith('n3')
  })

  it('markAsRead reverts on API failure', async () => {
    markAsReadAPIMock.mockRejectedValueOnce(new Error('network'))
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()
    store.addNotification(makeNotification('n4', false))

    await store.markAsRead('n4')

    const state = useNotificationStore.getState()
    expect(state.notifications.find((n) => n.id === 'n4')?.is_read).toBe(false)
    expect(state.unreadCount).toBe(1)
  })

  it('markAllAsRead marks every notification as read and zeroes unreadCount', async () => {
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()
    store.addNotification(makeNotification('n5'))
    store.addNotification(makeNotification('n6'))

    await store.markAllAsRead()

    const state = useNotificationStore.getState()
    expect(state.notifications.every((n) => n.is_read)).toBe(true)
    expect(state.unreadCount).toBe(0)
    expect(markAllAsReadAPIMock).toHaveBeenCalled()
  })

  it('markAllAsRead reverts on API failure', async () => {
    markAllAsReadAPIMock.mockRejectedValueOnce(new Error('network'))
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()
    store.addNotification(makeNotification('n7', false))

    await store.markAllAsRead()

    const state = useNotificationStore.getState()
    expect(state.notifications.find((n) => n.id === 'n7')?.is_read).toBe(false)
  })

  it('reset clears all state', async () => {
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.addNotification(makeNotification('n8'))
    store.reset()

    const state = useNotificationStore.getState()
    expect(state.notifications).toHaveLength(0)
    expect(state.unreadCount).toBe(0)
    expect(state.hasMore).toBe(true)
    expect(state.currentPage).toBe(0)
  })

  it('fetchUnreadCount updates unreadCount from API', async () => {
    const { useNotificationStore } = await import('@/store/useNotificationStore')
    const store = useNotificationStore.getState()
    store.reset()

    await store.fetchUnreadCount()

    expect(useNotificationStore.getState().unreadCount).toBe(3)
  })
})
