import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PulsePage from '@/pages/PulsePage'
import system from '@/theme'

const {
  listMock,
  feedMock,
  getStatsMock,
  recordVisitMock,
  getSuggestedMock,
  useAuthStoreMock,
  useGeoStoreMock,
  useAcquireLocationMock,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  feedMock: vi.fn(),
  getStatsMock: vi.fn(),
  recordVisitMock: vi.fn(),
  getSuggestedMock: vi.fn(),
  useAuthStoreMock: vi.fn(),
  useGeoStoreMock: vi.fn(),
  useAcquireLocationMock: vi.fn(),
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    list: listMock,
    setSaved: vi.fn(),
    setEndorsed: vi.fn(),
    expressInterest: vi.fn(),
  },
}))

vi.mock('@/services/activityAPI', () => ({
  activityAPI: { feed: feedMock },
}))

vi.mock('@/services/pulseAPI', () => ({
  pulseAPI: {
    getStats: getStatsMock,
    recordVisit: recordVisitMock,
    setDismissed: vi.fn(),
  },
}))

vi.mock('@/services/userAPI', () => ({
  userAPI: {
    getSuggested: getSuggestedMock,
    followUser: vi.fn(),
  },
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: useAuthStoreMock,
}))

vi.mock('@/store/useGeoStore', () => ({
  useGeoStore: useGeoStoreMock,
}))

vi.mock('@/hooks/useAcquireLocation', () => ({
  useAcquireLocation: useAcquireLocationMock,
}))

function setUser(overrides: Record<string, unknown> = {}) {
  const user = {
    id: 'u-1',
    first_name: 'Yusuf',
    is_onboarded: true,
    skills: [{ id: 'Q1', name: 'Chess' }],
    ...overrides,
  }
  useAuthStoreMock.mockImplementation((selector) =>
    selector ? selector({ user }) : user,
  )
}

function setGeo(geo: { latitude: number; longitude: number } | null) {
  useGeoStoreMock.mockImplementation((selector) =>
    selector ? selector({ geoLocation: geo }) : geo,
  )
}

function renderPage() {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <PulsePage />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('PulsePage', () => {
  beforeEach(() => {
    listMock.mockReset()
    feedMock.mockReset().mockResolvedValue([])
    getStatsMock.mockReset().mockResolvedValue({
      new_since_last_visit: 3,
      saved_count: 5,
      follow_handshakes_week: 2,
    })
    recordVisitMock.mockReset().mockResolvedValue({ last_pulse_visit_at: 'now' })
    getSuggestedMock.mockReset().mockResolvedValue({ results: [], next: null, count: 0 })
    useAcquireLocationMock.mockReset()
  })
  afterEach(() => vi.clearAllMocks())

  it('renders the sidebar with title and stat tiles from getStats', async () => {
    setUser()
    setGeo(null)
    listMock.mockResolvedValue([])
    renderPage()
    expect(screen.getAllByText('Pulse').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByText('New picks')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Saved')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText(/handshakes from follows/i)).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('renders the empty-state hero when the user has no skills', async () => {
    setUser({ skills: [], is_onboarded: false })
    setGeo(null)
    listMock.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state-hero')).toBeInTheDocument()
      expect(screen.getByText(/Add your skills/i)).toBeInTheDocument()
    })
  })

  it('filters NEW_NEIGHBOR events out of the Following lane', async () => {
    setUser()
    setGeo(null)
    listMock.mockResolvedValue([])
    feedMock.mockResolvedValue([
      {
        id: 1,
        verb: 'new_neighbor',
        actor: { id: 'u-2', first_name: 'Test', last_name: 'New', avatar_url: null },
        target_user: null,
        service: null,
        created_at: new Date().toISOString(),
        distance_km: null,
        event_capacity_pct: null,
        event_starts_in_seconds: null,
        handshake_duration_hours: null,
        actor_skills: null,
        actor_location: null,
      },
      {
        id: 2,
        verb: 'service_created',
        actor: { id: 'u-3', first_name: 'Cem', last_name: 'Demir', avatar_url: null },
        target_user: null,
        service: { id: 's-1', title: 'Chess Saturdays', type: 'Offer', location_area: null, thumbnail_url: null },
        created_at: new Date().toISOString(),
        distance_km: null,
        event_capacity_pct: null,
        event_starts_in_seconds: null,
        handshake_duration_hours: null,
        actor_skills: null,
        actor_location: null,
      },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Chess Saturdays/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Test New/i)).not.toBeInTheDocument()
  })

  it('renders an Enable location button when the user has no location', async () => {
    setUser()
    setGeo(null)
    listMock.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enable location/i })).toBeInTheDocument()
    })
  })

  it('renders the Events for you lane when events are returned', async () => {
    setUser()
    setGeo(null)
    listMock.mockImplementation((params: { type?: string } | undefined) => {
      if (params?.type === 'Event') {
        return Promise.resolve([
          {
            id: 'evt-1',
            title: 'Saturday Coding Meetup',
            type: 'Event',
            user: { id: 'u-2', first_name: 'Ada', last_name: 'L', avatar_url: null },
            location_area: 'Beşiktaş',
            location_type: 'In-Person',
            duration: 2,
            schedule_type: 'One-Time',
          },
        ])
      }
      return Promise.resolve([])
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Saturday Coding Meetup')).toBeInTheDocument()
    })
    expect(screen.getByTestId('pulse-lane-events-for-you')).toBeInTheDocument()
  })

  it('renders the People to follow lane when suggestions are returned', async () => {
    setUser()
    setGeo(null)
    listMock.mockResolvedValue([])
    getSuggestedMock.mockResolvedValue({
      results: [
        { id: 'u-2', email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace', avatar_url: null },
      ],
      next: null,
      count: 1,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Ada Lovelace/i)).toBeInTheDocument()
    })
    expect(screen.getByTestId('pulse-lane-people-to-follow')).toBeInTheDocument()
  })

  it('records a visit on mount', async () => {
    setUser()
    setGeo(null)
    listMock.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled())
  })
})
