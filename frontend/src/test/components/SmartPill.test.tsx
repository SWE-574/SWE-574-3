import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SmartPill from '@/components/SmartPill'
import system from '@/theme'
import type { Service } from '@/types'

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 's1',
    title: 'Pottery class',
    description: '',
    type: 'Offer',
    duration: 1,
    location_type: 'In-Person',
    schedule_type: 'One-Time',
    max_participants: 1,
    participant_count: 0,
    status: 'Active',
    is_visible: true,
    is_pinned: false,
    created_at: new Date().toISOString(),
    user: { id: 'u1', first_name: 'A', last_name: 'B', avatar_url: null },
    tags: [],
    ...overrides,
  } as unknown as Service
}

function renderPill(service: Service) {
  return render(
    <ChakraProvider value={system}>
      <SmartPill service={service} />
    </ChakraProvider>,
  )
}

describe('SmartPill', () => {
  it('renders nothing when no signal applies', () => {
    const { container } = renderPill(makeService())
    expect(container.firstChild).toBeNull()
  })

  it('renders the cold_start flavour for explore-pool members with no for_you signals', () => {
    renderPill(makeService({ explore_pool: 'cold_start' }))
    expect(screen.getByText('Fresh provider')).toBeInTheDocument()
  })

  it('renders the undershown_quality flavour as Hidden gem when no for_you signals', () => {
    renderPill(makeService({ explore_pool: 'undershown_quality' }))
    expect(screen.getByText('Hidden gem')).toBeInTheDocument()
  })

  it('renders the strongest for_you signal when no explore pool', () => {
    renderPill(
      makeService({
        for_you_signals: { tag: 0.6, follow: 0.0, cooccur: 0.0, recency_penalty: 0 },
      }),
    )
    expect(screen.getByText('Matches your interests')).toBeInTheDocument()
  })

  it('for_you signal wins over a cold_start explore pool flag', () => {
    // The earlier order put explore_pool first; on demo data every card
    // qualifies as cold_start, which drowned out cards that DID have a
    // real for_you signal. Reordering makes for_you signals the primary
    // pill so cold_start only appears when nothing else explains the card.
    renderPill(
      makeService({
        explore_pool: 'cold_start',
        for_you_signals: { tag: 0.6, follow: 0.0, cooccur: 0.0, recency_penalty: 0 },
      }),
    )
    expect(screen.getByText('Matches your interests')).toBeInTheDocument()
    expect(screen.queryByText('Fresh provider')).not.toBeInTheDocument()
  })

  it('picks follow over weaker tag overlap (weighted)', () => {
    renderPill(
      makeService({
        for_you_signals: { tag: 0.1, follow: 1.0, cooccur: 0.0, recency_penalty: 0 },
      }),
    )
    expect(screen.getByText('From your network')).toBeInTheDocument()
  })
})
