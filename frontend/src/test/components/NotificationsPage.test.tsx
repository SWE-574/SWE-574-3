/**
 * Tests for NotificationsPage routing logic (handleClick).
 */
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import system from '@/theme'
import type { Notification } from '@/types'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const markAsReadMock = vi.fn().mockResolvedValue(undefined)
const markAllAsReadMock = vi.fn().mockResolvedValue(undefined)
const fetchNotificationsMock = vi.fn().mockResolvedValue(undefined)

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: 'notif-1',
    type: 'handshake_request',
    title: 'Test Notification',
    message: 'Test message',
    is_read: false,
    related_handshake: null,
    related_service: null,
    related_service_type: null,
    related_report: null,
    related_user: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

async function renderPageWithNotification(notification: Notification) {
  vi.doMock('@/store/useNotificationStore', () => ({
    useNotificationStore: () => ({
      notifications: [notification],
      unreadCount: notification.is_read ? 0 : 1,
      isLoading: false,
      hasMore: false,
      currentPage: 1,
      fetchNotifications: fetchNotificationsMock,
      markAsRead: markAsReadMock,
      markAllAsRead: markAllAsReadMock,
    }),
  }))
  const { default: NotificationsPage } = await import('@/pages/NotificationsPage')
  render(
    <MemoryRouter>
      <ChakraProvider value={system}>
        <NotificationsPage />
      </ChakraProvider>
    </MemoryRouter>
  )
  await waitFor(() => screen.getByText(notification.title))
}

describe('NotificationsPage routing', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    markAsReadMock.mockClear()
    vi.resetModules()
  })

  it('routes user_followed to /public-profile/:related_user', async () => {
    const n = makeNotification({ type: 'user_followed', related_user: 'user-xyz' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/public-profile/user-xyz')
  })

  it('routes new_report to admin reports tab', async () => {
    const n = makeNotification({ type: 'new_report', related_report: 'rpt-2' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/admin?tab=reports&reportId=rpt-2')
  })

  it('routes report_resolved to /profile?tab=reports', async () => {
    const n = makeNotification({ type: 'report_resolved' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/profile?tab=reports')
  })

  it('routes event chat_message to /service-detail/:id?tab=chat', async () => {
    const n = makeNotification({ type: 'chat_message', related_service: 'svc-10', related_service_type: 'Event' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/service-detail/svc-10?tab=chat')
  })

  it('routes non-chat Event notification to /service-detail/:id', async () => {
    const n = makeNotification({ type: 'handshake_request', related_service: 'svc-11', related_service_type: 'Event' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/service-detail/svc-11')
  })

  it('routes group chat_message to /messages?group=:serviceId', async () => {
    const n = makeNotification({ type: 'chat_message', related_service: 'svc-12', related_service_type: 'Offer', related_handshake: null })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/messages?group=svc-12')
  })

  it('routes private chat_message to /messages/:handshakeId', async () => {
    const n = makeNotification({ type: 'chat_message', related_handshake: 'hs-99', related_service: 'svc-13' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/messages/hs-99')
  })

  it('routes service notification to /service-detail/:id', async () => {
    const n = makeNotification({ type: 'handshake_request', related_service: 'svc-14' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/service-detail/svc-14')
  })

  it('falls back to /notifications when no related entity', async () => {
    const n = makeNotification({ type: 'admin_warning' })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(navigateMock).toHaveBeenCalledWith('/notifications')
  })

  it('marks notification as read on click', async () => {
    const n = makeNotification({ type: 'admin_warning', is_read: false })
    await renderPageWithNotification(n)
    await userEvent.click(screen.getByText(n.title))
    expect(markAsReadMock).toHaveBeenCalledWith('notif-1')
  })
})
