import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { MainSidebar } from '@/components/MainSidebar'
import system from '@/theme'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: {
      id: 'me',
      first_name: 'Ada',
      last_name: 'Lovelace',
      timebank_balance: 4,
      achievements: [],
      badges: [],
    },
  }),
}))

function buildListings(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i + 1}`,
    title: `Listing ${i + 1}`,
    type: 'Offer' as const,
  }))
}

function renderSidebar(listingCount: number) {
  render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <MainSidebar myServices={buildListings(listingCount)} />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('MainSidebar — My Listings overflow', () => {
  beforeEach(() => navigateMock.mockReset())

  it('renders all listings without an overflow link when there are 4 or fewer', () => {
    renderSidebar(4)
    expect(screen.getByText('Listing 1')).toBeInTheDocument()
    expect(screen.getByText('Listing 4')).toBeInTheDocument()
    expect(screen.queryByTestId('my-listings-show-all')).not.toBeInTheDocument()
  })

  it('shows "+N more" overflow link when there are more than 4 listings', () => {
    // 6 listings → 4 visible + "+2 more". The overflow control gives the
    // user a way to reach the rest without redesigning the sidebar to
    // scroll a long list inline.
    renderSidebar(6)
    const overflow = screen.getByTestId('my-listings-show-all')
    expect(overflow).toBeInTheDocument()
    expect(overflow).toHaveTextContent('+2 more')
  })

  it('renders the overflow link as a button with an aria-label', () => {
    renderSidebar(6)
    const overflow = screen.getByTestId('my-listings-show-all')
    // The element is rendered via Chakra `as="button"`; the resulting
    // DOM is a real <button> so screen readers announce it correctly.
    expect(overflow.tagName.toLowerCase()).toBe('button')
    expect(overflow).toHaveAttribute('aria-label', 'View all my listings')
  })

  it('clicking the overflow link routes to /profile?tab=offers', () => {
    // Profile page reads ?tab= via UserProfile.tsx:152-186; landing on
    // the offers tab gives the user the densest of the per-type tabs as
    // a starting point and they can switch to needs/events from there.
    renderSidebar(7)
    fireEvent.click(screen.getByTestId('my-listings-show-all'))
    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith('/profile?tab=offers')
  })
})
