import { ChakraProvider } from '@chakra-ui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import BigMapModal from '@/components/BigMapModal'
import system from '@/theme'
import type { Service } from '@/types'

const { navigateMock, mapViewMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  mapViewMock: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/components/MapView', () => ({
  MapView: (props: { onServiceClick?: (id: string) => void }) => {
    mapViewMock(props)
    return (
      <button
        type="button"
        data-testid="map-view-stub"
        onClick={() => props.onServiceClick?.('svc-42')}
      >
        map
      </button>
    )
  },
}))

function makeService(id: string): Service {
  return {
    id,
    title: `Service ${id}`,
    type: 'Offer',
    user: { id: 'u-1', first_name: 'Ada', last_name: 'L', avatar_url: null },
  } as unknown as Service
}

function renderModal(props: Partial<React.ComponentProps<typeof BigMapModal>> = {}) {
  const merged: React.ComponentProps<typeof BigMapModal> = {
    isOpen: true,
    onClose: vi.fn(),
    services: [makeService('svc-1'), makeService('svc-2')],
    loading: false,
    userLocation: null,
    ...props,
  }
  render(
    <ChakraProvider value={system}>
      <MemoryRouter>
        <BigMapModal {...merged} />
      </MemoryRouter>
    </ChakraProvider>,
  )
  return merged
}

describe('BigMapModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByText(/Browse on map/i)).not.toBeInTheDocument()
  })

  it('renders the header, pin count, and map when open', () => {
    renderModal()
    expect(screen.getByText(/Browse on map/i)).toBeInTheDocument()
    expect(screen.getByText(/2 services on the map/i)).toBeInTheDocument()
    expect(screen.getByTestId('map-view-stub')).toBeInTheDocument()
  })

  it('uses the singular form when only one service is on the map', () => {
    renderModal({ services: [makeService('only')] })
    expect(screen.getByText(/1 service on the map/i)).toBeInTheDocument()
  })

  it('shows a loading indicator instead of the map while loading', () => {
    renderModal({ loading: true })
    expect(screen.getByText(/Loading services/i)).toBeInTheDocument()
    expect(screen.queryByTestId('map-view-stub')).not.toBeInTheDocument()
  })

  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByLabelText(/Close map/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes the modal and navigates to the service detail when a pin is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByTestId('map-view-stub'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith('/service-detail/svc-42')
  })
})
