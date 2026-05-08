import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { installMockWebSocket, MockWebSocket } from '@/test/helpers/mockWebSocket'

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  user: { id: 'u-1', email: 'a@b.c' },
}))
const notificationActions = vi.hoisted(() => ({
  addNotification: vi.fn(),
  fetchUnreadCount: vi.fn(),
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => authState,
}))
vi.mock('@/store/useNotificationStore', () => ({
  useNotificationStore: () => notificationActions,
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))

let restoreWS: () => void
let useNotificationSocket: typeof import('@/hooks/useNotificationSocket').useNotificationSocket

beforeEach(async () => {
  authState.isAuthenticated = true
  authState.user = { id: 'u-1', email: 'a@b.c' }
  notificationActions.addNotification.mockReset()
  notificationActions.fetchUnreadCount.mockReset()
  restoreWS = installMockWebSocket()
  vi.resetModules()
  const mod = await import('@/hooks/useNotificationSocket')
  useNotificationSocket = mod.useNotificationSocket
})

afterEach(() => {
  restoreWS()
  vi.useRealTimers()
})

describe('useNotificationSocket', () => {
  it('opens ws://.../ws/notifications/ when authenticated', () => {
    renderHook(() => useNotificationSocket())
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.last().url).toMatch(/\/ws\/notifications\/$/)
  })

  it('does not open a socket when unauthenticated', () => {
    authState.isAuthenticated = false
    renderHook(() => useNotificationSocket())
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('syncs unread count on (re)connect', () => {
    renderHook(() => useNotificationSocket())
    act(() => MockWebSocket.last().triggerOpen())
    expect(notificationActions.fetchUnreadCount).toHaveBeenCalledTimes(1)
  })

  it('routes notification frames into the store', async () => {
    const { toast } = await import('sonner')
    renderHook(() => useNotificationSocket())
    act(() => {
      MockWebSocket.last().triggerOpen()
      MockWebSocket.last().triggerMessage({
        type: 'notification',
        notification: { id: 'n-1', title: 'Hi', message: 'there' },
      })
    })
    expect(notificationActions.addNotification).toHaveBeenCalledWith({ id: 'n-1', title: 'Hi', message: 'there' })
    expect(toast).toHaveBeenCalledWith('Hi', { description: 'there' })
  })

  it('ignores non-notification frames', () => {
    renderHook(() => useNotificationSocket())
    act(() => {
      MockWebSocket.last().triggerOpen()
      MockWebSocket.last().triggerMessage({ type: 'pong' })
      MockWebSocket.last().triggerMessage('not-json{')
    })
    expect(notificationActions.addNotification).not.toHaveBeenCalled()
  })

  it('does not reconnect on application-level rejection (code ≥ 4000)', () => {
    vi.useFakeTimers()
    renderHook(() => useNotificationSocket())
    act(() => MockWebSocket.last().triggerOpen())
    act(() => MockWebSocket.last().triggerClose({ code: 4001 }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('schedules a reconnect on a transient close', () => {
    vi.useFakeTimers()
    renderHook(() => useNotificationSocket())
    act(() => MockWebSocket.last().triggerOpen())
    act(() => MockWebSocket.last().triggerClose({ code: 1006 }))
    act(() => { vi.advanceTimersByTime(1_500) })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('disconnects when auth flips to logged-out', () => {
    const { rerender } = renderHook(() => useNotificationSocket())
    act(() => MockWebSocket.last().triggerOpen())
    const ws = MockWebSocket.last()
    authState.isAuthenticated = false
    authState.user = null as unknown as typeof authState.user
    rerender()
    expect(ws.closed?.code).toBe(1000)
  })
})
