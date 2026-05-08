import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PulseSidebar, { type PulseLaneKey } from '@/components/pulse/PulseSidebar'
import system from '@/theme'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const ALL_LANES: PulseLaneKey[] = [
  'for_you', 'events', 'help_others', 'worth_a_look', 'nearby', 'people', 'follows',
]

function renderSidebar(props: Partial<React.ComponentProps<typeof PulseSidebar>> = {}) {
  const merged: React.ComponentProps<typeof PulseSidebar> = {
    stats: null,
    visibleLanes: new Set(ALL_LANES),
    onToggleLane: vi.fn(),
    onOpenMap: vi.fn(),
    ...props,
  }
  render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <PulseSidebar {...merged} />
      </MemoryRouter>
    </ChakraProvider>,
  )
  return merged
}

describe('PulseSidebar', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders zeros for each stat tile when stats prop is null', () => {
    renderSidebar({ stats: null })
    expect(screen.getByText('New picks')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/Handshakes from follows/i)).toBeInTheDocument()
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3)
  })

  it('renders the stat values when stats are provided', () => {
    renderSidebar({
      stats: {
        new_since_last_visit: 7,
        saved_count: 12,
        follow_handshakes_week: 4,
      },
    })
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('invokes onToggleLane with the lane key when a lane toggle is clicked', () => {
    const onToggleLane = vi.fn()
    renderSidebar({ onToggleLane })
    fireEvent.click(screen.getByText('Events for you'))
    expect(onToggleLane).toHaveBeenCalledWith('events')

    fireEvent.click(screen.getByText('People to follow'))
    expect(onToggleLane).toHaveBeenCalledWith('people')

    fireEvent.click(screen.getByText('Nearby'))
    expect(onToggleLane).toHaveBeenCalledWith('nearby')
  })

  it('navigates to /saved when the Saved services shortcut is clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByText(/Saved services/i))
    expect(navigateMock).toHaveBeenCalledWith('/saved')
  })

  it('navigates to the profile-edit deep link when Edit interests is clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByText(/Edit interests/i))
    expect(navigateMock).toHaveBeenCalledWith('/profile?edit=skills')
  })

  it('calls onOpenMap when Browse on map is clicked', () => {
    const onOpenMap = vi.fn()
    renderSidebar({ onOpenMap })
    fireEvent.click(screen.getByText(/Browse on map/i))
    expect(onOpenMap).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('falls back to navigating to /dashboard when onOpenMap is not provided', () => {
    renderSidebar({ onOpenMap: undefined })
    fireEvent.click(screen.getByText(/Browse on map/i))
    expect(navigateMock).toHaveBeenCalledWith('/dashboard')
  })

  it('navigates to the suggested-users page when Find people is clicked', () => {
    renderSidebar()
    fireEvent.click(screen.getByText(/Find people/i))
    expect(navigateMock).toHaveBeenCalledWith('/users/suggested')
  })
})
