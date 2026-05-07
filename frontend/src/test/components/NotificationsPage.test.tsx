import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsPage from '@/pages/NotificationsPage'
import system from '@/theme'

/**
 * State-coverage spec for the notifications listing page. Covers:
 *  - loading: store reports isLoading=true, no rows yet
 *  - empty: store finished loading and returned no notifications
 *  - populated: at least one row renders with the unread badge and bulk
 *    "Mark all as read" affordance
 */

const storeState = vi.hoisted(() => ({
  notifications: [] as Array<{
    id: string
    type: string
    is_read: boolean
    title?: string
    message?: string
    created_at: string
  }>,
  unreadCount: 0,
  isLoading: false,
  hasMore: false,
  currentPage: 1,
  fetchNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
}))

vi.mock('@/store/useNotificationStore', () => ({
  useNotificationStore: () => storeState,
}))

vi.mock('@/components/NotificationItem', () => ({
  NotificationItem: ({ notification }: { notification: { id: string; message?: string } }) => (
    <div data-testid={`notif-${notification.id}`}>{notification.message ?? notification.id}</div>
  ),
}))

function renderPage() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

beforeEach(() => {
  storeState.notifications = []
  storeState.unreadCount = 0
  storeState.isLoading = false
  storeState.hasMore = false
  storeState.currentPage = 1
  storeState.fetchNotifications.mockClear()
  storeState.markAsRead.mockClear()
  storeState.markAllAsRead.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsPage', () => {
  it('renders the empty placeholder when there are no notifications and not loading', () => {
    renderPage()
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
  })

  it('hides the empty placeholder while data is in flight', () => {
    storeState.isLoading = true
    renderPage()
    expect(screen.queryByText(/no notifications yet/i)).not.toBeInTheDocument()
  })

  it('renders one row per notification when populated', () => {
    storeState.notifications = [
      { id: 'n-1', type: 'positive_rep', is_read: false, message: 'New rep', created_at: 't' },
      { id: 'n-2', type: 'handshake_accepted', is_read: true, message: 'Accepted', created_at: 't' },
    ]
    storeState.unreadCount = 1
    renderPage()
    expect(screen.getByTestId('notif-n-1')).toBeInTheDocument()
    expect(screen.getByTestId('notif-n-2')).toBeInTheDocument()
  })

  it('renders the unread badge and Mark-all-as-read button when unreadCount > 0', () => {
    storeState.notifications = [
      { id: 'n-1', type: 'positive_rep', is_read: false, message: 'Unread', created_at: 't' },
    ]
    storeState.unreadCount = 3
    renderPage()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark all as read/i })).toBeInTheDocument()
  })

  it('hides the Mark-all-as-read button when unreadCount is zero', () => {
    storeState.notifications = [
      { id: 'n-1', type: 'positive_rep', is_read: true, message: 'Read', created_at: 't' },
    ]
    storeState.unreadCount = 0
    renderPage()
    expect(screen.queryByRole('button', { name: /mark all as read/i })).not.toBeInTheDocument()
  })

  it('shows the Load more button when hasMore is true and items exist', () => {
    storeState.notifications = [
      { id: 'n-1', type: 'positive_rep', is_read: true, message: 'X', created_at: 't' },
    ]
    storeState.hasMore = true
    renderPage()
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument()
  })

  it('switches the Load more label to Loading… while a page is in flight', () => {
    storeState.notifications = [
      { id: 'n-1', type: 'positive_rep', is_read: true, message: 'X', created_at: 't' },
    ]
    storeState.hasMore = true
    storeState.isLoading = true
    renderPage()
    expect(screen.getByText(/loading…/i)).toBeInTheDocument()
  })
})
