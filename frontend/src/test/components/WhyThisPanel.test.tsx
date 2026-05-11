import { ChakraProvider } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import WhyThisPanel from '@/components/pulse/WhyThisPanel'
import system from '@/theme'
import type { ForYouSignals, Service, Tag } from '@/types'

const { useAuthStoreMock } = vi.hoisted(() => ({
  useAuthStoreMock: vi.fn(),
}))

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: useAuthStoreMock,
}))

function setUserSkills(skills: Tag[]) {
  useAuthStoreMock.mockImplementation((selector?: (s: { user: { skills: Tag[] } | null }) => unknown) => {
    const state = { user: { skills } }
    return selector ? selector(state as never) : state
  })
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    title: 'Test',
    type: 'Offer',
    tags: [],
    ...overrides,
  } as unknown as Service
}

function renderPanel(signals: ForYouSignals | null, service: Service) {
  render(
    <ChakraProvider value={system}>
      <WhyThisPanel signals={signals} service={service} />
    </ChakraProvider>,
  )
}

describe('WhyThisPanel', () => {
  afterEach(() => vi.clearAllMocks())

  it('lists matched user skill names when the tag signal is meaningful', () => {
    const cooking = { id: 'Q1', name: 'Cooking', parent_qid: undefined } as Tag
    const spanish = { id: 'Q2', name: 'Spanish', parent_qid: undefined } as Tag
    setUserSkills([cooking, spanish])
    renderPanel(
      { tag: 0.6, follow: 0, cooccur: 0, recency_penalty: 0 },
      makeService({ tags: [cooking, spanish, { id: 'Q3', name: 'Other', parent_qid: undefined } as Tag] }),
    )
    expect(screen.getByText(/Matches your interests: Cooking, Spanish/i)).toBeInTheDocument()
  })

  it('falls back to a generic interest line when no specific tag overlap is found', () => {
    setUserSkills([{ id: 'QA', name: 'Yoga', parent_qid: undefined } as Tag])
    renderPanel(
      { tag: 0.6, follow: 0, cooccur: 0, recency_penalty: 0 },
      makeService({ tags: [{ id: 'QB', name: 'Climbing', parent_qid: undefined } as Tag] }),
    )
    expect(screen.getByText(/^Matches your interests$/)).toBeInTheDocument()
  })

  it('shows "From people you follow" for a strong follow signal', () => {
    setUserSkills([])
    renderPanel(
      { tag: 0, follow: 0.8, cooccur: 0, recency_penalty: 0 },
      makeService(),
    )
    expect(screen.getByText(/From people you follow/i)).toBeInTheDocument()
  })

  it('shows 2nd-degree network for a weak follow signal', () => {
    setUserSkills([])
    renderPanel(
      { tag: 0, follow: 0.2, cooccur: 0, recency_penalty: 0 },
      makeService(),
    )
    expect(screen.getByText(/From your network \(2nd-degree\)/i)).toBeInTheDocument()
  })

  it('shows the cooccur reason when others have saved similar services', () => {
    setUserSkills([])
    renderPanel(
      { tag: 0, follow: 0, cooccur: 0.5, recency_penalty: 0 },
      makeService(),
    )
    expect(
      screen.getByText(/Popular with people who saved similar services/i),
    ).toBeInTheDocument()
  })

  it('shows the engagement reason when the viewer has saved similar tags', () => {
    setUserSkills([])
    renderPanel(
      { tag: 0, follow: 0, cooccur: 0, recency_penalty: 0, engagement: 0.4 },
      makeService(),
    )
    expect(
      screen.getByText(/Similar to services you've saved/i),
    ).toBeInTheDocument()
  })

  it('labels each explore pool with its specific copy', () => {
    setUserSkills([])
    renderPanel(null, makeService({ explore_pool: 'cold_start' }))
    expect(screen.getByText(/fresh provider just getting started/i)).toBeInTheDocument()
  })

  it('labels the undershown_quality pool as a hidden gem', () => {
    setUserSkills([])
    renderPanel(null, makeService({ explore_pool: 'undershown_quality' }))
    expect(screen.getByText(/hidden gem that deserves more visibility/i)).toBeInTheDocument()
  })

  it('labels the stale_recurring pool as rediscovered', () => {
    setUserSkills([])
    renderPanel(null, makeService({ explore_pool: 'stale_recurring' }))
    expect(screen.getByText(/Rediscovered — popular before/i)).toBeInTheDocument()
  })

  it('falls back to the trending-in-area line when no signal fires', () => {
    setUserSkills([])
    renderPanel(null, makeService())
    expect(screen.getByText(/trending in your area/i)).toBeInTheDocument()
  })
})
