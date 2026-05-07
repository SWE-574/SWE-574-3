import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminActivityFeed from '@/components/AdminActivityFeed'
import system from '@/theme'

/**
 * Three-state coverage for the admin audit feed: loading spinner, empty
 * placeholder when the API returns no rows, and the populated render path
 * with one entry per row.
 */

const { getAuditLogsMock } = vi.hoisted(() => ({
  getAuditLogsMock: vi.fn(),
}))

vi.mock('@/services/adminAPI', () => ({
  adminAPI: {
    getAuditLogs: getAuditLogsMock,
  },
}))

function renderFeed() {
  return render(
    <ChakraProvider value={system}>
      <AdminActivityFeed />
    </ChakraProvider>,
  )
}

describe('AdminActivityFeed', () => {
  beforeEach(() => {
    getAuditLogsMock.mockReset()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the spinner while audit logs are in flight', () => {
    let resolve: (value: { results: never[] }) => void = () => undefined
    getAuditLogsMock.mockReturnValue(
      new Promise<{ results: never[] }>((r) => { resolve = r }),
    )
    renderFeed()
    expect(document.querySelector('.chakra-spinner, [class*="Spinner"]')).toBeTruthy()
    resolve({ results: [] })
  })

  it('shows the empty-state placeholder when the API returns zero rows', async () => {
    getAuditLogsMock.mockResolvedValue({ results: [] })
    renderFeed()
    await waitFor(() => {
      expect(screen.getByText(/no recent activity yet/i)).toBeInTheDocument()
    })
  })

  it('renders one row per audit log entry when populated', async () => {
    getAuditLogsMock.mockResolvedValue({
      results: [
        {
          id: 'log-1',
          action_type: 'warn_user',
          target_entity: 'user:elif',
          reason: 'Spam content reported',
          admin_name: 'admin',
          created_at: '2026-05-01T10:00:00Z',
        },
        {
          id: 'log-2',
          action_type: 'ban_user',
          target_entity: 'user:cem',
          reason: 'Repeated violations',
          admin_name: 'admin',
          created_at: '2026-05-02T10:00:00Z',
        },
      ],
    })
    renderFeed()
    await waitFor(() => {
      expect(screen.getByText('Spam content reported')).toBeInTheDocument()
      expect(screen.getByText('Repeated violations')).toBeInTheDocument()
    })
  })

  it('falls back to the empty state when the API rejects', async () => {
    getAuditLogsMock.mockRejectedValue(new Error('500 server error'))
    renderFeed()
    await waitFor(() => {
      expect(screen.getByText(/no recent activity yet/i)).toBeInTheDocument()
    })
  })
})
