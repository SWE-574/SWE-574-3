import { ChakraProvider } from '@chakra-ui/react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FollowListModal from '@/components/FollowListModal'
import system from '@/theme'

/**
 * State coverage for the followers / following modal. Three branches:
 *  - loading (users === null)
 *  - empty (users === [])
 *  - populated (users === [{...}])
 * Plus the listKind switch (followers vs following).
 */

const apiMocks = vi.hoisted(() => ({
  getFollowers: vi.fn(),
  getFollowing: vi.fn(),
}))

vi.mock('@/services/userAPI', () => ({
  userAPI: apiMocks,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('@/services/api', () => ({
  getErrorMessage: (_err: unknown, fallback: string) => fallback,
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn((selector: (s: { user: null }) => unknown) =>
    selector({ user: null }),
  ),
}))

function renderModal(props: Partial<Parameters<typeof FollowListModal>[0]> = {}) {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <FollowListModal
          isOpen
          listKind="followers"
          userId="user-1"
          onClose={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

beforeEach(() => {
  apiMocks.getFollowers.mockReset()
  apiMocks.getFollowing.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('FollowListModal', () => {
  it('renders nothing when isOpen is false', () => {
    apiMocks.getFollowers.mockResolvedValue([])
    const { container } = renderModal({ isOpen: false })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when listKind is null', () => {
    apiMocks.getFollowers.mockResolvedValue([])
    const { container } = renderModal({ listKind: null })
    expect(container.firstChild).toBeNull()
  })

  it('shows the loading spinner while followers are in flight', () => {
    let resolve: (value: unknown[]) => void = () => undefined
    apiMocks.getFollowers.mockReturnValue(new Promise<unknown[]>((r) => { resolve = r }))
    renderModal()
    expect(document.querySelector('.chakra-spinner, [class*="Spinner"]')).toBeTruthy()
    resolve([])
  })

  it('shows the empty placeholder when followers resolves to []', async () => {
    apiMocks.getFollowers.mockResolvedValue([])
    renderModal()
    await waitFor(() => {
      expect(screen.getByText(/no users to show/i)).toBeInTheDocument()
    })
  })

  it('renders one row per user when followers resolves with data', async () => {
    apiMocks.getFollowers.mockResolvedValue([
      { id: 'u-1', first_name: 'Elif', last_name: 'Demir', email: 'e@x', avatar_url: null },
      { id: 'u-2', first_name: 'Cem', last_name: 'Yilmaz', email: 'c@x', avatar_url: null },
    ])
    renderModal()
    await waitFor(() => {
      expect(screen.getByText('Elif Demir')).toBeInTheDocument()
      expect(screen.getByText('Cem Yilmaz')).toBeInTheDocument()
    })
  })

  it('routes to userAPI.getFollowing when listKind is "following"', async () => {
    apiMocks.getFollowing.mockResolvedValue([])
    renderModal({ listKind: 'following' })
    await waitFor(() => {
      expect(apiMocks.getFollowing).toHaveBeenCalledWith('user-1', expect.anything())
    })
    expect(apiMocks.getFollowers).not.toHaveBeenCalled()
  })
})
