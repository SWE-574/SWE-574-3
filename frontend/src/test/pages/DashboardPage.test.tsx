import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import DashboardPage from '@/pages/DashboardPage'
import system from '@/theme'
import type { Service } from '@/types'

// jsdom 28 in this project ships a broken localStorage; mirror the shim from
// src/test/hooks/useAcquireLocation.test.ts.
let storage: Record<string, string> = {}
beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in storage ? storage[k] : null),
      setItem: (k: string, v: string) => { storage[k] = v },
      removeItem: (k: string) => { delete storage[k] },
      clear: () => { storage = {} },
      key: (i: number) => Object.keys(storage)[i] ?? null,
      get length() { return Object.keys(storage).length },
    },
  })
})

const {
  listPagedMock,
  listMock,
  handshakeListMock,
  getRankingDebugMock,
} = vi.hoisted(() => ({
  listPagedMock: vi.fn(),
  listMock: vi.fn(),
  handshakeListMock: vi.fn(),
  getRankingDebugMock: vi.fn(),
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    listPaged: listPagedMock,
    list: listMock,
    getRankingDebugAvailability: getRankingDebugMock,
  },
}))

vi.mock('@/services/handshakeAPI', () => ({
  handshakeAPI: { list: handshakeListMock },
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: {
      id: 'me',
      first_name: 'Ada',
      last_name: 'L',
      is_onboarded: true,
      skills: [{ id: 'Q1' }],
    },
  }),
}))

vi.mock('@/store/useGeoStore', () => ({
  useGeoStore: Object.assign(
    () => ({ geoLocation: null, setGeoLocation: vi.fn() }),
    { getState: () => ({ setGeoLocation: vi.fn() }) },
  ),
}))

vi.mock('@/components/MapView', () => ({
  MapView: () => <div data-testid="map-view" />,
}))

vi.mock('@/components/dashboard-tour/DashboardTour', () => ({
  default: () => null,
}))

function makeService(id: string, title: string): Service {
  return {
    id,
    title,
    description: 'desc',
    type: 'Offer',
    duration: 1,
    location_type: 'In-Person',
    location_area: 'Istanbul',
    schedule_type: 'One-Time',
    max_participants: 1,
    participant_count: 0,
    status: 'Active',
    is_visible: true,
    is_pinned: false,
    created_at: new Date().toISOString(),
    user: { id: `u-${id}`, first_name: 'A', last_name: 'B', avatar_url: null },
    tags: [],
  } as unknown as Service
}

function renderPage() {
  render(
    <ChakraProvider value={system}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('DashboardPage (Browse)', () => {
  beforeEach(() => {
    listPagedMock.mockReset().mockResolvedValue({
      results: [makeService('s1', 'Guitar lessons'), makeService('s2', 'Bake bread')],
      count: 2,
    })
    listMock.mockReset().mockResolvedValue([])
    handshakeListMock.mockReset().mockResolvedValue([])
    getRankingDebugMock.mockReset().mockResolvedValue({ enabled: false })
  })
  afterEach(() => vi.clearAllMocks())

  it('passes exclude_own=true on every list request', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    const call = listPagedMock.mock.calls[0][0]
    expect(call.exclude_own).toBe(true)
  })

  it('defaults to For-you ranking when the viewer is onboarded with skills', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    const call = listPagedMock.mock.calls[0][0]
    expect(call.sort).toBe('for_you')
  })

  it('switches to sort=latest when Newest is clicked', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Newest'))
    await waitFor(() => {
      const last = listPagedMock.mock.calls.at(-1)?.[0]
      expect(last?.sort).toBe('latest')
    })
  })

  it('switches to no sort param when All is clicked', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    fireEvent.click(screen.getByText('All'))
    await waitFor(() => {
      const last = listPagedMock.mock.calls.at(-1)?.[0]
      expect(last?.sort).toBeUndefined()
    })
  })

  it('does not render the recurrent filter, the Trending button, or a result count', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    expect(screen.queryByText('Recurrent')).not.toBeInTheDocument()
    expect(screen.queryByText('Trending')).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+ services?$/)).not.toBeInTheDocument()
  })

  it('renders the ranking buttons (no Trending; All on the right)', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    for (const label of ['For you', 'Discovery', 'Newest', 'Nearby', 'All']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Trending')).not.toBeInTheDocument()
  })

  it('renders the ranking row below the map element', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument())
    const map = screen.getByTestId('map-view')
    const rankingButton = screen.getByText('Newest')
    const order = map.compareDocumentPosition(rankingButton)
    // The map should appear BEFORE the ranking button in the DOM.
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('uses page_size 15', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    const call = listPagedMock.mock.calls[0][0]
    expect(call.page_size).toBe(15)
  })

  it('renders the numbered pager when totalCount exceeds one page', async () => {
    listPagedMock.mockResolvedValue({
      results: Array.from({ length: 15 }, (_, i) => makeService(`s${i}`, `Service ${i}`)),
      count: 47,
    })
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Page 1')).toBeInTheDocument())
    expect(screen.getByLabelText('Page 4')).toBeInTheDocument()
  })

  it('sends repeated type= keys when multiple chips are active', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    // Both the desktop and mobile rows render in jsdom (no responsive
    // matching), so click the first occurrence of each chip.
    fireEvent.click(screen.getAllByText('Offers')[0])
    fireEvent.click(screen.getAllByText('Needs')[0])
    await waitFor(() => {
      const last = listPagedMock.mock.calls.at(-1)?.[0]
      expect(last?.types).toEqual(expect.arrayContaining(['Offer', 'Need']))
    })
  })
})
