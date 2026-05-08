import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifMocks = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
}))

vi.mock('@/services/notificationAPI', () => ({
  notificationAPI: notifMocks,
}))

let useNotificationStore: typeof import('@/store/useNotificationStore').useNotificationStore

beforeEach(async () => {
  Object.values(notifMocks).forEach((fn) => fn.mockReset())
  vi.resetModules()
  useNotificationStore = (await import('@/store/useNotificationStore')).useNotificationStore
})

const notif = (id: string, is_read = false) =>
  ({ id, is_read, kind: 'system', body: 'x', created_at: '2026-05-08' }) as never

describe('useNotificationStore.fetchNotifications', () => {
  it('replaces notifications when page=1', async () => {
    notifMocks.list.mockResolvedValue({ results: [notif('a'), notif('b')], next: null })
    await useNotificationStore.getState().fetchNotifications(1)
    expect(useNotificationStore.getState().notifications).toHaveLength(2)
    expect(useNotificationStore.getState().hasMore).toBe(false)
    expect(useNotificationStore.getState().currentPage).toBe(1)
    expect(useNotificationStore.getState().isLoading).toBe(false)
  })

  it('appends results when page > 1', async () => {
    useNotificationStore.setState({ notifications: [notif('a')] })
    notifMocks.list.mockResolvedValue({ results: [notif('b')], next: 'next' })
    await useNotificationStore.getState().fetchNotifications(2)
    expect(useNotificationStore.getState().notifications.map((n) => n.id)).toEqual(['a', 'b'])
    expect(useNotificationStore.getState().hasMore).toBe(true)
  })

  it('clears isLoading on error', async () => {
    notifMocks.list.mockRejectedValue(new Error('boom'))
    await useNotificationStore.getState().fetchNotifications(1)
    expect(useNotificationStore.getState().isLoading).toBe(false)
  })
})

describe('useNotificationStore.fetchUnreadCount', () => {
  it('updates unreadCount on success', async () => {
    notifMocks.unreadCount.mockResolvedValue(7)
    await useNotificationStore.getState().fetchUnreadCount()
    expect(useNotificationStore.getState().unreadCount).toBe(7)
  })

  it('silently keeps prior count on error', async () => {
    useNotificationStore.setState({ unreadCount: 3 })
    notifMocks.unreadCount.mockRejectedValue(new Error('boom'))
    await useNotificationStore.getState().fetchUnreadCount()
    expect(useNotificationStore.getState().unreadCount).toBe(3)
  })
})

describe('useNotificationStore.markAsRead', () => {
  it('optimistically marks the notification as read and decrements unreadCount', async () => {
    useNotificationStore.setState({
      notifications: [notif('a'), notif('b')],
      unreadCount: 2,
    })
    notifMocks.markAsRead.mockResolvedValue(undefined)
    await useNotificationStore.getState().markAsRead('a')
    const a = useNotificationStore.getState().notifications.find((n) => n.id === 'a')
    expect(a?.is_read).toBe(true)
    expect(useNotificationStore.getState().unreadCount).toBe(1)
  })

  it('reverts on failure', async () => {
    useNotificationStore.setState({
      notifications: [notif('a'), notif('b')],
      unreadCount: 2,
    })
    notifMocks.markAsRead.mockRejectedValue(new Error('boom'))
    await useNotificationStore.getState().markAsRead('a')
    const a = useNotificationStore.getState().notifications.find((n) => n.id === 'a')
    expect(a?.is_read).toBe(false)
    expect(useNotificationStore.getState().unreadCount).toBe(2)
  })

  it('clamps unreadCount to 0', async () => {
    useNotificationStore.setState({
      notifications: [notif('a')],
      unreadCount: 0,
    })
    notifMocks.markAsRead.mockResolvedValue(undefined)
    await useNotificationStore.getState().markAsRead('a')
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })
})

describe('useNotificationStore.markAllAsRead', () => {
  it('marks all read and zeroes unreadCount', async () => {
    useNotificationStore.setState({
      notifications: [notif('a'), notif('b')],
      unreadCount: 2,
    })
    notifMocks.markAllAsRead.mockResolvedValue(undefined)
    await useNotificationStore.getState().markAllAsRead()
    const allRead = useNotificationStore.getState().notifications.every((n) => n.is_read)
    expect(allRead).toBe(true)
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })

  it('reverts notifications and refetches count on failure', async () => {
    useNotificationStore.setState({
      notifications: [notif('a'), notif('b')],
      unreadCount: 2,
    })
    notifMocks.markAllAsRead.mockRejectedValue(new Error('boom'))
    notifMocks.unreadCount.mockResolvedValue(2)
    await useNotificationStore.getState().markAllAsRead()
    const a = useNotificationStore.getState().notifications.find((n) => n.id === 'a')
    expect(a?.is_read).toBe(false)
    expect(notifMocks.unreadCount).toHaveBeenCalled()
  })
})

describe('useNotificationStore.addNotification / reset', () => {
  it('addNotification prepends and increments unreadCount', () => {
    useNotificationStore.setState({
      notifications: [notif('a')],
      unreadCount: 1,
    })
    useNotificationStore.getState().addNotification(notif('new'))
    expect(useNotificationStore.getState().notifications.map((n) => n.id)).toEqual(['new', 'a'])
    expect(useNotificationStore.getState().unreadCount).toBe(2)
  })

  it('reset returns to initial values', () => {
    useNotificationStore.setState({
      notifications: [notif('a')],
      unreadCount: 5,
      isLoading: true,
      hasMore: false,
      currentPage: 4,
    })
    useNotificationStore.getState().reset()
    expect(useNotificationStore.getState()).toMatchObject({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      hasMore: true,
      currentPage: 0,
    })
  })
})
