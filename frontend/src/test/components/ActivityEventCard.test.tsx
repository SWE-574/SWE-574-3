import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import ActivityEventCard from '@/components/pulse/ActivityEventCard'
import type { ActivityEvent } from '@/services/activityAPI'
import system from '@/theme'

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 1,
    verb: 'service_created',
    actor: {
      id: 'u-1', first_name: 'Cem', last_name: 'Demir', avatar_url: null,
    },
    target_user: null,
    service: {
      id: 's-1', title: 'Chess Saturdays', type: 'Offer',
      location_area: null, thumbnail_url: null,
    },
    created_at: new Date(Date.now() - 3600_000).toISOString(),
    distance_km: null,
    event_capacity_pct: null,
    event_starts_in_seconds: null,
    handshake_duration_hours: null,
    actor_skills: null,
    actor_location: null,
    ...overrides,
  }
}

function renderCard(e: ActivityEvent) {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <ActivityEventCard event={e} />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('ActivityEventCard', () => {
  it('renders a service_created story with the actor and service title', () => {
    renderCard(event({ verb: 'service_created' }))
    expect(screen.getByText(/Cem Demir/)).toBeInTheDocument()
    expect(screen.getByText(/Chess Saturdays/)).toBeInTheDocument()
    expect(screen.getByText(/View service/i)).toBeInTheDocument()
  })

  it('renders nothing for new_neighbor (the verb is dropped from Pulse)', () => {
    const { container } = renderCard(event({ verb: 'new_neighbor' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a handshake_completed story with the Try similar action', () => {
    renderCard(
      event({
        verb: 'handshake_completed',
        handshake_duration_hours: 2,
      }),
    )
    expect(screen.getByText(/completed/i)).toBeInTheDocument()
    expect(screen.getByText(/2h exchanged/i)).toBeInTheDocument()
    expect(screen.getByText(/Try similar/i)).toBeInTheDocument()
  })

  it('renders a user_followed story with a profile link', () => {
    renderCard(
      event({
        verb: 'user_followed',
        target_user: {
          id: 'u-2', first_name: 'Selin', last_name: 'Aksoy', avatar_url: null,
        },
        service: null,
      }),
    )
    expect(screen.getByText(/Cem Demir/)).toBeInTheDocument()
    expect(screen.getByText(/Selin Aksoy/)).toBeInTheDocument()
    expect(screen.getByText(/View profile/i)).toBeInTheDocument()
  })
})
