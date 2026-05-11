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

vi.mock('@/services/featuredAPI', () => ({
  featuredAPI: {
    get: vi.fn().mockResolvedValue({ trending: [], friends: [], top_providers: [] }),
    getChips: vi.fn().mockResolvedValue({ chips: [] }),
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

  it('always sorts by hot, sends skip_onboarding=true, no explore_only', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    const call = listPagedMock.mock.calls[0][0]
    expect(call.sort).toBe('hot')
    expect(call.skip_onboarding).toBe(true)
    expect(call.explore_only).toBeUndefined()
  })

  it('does not render the legacy ranking buttons or the Featured tab strip', async () => {
    renderPage()
    await waitFor(() => expect(listPagedMock).toHaveBeenCalled())
    expect(screen.queryByText('Discovery')).not.toBeInTheDocument()
    expect(screen.queryByText('Newest')).not.toBeInTheDocument()
    // FeaturedSection tabs are gone -- chips replaced them.
    expect(screen.queryByText('Friends')).not.toBeInTheDocument()
    expect(screen.queryByText('Nearly Full')).not.toBeInTheDocument()
    expect(screen.queryByText('Recurrent')).not.toBeInTheDocument()
    expect(screen.queryByText('Trending')).not.toBeInTheDocument()
    expect(screen.queryByText('For you')).not.toBeInTheDocument()
  })

  it('renders the TagChipsRow "All" chip below the map', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument())
    // TagChipsRow stays empty until featuredAPI.getChips resolves — wait for the chip.
    const allChip = await screen.findByText('All')
    expect(allChip).toBeInTheDocument()
    const map = screen.getByTestId('map-view')
    const order = map.compareDocumentPosition(allChip)
    // Map appears BEFORE the chips strip in DOM order.
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

  // ── Map collapse toggle (§9 Win 2) ────────────────────────────────────────

  it('renders the map by default and exposes a Hide map button', async () => {
    storage = {}
    renderPage()
    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument())
    expect(screen.getByTestId('dashboard-map-hide')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-map-show')).not.toBeInTheDocument()
  })

  it('Hide map collapses the panel and persists the choice in localStorage', async () => {
    storage = {}
    renderPage()
    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('dashboard-map-hide'))

    await waitFor(() => expect(screen.queryByTestId('map-view')).not.toBeInTheDocument())
    expect(screen.getByTestId('dashboard-map-show')).toBeInTheDocument()
    expect(storage.dashboardMapCollapsed).toBe('true')
  })

  it('initialises collapsed when localStorage says so, and Show map restores it', async () => {
    storage = { dashboardMapCollapsed: 'true' }
    renderPage()

    // Collapsed banner is rendered first; map is not in the tree.
    await waitFor(() => expect(screen.getByTestId('dashboard-map-show')).toBeInTheDocument())
    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('dashboard-map-show'))

    await waitFor(() => expect(screen.getByTestId('map-view')).toBeInTheDocument())
    expect(storage.dashboardMapCollapsed).toBe('false')
  })

  // ── Chip diversification on the live grid ─────────────────────────────────
  // The `diversifyByChip` helper has its own unit suite, but it had no
  // production caller — the Browse grid rendered in raw backend order so
  // viewers with many connections saw long runs of "From your network"
  // pills. Pin the wiring here so a future regression that drops the call
  // fails the suite instead of shipping silently.

  it('rotates chip-clustered cards out of consecutive positions on the live grid', async () => {
    // Three follow-strong cards then a tag-strong card. Without
    // diversification the grid renders s1, s2, s3, s4 in that order and
    // the first three cards all show "From your network". With the wired
    // helper, s4 (tag) gets swapped in to break the run.
    const followStrong = (id: string, title: string): Service => ({
      ...makeService(id, title),
      for_you_signals: { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 },
    } as Service)
    const tagStrong = (id: string, title: string): Service => ({
      ...makeService(id, title),
      for_you_signals: { tag: 0.6, follow: 0, cooccur: 0, recency_penalty: 0 },
    } as Service)

    listPagedMock.mockResolvedValue({
      results: [
        followStrong('f1', 'Follow card 1'),
        followStrong('f2', 'Follow card 2'),
        followStrong('f3', 'Follow card 3'),
        tagStrong('t1', 'Tag card 1'),
      ],
      count: 4,
    })

    renderPage()

    // Wait for the cards to render and read their DOM order. The grid
    // renders services in array order, so without diversification the
    // tag card sits last — `f1, f2, f3, t1`. After the wired pass, the
    // helper finds the tag card within the lookahead window and swaps
    // it into position 1, breaking the consecutive-follow run.
    await waitFor(() => expect(screen.getByText('Follow card 1')).toBeInTheDocument())

    const titles = ['Follow card 1', 'Follow card 2', 'Follow card 3', 'Tag card 1']
    const elements = titles.map((t) => screen.getByText(t))
    // Sort the elements by document order. `a.compareDocumentPosition(b) &
    // DOCUMENT_POSITION_FOLLOWING` is set when **b** is following **a** in
    // the document — i.e. **a** is the earlier element and should sort
    // first, so the comparator returns -1 when that bit is set.
    const ordered = [...elements].sort((a, b) => {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })
    const orderedTitles = ordered.map((el) => el.textContent)
    // The pre-fix order was strictly `Follow card 1/2/3, Tag card 1`.
    // Post-fix the tag card must NOT be last — the diversify pass lifts
    // it forward to break the cluster.
    expect(orderedTitles[3]).not.toBe('Tag card 1')
    expect(orderedTitles).toContain('Tag card 1')
  })

  it('does not let the diversifier pull a denied/cancelled card above active rows', async () => {
    // Inactive (denied/cancelled) cards are sorted to the bottom by the
    // useMemo. Without partitioning the diversifier's swap window can
    // reach across that boundary and pull a denied card forward to break
    // a same-chip run, undoing the inactive-bottom intent.
    const followStrong = (id: string, title: string): Service => ({
      ...makeService(id, title),
      for_you_signals: { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 },
    } as Service)
    const tagStrongDenied = (id: string, title: string): Service => ({
      ...makeService(id, title),
      for_you_signals: { tag: 0.6, follow: 0, cooccur: 0, recency_penalty: 0 },
    } as Service)

    listPagedMock.mockResolvedValue({
      results: [
        followStrong('f1', 'Active follow 1'),
        followStrong('f2', 'Active follow 2'),
        followStrong('f3', 'Active follow 3'),
        followStrong('f4', 'Active follow 4'),
        tagStrongDenied('td', 'Denied tag card'),
      ],
      count: 5,
    })
    handshakeListMock.mockResolvedValue([
      { id: 'h-td', service: 'td', requester: 'me', status: 'denied' },
    ])

    renderPage()

    await waitFor(() => expect(screen.getByText('Active follow 1')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Denied tag card')).toBeInTheDocument())

    const titles = [
      'Active follow 1', 'Active follow 2', 'Active follow 3', 'Active follow 4',
      'Denied tag card',
    ]
    const elements = titles.map((t) => screen.getByText(t))
    const ordered = [...elements].sort((a, b) => {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    })
    const orderedTitles = ordered.map((el) => el.textContent)

    // The denied card must stay at the bottom — the diversifier should
    // operate on the active partition only and leave the inactive tail
    // untouched.
    expect(orderedTitles[orderedTitles.length - 1]).toBe('Denied tag card')
  })
})
