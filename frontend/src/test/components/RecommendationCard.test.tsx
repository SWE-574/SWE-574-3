import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RecommendationCard from '@/components/pulse/RecommendationCard'
import system from '@/theme'
import type { Service } from '@/types'

const { setSavedMock, setEndorsedMock, setDismissedMock, expressInterestMock } =
  vi.hoisted(() => ({
    setSavedMock: vi.fn(),
    setEndorsedMock: vi.fn(),
    setDismissedMock: vi.fn(),
    expressInterestMock: vi.fn(),
  }))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    setSaved: setSavedMock,
    setEndorsed: setEndorsedMock,
    expressInterest: expressInterestMock,
  },
}))

vi.mock('@/services/pulseAPI', () => ({
  pulseAPI: {
    setDismissed: setDismissedMock,
  },
}))

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    title: 'Beginner chess coaching',
    type: 'Offer',
    is_saved: false,
    is_endorsed: false,
    is_endorsable: false,
    for_you_signals: { tag: 0.7, follow: 0, cooccur: 0, recency_penalty: 0 },
    user: {
      id: 'u-1',
      first_name: 'Cem',
      last_name: 'Demir',
      avatar_url: null,
    },
    ...overrides,
  } as unknown as Service
}

function renderCard(service: Service, lane: 'hero' | 'for_you' = 'for_you') {
  return render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <RecommendationCard service={service} lane={lane} />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('RecommendationCard', () => {
  beforeEach(() => {
    setSavedMock.mockReset().mockResolvedValue({ is_saved: true })
    setEndorsedMock.mockReset().mockResolvedValue({ is_endorsed: true, endorsement_count: 1 })
    setDismissedMock.mockReset().mockResolvedValue({ is_dismissed: true })
    expressInterestMock.mockReset().mockResolvedValue({ id: 'hs-1', status: 'pending' })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title and the source label', () => {
    renderCard(makeService())
    expect(screen.getByText(/Beginner chess coaching/)).toBeInTheDocument()
    expect(screen.getByText(/For you/i)).toBeInTheDocument()
  })

  it('shows the Endorse button only when is_endorsable is true', () => {
    const { rerender } = renderCard(makeService({ is_endorsable: false }))
    expect(screen.queryByLabelText(/^Endorse$/i)).not.toBeInTheDocument()
    rerender(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <RecommendationCard service={makeService({ is_endorsable: true })} lane="for_you" />
        </MemoryRouter>
      </ChakraProvider>,
    )
    expect(screen.getByLabelText(/^Endorse$/i)).toBeInTheDocument()
  })

  it('toggles save with optimistic update', async () => {
    renderCard(makeService())
    const btn = screen.getByLabelText(/Save for later/i)
    fireEvent.click(btn)
    await waitFor(() => expect(setSavedMock).toHaveBeenCalledWith('svc-1', true))
  })

  it('Why this? toggle renders an explanation when tag signal is non-zero', () => {
    renderCard(makeService())
    // Panel hidden by default.
    expect(screen.queryByTestId('why-this-panel')).not.toBeInTheDocument()
    // Click the info button to open it.
    fireEvent.click(screen.getByLabelText(/Why this recommendation/i))
    const panel = screen.getByTestId('why-this-panel')
    expect(panel).toBeInTheDocument()
    // Panel should contain the matched-interests reason (panel-scoped to
    // disambiguate from the chip label that also says "Matches your interests").
    expect(panel.textContent).toMatch(/Matches your interests/i)
  })

  it('Why this? falls back to a generic reason when no signals fire', () => {
    renderCard(
      makeService({
        for_you_signals: { tag: 0, follow: 0, cooccur: 0, recency_penalty: 0 },
      }),
    )
    fireEvent.click(screen.getByLabelText(/Why this recommendation/i))
    const panel = screen.getByTestId('why-this-panel')
    expect(panel.textContent).toMatch(/trending in your area/i)
  })

  it('dismiss invokes pulseAPI and triggers the onDismissed callback', async () => {
    const onDismissed = vi.fn()
    render(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <RecommendationCard
            service={makeService()}
            lane="for_you"
            onDismissed={onDismissed}
          />
        </MemoryRouter>
      </ChakraProvider>,
    )
    fireEvent.click(screen.getByLabelText(/Not interested/i))
    await waitFor(() => expect(setDismissedMock).toHaveBeenCalledWith('svc-1', true))
    await waitFor(() => expect(onDismissed).toHaveBeenCalledWith('svc-1'))
  })
})
