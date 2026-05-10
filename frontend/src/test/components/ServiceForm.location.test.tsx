import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ServiceForm from '@/components/ServiceForm'
import system from '@/theme'

/**
 * Issue #506 — the group offer create form previously rendered two
 * location inputs (a public district picker and an exact address picker)
 * for fixed in-person group offers. These tests pin the canonical layout
 * so the duplicate cannot regress, and exercise enough of the variant
 * branches (Offer / Need / Event, In-Person / Online, fixed / open
 * scheduling) to keep the file's coverage signal honest.
 */

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      user: { id: 'u1', first_name: 'Test', last_name: 'User' },
      refreshUser: vi.fn(),
      updateUserOptimistically: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

// Mock the map picker — it pulls in mapbox-gl, which doesn't initialise in jsdom.
vi.mock('@/components/LocationPickerMap', () => ({
  LocationPickerMap: () => <div data-testid="location-picker-map" />,
}))

// Mock the wikidata autocomplete; we don't exercise it here.
vi.mock('@/components/WikidataTagAutocomplete', () => ({
  default: () => <div data-testid="wikidata-tag-autocomplete" />,
}))

function renderForm(props: Parameters<typeof ServiceForm>[0]) {
  return render(
    <MemoryRouter>
      <ChakraProvider value={system}>
        <ServiceForm {...props} />
      </ChakraProvider>
    </MemoryRouter>,
  )
}

function countLocationSearchInputs(): number {
  // LocationSearch renders an <input> with the address-search placeholder.
  const inputs = Array.from(document.querySelectorAll('input'))
  return inputs.filter((el) => {
    const placeholder = el.getAttribute('placeholder') ?? ''
    return /address|district|meeting address|moda sahili/i.test(placeholder)
  }).length
}

const FIXED_GROUP_OFFER = {
  id: 'svc-1',
  title: 'Group walking tour',
  description: 'Existing fixed group offer for tests',
  type: 'Offer',
  duration: 2,
  location_type: 'In-Person',
  location_area: 'Kadıköy, Istanbul',
  location_lat: 40.9923,
  location_lng: 29.0244,
  schedule_type: 'One-Time',
  max_participants: 3,
  participant_count: 0,
  scheduled_time: '2099-01-01T10:00:00Z',
  session_exact_location: 'Moda Sahili 12, Kadıköy',
  session_exact_location_lat: 40.9853,
  session_exact_location_lng: 29.0274,
  status: 'Active',
  is_visible: true,
  is_pinned: false,
  created_at: new Date().toISOString(),
  user: { id: 'u1', first_name: 'A', last_name: 'B' },
  tags: [],
} as const

describe('ServiceForm — group offer location inputs (#506)', () => {
  it('renders a single Address picker for a regular (non-group) Offer', () => {
    renderForm({ type: 'Offer' })
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()
    expect(countLocationSearchInputs()).toBe(1)
  })

  it('renders a single Meeting address picker for a fixed in-person group offer', async () => {
    // Pre-seed an existing fixed group offer to land in edit mode with
    // isFixedGroupOffer=true on first render. This avoids depending on
    // user-event behaviour to bump max_participants > 1.
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-1',
      initialService: { ...FIXED_GROUP_OFFER } as never,
    })

    // Single canonical location label, no duplicate from the old two-picker layout.
    await waitFor(() => {
      expect(screen.getByText('Meeting address')).toBeInTheDocument()
    })
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()

    // Map picker still mounts (we keep the in-person fine-tuning UX).
    expect(screen.getByTestId('location-picker-map')).toBeInTheDocument()

    // Exactly one address-search input — no duplicate location field.
    expect(countLocationSearchInputs()).toBe(1)
  })

  it('renders only the meeting-link input (no map / address picker) for an online fixed group offer', async () => {
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-2',
      initialService: {
        ...FIXED_GROUP_OFFER,
        id: 'svc-2',
        location_type: 'Online',
        location_area: 'https://meet.example.com/test',
        session_exact_location: undefined,
        session_exact_location_lat: undefined,
        session_exact_location_lng: undefined,
      } as never,
    })

    await waitFor(() => {
      expect(screen.getByText(/meeting link or platform/i)).toBeInTheDocument()
    })
    // Physical-location helpers must not render when the offer is online.
    expect(screen.queryByText('Meeting address')).not.toBeInTheDocument()
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()
    expect(screen.queryByTestId('location-picker-map')).not.toBeInTheDocument()
  })

  it('renders the Need form with a single Address picker', () => {
    renderForm({ type: 'Need' })
    // Need form has its own labels but the location section follows the
    // same single-Address pattern as a regular Offer.
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()
  })

  it('renders the Event form without the duplicate-location layout', () => {
    renderForm({ type: 'Event' })
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()
  })

  it('renders Recurrent group offer without the duplicate-location layout', async () => {
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-rec',
      initialService: {
        ...FIXED_GROUP_OFFER,
        id: 'svc-rec',
        schedule_type: 'Recurrent',
        scheduled_time: undefined,
        // Recurrent offers don't carry session_exact_location.
        session_exact_location: undefined,
        session_exact_location_lat: undefined,
        session_exact_location_lng: undefined,
      } as never,
    })

    await waitFor(() => {
      expect(screen.getByText('Address')).toBeInTheDocument()
    })
    // Recurrent group offers do not get the fixed-group "Meeting address"
    // layout; they fall back to the single Address picker.
    expect(screen.queryByText('Meeting address')).not.toBeInTheDocument()
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()
  })
})
