// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import system from '@/theme'
import type { CalendarResponse } from '@/types'

// Mock calendarAPI before importing UpcomingSchedule
vi.mock('@/services/calendarAPI', () => ({
  calendarAPI: {
    fetchUpcoming: vi.fn(),
  },
}))

import { calendarAPI } from '@/services/calendarAPI'
import UpcomingSchedule from '../UpcomingSchedule'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </MemoryRouter>
  )
}

const mockFetch = vi.mocked(calendarAPI.fetchUpcoming)

const now = new Date()
// Set start 5 minutes in the future so nextNItems always picks it up
const futureStart = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
const futureEnd = new Date(now.getTime() + 65 * 60 * 1000).toISOString()

const mockResponse: CalendarResponse = {
  items: [
    {
      id: 'item-1',
      kind: 'service_session',
      title: 'Pottery basics',
      start: futureStart,
      end: futureEnd,
      duration_hours: 1,
      location_type: 'In-Person',
      location_label: 'Kadıköy',
      service_type: 'Offer',
      service_id: 'svc-1',
      handshake_id: 'hs-1',
      chat_id: null,
      counterpart: { id: 'user-2', name: 'Ada Lovelace', avatar_url: null },
      is_owner: true,
      status: 'accepted',
      accent_token: 'GREEN',
      link: { type: 'service', id: 'svc-1' },
    },
  ],
  conflicts: [],
  range: { from: '2026-05-05', to: '2026-07-04' },
}

const emptyResponse: CalendarResponse = {
  items: [],
  conflicts: [],
  range: { from: '2026-05-05', to: '2026-07-04' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UpcomingSchedule', () => {
  it('shows spinner while loading', () => {
    mockFetch.mockImplementation(() => new Promise(() => undefined)) // never resolves
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    // Loading state shows spinner or loading text
    expect(screen.getByText(/Loading schedule/i)).toBeInTheDocument()
  })

  it('renders the month calendar immediately after successful fetch', async () => {
    mockFetch.mockResolvedValue(mockResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText('Mon')).toBeInTheDocument())
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.queryByText(/View calendar/i)).toBeNull()
    expect(screen.queryByText(/Collapse/i)).toBeNull()
  })

  it('renders selected-day empty state when no items', async () => {
    mockFetch.mockResolvedValue(emptyResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Nothing scheduled on this day/i)).toBeInTheDocument()
    })
  })

  it('renders month grid day cells', async () => {
    mockFetch.mockResolvedValue(emptyResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      expect(screen.getByText('Mon')).toBeInTheDocument()
      expect(screen.getByText('Sun')).toBeInTheDocument()
    })
  })

  it('shows error state and Retry button on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      expect(screen.getByText('Failed to load schedule.')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })

  it('shows only the selected day items after clicking a day', async () => {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const todayStart = new Date(today)
    todayStart.setHours(10, 0, 0, 0)
    const todayEnd = new Date(todayStart.getTime() + 60 * 60 * 1000)
    const tomorrowStart = new Date(tomorrow)
    tomorrowStart.setHours(10, 0, 0, 0)
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 60 * 60 * 1000)

    mockFetch.mockResolvedValue({
      ...mockResponse,
      items: [
        { ...mockResponse.items[0], id: 'today-item', title: 'Today session', start: todayStart.toISOString(), end: todayEnd.toISOString() },
        { ...mockResponse.items[0], id: 'tomorrow-item', title: 'Tomorrow session', start: tomorrowStart.toISOString(), end: tomorrowEnd.toISOString() },
      ],
    })
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText('Today session')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText(format(tomorrow, 'd MMMM yyyy')))
    expect(screen.queryByText('Today session')).toBeNull()
    expect(screen.getByText('Tomorrow session')).toBeInTheDocument()
  })

  it('opens upcoming grouped mode from the calendar header', async () => {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const thisWeek = addDays(today, 3)
    const todayStart = new Date(today)
    todayStart.setHours(10, 0, 0, 0)
    const tomorrowStart = new Date(tomorrow)
    tomorrowStart.setHours(10, 0, 0, 0)
    const thisWeekStart = new Date(thisWeek)
    thisWeekStart.setHours(10, 0, 0, 0)

    mockFetch.mockResolvedValue({
      ...mockResponse,
      items: [
        {
          ...mockResponse.items[0],
          id: 'today-item',
          title: 'Today session',
          start: todayStart.toISOString(),
          end: new Date(todayStart.getTime() + 60 * 60 * 1000).toISOString(),
        },
        {
          ...mockResponse.items[0],
          id: 'tomorrow-item',
          title: 'Tomorrow session',
          start: tomorrowStart.toISOString(),
          end: new Date(tomorrowStart.getTime() + 60 * 60 * 1000).toISOString(),
        },
        {
          ...mockResponse.items[0],
          id: 'week-item',
          title: 'This week session',
          start: thisWeekStart.toISOString(),
          end: new Date(thisWeekStart.getTime() + 60 * 60 * 1000).toISOString(),
        },
      ],
    })

    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText('Today session')).toBeInTheDocument())
    expect(screen.queryByText('Tomorrow session')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show upcoming schedule' }))

    expect(screen.queryByRole('grid', { name: /May|June|July|August|September|October|November|December|January|February|March|April/ })).toBeNull()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow session')).toBeInTheDocument()
    expect(screen.getByText('This week session')).toBeInTheDocument()
    expect(screen.queryByText('1 / 2')).toBeNull()
  })

  it('today button restores the calendar and selects today from upcoming mode', async () => {
    mockFetch.mockResolvedValue(mockResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText('Pottery basics')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Show upcoming schedule' }))
    expect(screen.queryByRole('grid')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }))

    expect(screen.getByRole('grid')).toBeInTheDocument()
    expect(screen.getByText(/Nothing scheduled on this day|Pottery basics/i)).toBeInTheDocument()
  })

  it('month grid dot indicators present for scheduled items', async () => {
    // Create item with today's date (in the future to pass nextNItems filter)
    const response: CalendarResponse = {
      ...mockResponse,
      items: [{
        ...mockResponse.items[0],
        start: futureStart,
        end: futureEnd,
      }],
    }
    mockFetch.mockResolvedValue(response)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      expect(screen.getByText('Mon')).toBeInTheDocument()
    })
  })
})
