/**
 * Issue #453a: the notification-response listener stacked on every
 * navigationRef identity change. A single push then fired N navigations.
 *
 * Regression coverage: re-render the host component with a new navigationRef
 * and assert that exactly one listener is alive at any point — the previous
 * subscription must be removed before the new one attaches.
 */

import React from 'react'
import { render, act } from '@testing-library/react-native'
import * as Notifications from 'expo-notifications'

import { usePushNotifications } from '../../hooks/usePushNotifications'

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'tok' }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5 },
}))

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

jest.mock('../../store/useNotificationStore', () => ({
  useNotificationStore: {
    getState: () => ({ fetchUnreadCount: jest.fn() }),
  },
}))

jest.mock('../../store/useToastStore', () => ({
  useToastStore: {
    getState: () => ({ push: jest.fn() }),
  },
}))

jest.mock('../../api/notifications', () => ({
  registerPushToken: jest.fn().mockResolvedValue(undefined),
  deregisterPushToken: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../constants/notificationMappings', () => ({
  navigateToNotificationTarget: jest.fn(),
}))

jest.mock('expo-device', () => ({
  __esModule: true,
  isDevice: false,
}))

function HookHost({
  nav,
}: {
  nav?: { navigate: (screen: string, params?: object) => void }
}) {
  usePushNotifications(nav)
  return null
}

describe('usePushNotifications listener lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('attaches exactly one response listener and tears it down on unmount', () => {
    const remove = jest.fn()
    const addResponse = (
      Notifications.addNotificationResponseReceivedListener as jest.Mock
    ).mockReturnValue({ remove })
    const addReceived = (
      Notifications.addNotificationReceivedListener as jest.Mock
    ).mockReturnValue({ remove: jest.fn() })

    const { unmount } = render(
      <HookHost nav={{ navigate: jest.fn() }} />,
    )

    expect(addResponse).toHaveBeenCalledTimes(1)
    expect(addReceived).toHaveBeenCalledTimes(1)

    unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('keeps exactly one response listener alive when navigationRef identity changes', () => {
    const subscriptions: { remove: jest.Mock; live: boolean }[] = []
    ;(Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      () => {
        const sub: { remove: jest.Mock; live: boolean } = {
          live: true,
          remove: jest.fn(),
        }
        sub.remove.mockImplementation(() => {
          sub.live = false
        })
        subscriptions.push(sub)
        return sub
      },
    )
    ;(Notifications.addNotificationReceivedListener as jest.Mock).mockReturnValue({
      remove: jest.fn(),
    })

    const navA = { navigate: jest.fn() }
    const navB = { navigate: jest.fn() }

    const { rerender, unmount } = render(<HookHost nav={navA} />)

    // Re-render with a different navigationRef identity. Pre-fix this re-ran
    // the response-listener effect (because navigationRef was a dep) and
    // sometimes left the previous subscription alive while the new one
    // attached, so a single push fired N navigations (#453a).
    act(() => {
      rerender(<HookHost nav={navB} />)
    })

    // At most one subscription is live at any point — re-renders that re-fire
    // the effect must call remove() on the previous subscription before
    // attaching a new one. Either one or two subscriptions ever existed
    // (two only if the effect re-fires on a stable dep, which is fine as
    // long as the previous one is dead).
    const live = subscriptions.filter((sub) => sub.live)
    expect(live).toHaveLength(1)

    unmount()
    expect(subscriptions.every((sub) => !sub.live)).toBe(true)
  })

  it('routes a push tap through the latest navigationRef', () => {
    let savedHandler:
      | ((response: Notifications.NotificationResponse) => void)
      | null = null
    ;(Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (handler) => {
        savedHandler = handler
        return { remove: jest.fn() }
      },
    )
    ;(Notifications.addNotificationReceivedListener as jest.Mock).mockReturnValue({
      remove: jest.fn(),
    })

    const navA = { navigate: jest.fn() }
    const navB = { navigate: jest.fn() }
    const { rerender } = render(<HookHost nav={navA} />)

    // Swap the navigationRef. Pre-fix the effect would have torn down navA's
    // listener and attached navB's (so both worked, but the listener stack
    // grew). Post-fix the effect does NOT re-fire — but the handler must
    // still navigate via navB because it reads the holder ref each call.
    act(() => {
      rerender(<HookHost nav={navB} />)
    })

    expect(savedHandler).not.toBeNull()
    if (!savedHandler) return

    const { navigateToNotificationTarget } = jest.requireMock(
      '../../constants/notificationMappings',
    )

    act(() => {
      savedHandler!({
        notification: {
          request: {
            content: {
              data: { type: 'message', notification_id: 'n1' },
            },
            identifier: 'r1',
          },
        },
        actionIdentifier: 'default',
      } as unknown as Notifications.NotificationResponse)
    })

    expect(navigateToNotificationTarget).toHaveBeenCalledTimes(1)
    // Second arg is the navigationRef the handler routed through — must be
    // the latest one (navB), not the captured-at-mount navA.
    expect(navigateToNotificationTarget).toHaveBeenLastCalledWith(
      expect.any(Object),
      navB,
    )
  })
})
