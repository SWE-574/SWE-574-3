import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { ChakraProvider } from '@chakra-ui/react'
import NotificationsPage from '@/pages/NotificationsPage'
import system from '@/theme'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/store/useNotificationStore', () => ({
  useNotificationStore: () => ({
    notifications: [
      {
        id: 'n1',
        title: 'New message',
        message: 'Someone sent you a message',
        is_read: false,
        type: 'handshake',
        created_at: new Date().toISOString(),
        related_handshake: 'handshake-uuid-123',
        related_service: null,
      },
    ],
    unreadCount: 1,
    isLoading: false,
    hasMore: false,
    currentPage: 1,
    fetchNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  })
}));

describe('NotificationsPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('navigates to /messages?handshake=id when clicking notification with related_handshake', async () => {
    render(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <NotificationsPage />
        </MemoryRouter>
      </ChakraProvider>,
    )

    const notificationButton = screen.getByRole('button', { name: /New message/i })
    await userEvent.click(notificationButton)

    expect(mockNavigate).toHaveBeenCalledWith('/messages?handshake=handshake-uuid-123')
  })
})
