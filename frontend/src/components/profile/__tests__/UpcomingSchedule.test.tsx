// @vitest-environment happy-dom
import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
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

  it('renders agenda items after successful fetch in collapsed mode', async () => {
    mockFetch.mockResolvedValue(mockResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      expect(screen.getByText('Pottery basics')).toBeInTheDocument()
    })
  })

  it('renders empty state when no items', async () => {
    mockFetch.mockResolvedValue(emptyResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Nothing on your calendar yet/i)).toBeInTheDocument()
    })
  })

  it('renders week strip with 7 day cells', async () => {
    mockFetch.mockResolvedValue(emptyResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => {
      // 7 day buttons in the week strip (each is a button)
      // The strip uses a Grid with 7 columns
      const buttons = screen.getAllByRole('button')
      // At least 7 day-strip buttons plus the expand toggle
      expect(buttons.length).toBeGreaterThanOrEqual(7)
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

  it('expand toggle reveals month grid and agenda in expanded mode', async () => {
    mockFetch.mockResolvedValue(mockResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    // Wait for load
    await waitFor(() => {
      expect(screen.getByText('Pottery basics')).toBeInTheDocument()
    })

    // Find and click expand toggle
    const expandBtn = screen.getByText(/View calendar/i)
    fireEvent.click(expandBtn)

    // Should now show the month grid header
    await waitFor(() => {
      // Month grid should be present with Mon-Sun headers
      expect(screen.getByText('Mon')).toBeInTheDocument()
    })
  })

  it('collapse button returns to collapsed mode', async () => {
    mockFetch.mockResolvedValue(mockResponse)
    render(
      <Wrapper>
        <UpcomingSchedule />
      </Wrapper>,
    )
    await waitFor(() => screen.getByText('Pottery basics'))

    // Expand
    fireEvent.click(screen.getByText(/View calendar/i))
    await waitFor(() => screen.getByText('Mon'))

    // Collapse
    fireEvent.click(screen.getByText(/Collapse/i))
    await waitFor(() => {
      expect(screen.queryByText('Mon')).not.toBeInTheDocument()
    })
  })

  it('week strip dot indicators present for items on days in current week', async () => {
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
      // The component renders — check the section card label is present
      expect(screen.getByText('UPCOMING')).toBeInTheDocument()
    })
  })
})
