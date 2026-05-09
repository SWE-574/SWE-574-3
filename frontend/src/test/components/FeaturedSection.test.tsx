import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FeaturedSection from '@/components/FeaturedSection'
import system from '@/theme'
import type { Service } from '@/types'

const { featuredGetMock, listPagedMock } = vi.hoisted(() => ({
  featuredGetMock: vi.fn(),
  listPagedMock: vi.fn(),
}))

vi.mock('@/services/featuredAPI', () => ({
  featuredAPI: { get: featuredGetMock },
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: { listPaged: listPagedMock },
}))

function makeService(id: string, overrides: Partial<Service> = {}): Service {
  return {
    id,
    title: `Service ${id}`,
    description: '',
    type: 'Offer',
    duration: 1,
    location_type: 'In-Person',
    location_area: 'Istanbul',
    schedule_type: 'One-Time',
    max_participants: 4,
    participant_count: 0,
    status: 'Active',
    is_visible: true,
    is_pinned: false,
    created_at: new Date().toISOString(),
    user: { id: `u-${id}`, first_name: 'A', last_name: 'B', avatar_url: null },
    tags: [],
    ...overrides,
  } as unknown as Service
}

function renderSection(
  props: Partial<Parameters<typeof FeaturedSection>[0]> = {},
) {
  render(
    <ChakraProvider value={system}>
      <FeaturedSection
        services={[]}
        userLocation={null}
        isAuthenticated={true}
        {...props}
      />
    </ChakraProvider>,
  )
}

describe('FeaturedSection', () => {
  beforeEach(() => {
    featuredGetMock.mockReset()
    listPagedMock.mockReset()
  })
  afterEach(() => vi.clearAllMocks())

  it('renders the three tabs', async () => {
    featuredGetMock.mockResolvedValue({ trending: [], friends: [], top_providers: [] })
    listPagedMock.mockResolvedValue({ results: [], count: 0 })
    renderSection()
    await waitFor(() => expect(featuredGetMock).toHaveBeenCalled())
    expect(screen.getByText('Friends')).toBeInTheDocument()
    expect(screen.getByText('Nearby')).toBeInTheDocument()
    expect(screen.getByText('Nearly Full')).toBeInTheDocument()
  })

  it('Friends tab populates from /api/featured/ when authenticated', async () => {
    featuredGetMock.mockResolvedValue({
      trending: [],
      friends: [
        {
          id: 'f1', title: 'Pottery class', type: 'Offer',
          user: { id: 'u1', first_name: 'Selin', last_name: 'A', avatar_url: null },
          tags: [], participant_count: 1, max_participants: 4,
          location_area: 'Beyoglu', created_at: new Date().toISOString(),
          friend_count: 2,
        },
      ],
      top_providers: [],
    })
    renderSection()
    await waitFor(() => expect(screen.getByText('Pottery class')).toBeInTheDocument())
    expect(screen.getByText('2 friends')).toBeInTheDocument()
  })

  it('falls back to listPaged hot when anonymous', async () => {
    listPagedMock.mockResolvedValue({
      results: [makeService('s1')],
      count: 1,
    })
    renderSection({ isAuthenticated: false })
    await waitFor(() => expect(listPagedMock).toHaveBeenCalledWith(
      { sort: 'hot', page_size: 8 },
      expect.anything(),
    ))
    expect(featuredGetMock).not.toHaveBeenCalled()
    // Friends tab default-active; the fallback row populates it.
    expect(screen.getByText('Service s1')).toBeInTheDocument()
    expect(screen.getByText('Suggested for you')).toBeInTheDocument()
  })

  it('Nearly Full tab filters the services prop by capacity ratio', async () => {
    featuredGetMock.mockResolvedValue({ trending: [], friends: [], top_providers: [] })
    listPagedMock.mockResolvedValue({ results: [], count: 0 })
    const services = [
      makeService('quiet', { participant_count: 1, max_participants: 4 }),
      makeService('hot', { participant_count: 3, max_participants: 4, title: 'Almost full evening' }),
    ]
    renderSection({ services })
    await waitFor(() => expect(featuredGetMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Nearly Full'))
    await waitFor(() => expect(screen.getByText('Almost full evening')).toBeInTheDocument())
    expect(screen.queryByText('Service quiet')).not.toBeInTheDocument()
    expect(screen.getByText('3/4 spots')).toBeInTheDocument()
  })

  it('Nearby tab requires viewer location and filters by radius', async () => {
    featuredGetMock.mockResolvedValue({ trending: [], friends: [], top_providers: [] })
    listPagedMock.mockResolvedValue({ results: [], count: 0 })
    const close = makeService('close', {
      title: 'Two blocks away', location_lat: 41.001, location_lng: 29.0,
    })
    const far = makeService('far', {
      title: 'Other city', location_lat: 50.0, location_lng: 5.0,
    })
    renderSection({
      services: [close, far],
      userLocation: { lat: 41.0, lng: 29.0 },
      maxNearbyKm: 5,
    })
    await waitFor(() => expect(featuredGetMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Nearby'))
    await waitFor(() => expect(screen.getByText('Two blocks away')).toBeInTheDocument())
    expect(screen.queryByText('Other city')).not.toBeInTheDocument()
  })
})
