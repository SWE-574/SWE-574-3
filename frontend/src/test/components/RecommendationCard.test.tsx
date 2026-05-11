import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RecommendationCard from '@/components/pulse/RecommendationCard'
import system from '@/theme'
import type { Service } from '@/types'

const { setSavedMock, expressInterestMock } =
  vi.hoisted(() => ({
    setSavedMock: vi.fn(),
    expressInterestMock: vi.fn(),
  }))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    setSaved: setSavedMock,
    expressInterest: expressInterestMock,
  },
}))

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    title: 'Beginner chess coaching',
    type: 'Offer',
    is_saved: false,
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

  it('unsave triggers the onRemoved callback so the parent list can drop the card', async () => {
    const onRemoved = vi.fn()
    setSavedMock.mockReset().mockResolvedValue({ is_saved: false })
    render(
      <ChakraProvider value={system}>
        <MemoryRouter>
          <RecommendationCard
            service={makeService({ is_saved: true })}
            lane="for_you"
            onRemoved={onRemoved}
          />
        </MemoryRouter>
      </ChakraProvider>,
    )
    // The save button is labelled "Unsave" while is_saved=true.
    fireEvent.click(screen.getByLabelText(/Unsave/i))
    await waitFor(() => expect(setSavedMock).toHaveBeenCalledWith('svc-1', false))
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('svc-1'))
  })
})
