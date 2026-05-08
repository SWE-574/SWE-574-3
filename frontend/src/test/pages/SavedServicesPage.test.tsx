import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SavedServicesPage from '@/pages/SavedServicesPage'
import system from '@/theme'
import type { Service } from '@/types'

const { listSavedMock, navigateMock, setSavedMock, setEndorsedMock, setDismissedMock, expressInterestMock } =
  vi.hoisted(() => ({
    listSavedMock: vi.fn(),
    navigateMock: vi.fn(),
    setSavedMock: vi.fn(),
    setEndorsedMock: vi.fn(),
    setDismissedMock: vi.fn(),
    expressInterestMock: vi.fn(),
  }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    listSaved: listSavedMock,
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

function makeService(id: string, title: string): Service {
  return {
    id,
    title,
    type: 'Offer',
    is_saved: true,
    user: { id: `u-${id}`, first_name: 'Ada', last_name: 'L', avatar_url: null },
  } as unknown as Service
}

function renderPage() {
  render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <SavedServicesPage />
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('SavedServicesPage', () => {
  beforeEach(() => {
    listSavedMock.mockReset()
    navigateMock.mockReset()
    setDismissedMock.mockReset().mockResolvedValue({ is_dismissed: true })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the heading and description', async () => {
    listSavedMock.mockResolvedValue([])
    renderPage()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(
      screen.getByText(/Tap the bookmark icon on any card to remove it/i),
    ).toBeInTheDocument()
  })

  it('shows the empty state with a Browse services CTA when nothing is saved', async () => {
    listSavedMock.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Nothing saved yet/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/Browse services/i))
    expect(navigateMock).toHaveBeenCalledWith('/dashboard')
  })

  it('shows an error banner when the saved-list request rejects', async () => {
    listSavedMock.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => {
      expect(
        screen.getByText(/Could not load saved services right now/i),
      ).toBeInTheDocument()
    })
  })

  it('renders a card per saved service when the list resolves', async () => {
    listSavedMock.mockResolvedValue([
      makeService('s1', 'Beginner chess coaching'),
      makeService('s2', 'Bake bread together'),
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Beginner chess coaching')).toBeInTheDocument()
    })
    expect(screen.getByText('Bake bread together')).toBeInTheDocument()
  })

  it('removes a card from the list when its dismiss action fires', async () => {
    listSavedMock.mockResolvedValue([
      makeService('s1', 'First saved'),
      makeService('s2', 'Second saved'),
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('First saved')).toBeInTheDocument())
    const dismissButtons = screen.getAllByLabelText(/Not interested/i)
    fireEvent.click(dismissButtons[0])
    await waitFor(() => {
      expect(screen.queryByText('First saved')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Second saved')).toBeInTheDocument()
  })
})
