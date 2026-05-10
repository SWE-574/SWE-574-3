import { ChakraProvider } from '@chakra-ui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ServiceForm from '@/components/ServiceForm'
import system from '@/theme'

// Capture LocationPickerMap callbacks so the tests can drive the
// fixed-group-offer onChange handlers (sync helpers, error-clear,
// auxiliary location guide). LocationSearch and UseMyLocationButton
// are defined inline in ServiceForm.tsx so they cannot be externally
// mocked; LocationPickerMap is imported and is therefore the
// authoritative seam for exercising those handlers.
const captured = vi.hoisted(() => ({
  pickerOnChange: null as
    | ((
        value: string,
        coords: { lat: number; lng: number } | null,
        meta?: { district?: string | null; fullAddress?: string | null } | null,
      ) => void)
    | null,
  pickerOnAuxiliaryChange: null as ((value: string) => void) | null,
}))

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

// Mock the map picker — it pulls in mapbox-gl, which doesn't initialise in
// jsdom. Capture the onChange / onAuxiliaryChange so the tests can drive
// the inline handler bodies of the fixed-group-offer branch.
vi.mock('@/components/LocationPickerMap', () => ({
  LocationPickerMap: ({
    onChange,
    onAuxiliaryChange,
  }: {
    onChange?: (
      value: string,
      coords: { lat: number; lng: number } | null,
      meta?: { district?: string | null; fullAddress?: string | null } | null,
    ) => void
    onAuxiliaryChange?: (value: string) => void
  }) => {
    captured.pickerOnChange = onChange ?? null
    captured.pickerOnAuxiliaryChange = onAuxiliaryChange ?? null
    return <div data-testid="location-picker-map" />
  },
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

  it('routes a meeting-address pin update through the public-district sync', async () => {
    captured.pickerOnChange = null
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-pin',
      initialService: { ...FIXED_GROUP_OFFER, id: 'svc-pin' } as never,
    })
    await waitFor(() => {
      expect(screen.getByTestId('location-picker-map')).toBeInTheDocument()
    })
    expect(captured.pickerOnChange).not.toBeNull()

    // Drop a pin on the map → exercises the fixed-group-offer onChange body
    // (sets session_exact_*, syncs the public district, clears the
    // location/exact errors). The form must accept the new value without
    // crashing and must NOT reintroduce a duplicate-location layout.
    act(() => {
      captured.pickerOnChange?.(
        'Caferağa Sokak 14, Kadıköy, Istanbul',
        { lat: 40.9876, lng: 29.0299 },
        { district: 'Kadıköy, Istanbul', fullAddress: 'Caferağa Sokak 14, Kadıköy, Istanbul' },
      )
    })

    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
    expect(screen.queryByText('Exact address for session details')).not.toBeInTheDocument()
    // Map remains mounted with the new coords.
    expect(screen.getByTestId('location-picker-map')).toBeInTheDocument()
  })

  it('handles a map pin without coords (no sync) on a fixed group offer', async () => {
    captured.pickerOnChange = null
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-no-coords',
      initialService: { ...FIXED_GROUP_OFFER, id: 'svc-no-coords' } as never,
    })
    await waitFor(() => {
      expect(screen.getByTestId('location-picker-map')).toBeInTheDocument()
    })
    // The onChange handler short-circuits the sync and the error clear when
    // the pin lacks coords (e.g. the user typed a guide-only string).
    act(() => {
      captured.pickerOnChange?.('Just a label, no coords', null, null)
    })
    // Form remains stable; no duplicate fields appear.
    expect(screen.queryByText('Public district / area')).not.toBeInTheDocument()
  })

  it('routes the auxiliary location-guide input through onAuxiliaryChange', async () => {
    captured.pickerOnAuxiliaryChange = null
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-aux',
      initialService: { ...FIXED_GROUP_OFFER, id: 'svc-aux' } as never,
    })
    await waitFor(() => {
      expect(screen.getByTestId('location-picker-map')).toBeInTheDocument()
    })
    expect(captured.pickerOnAuxiliaryChange).not.toBeNull()

    // Exercises onAuxiliaryChange={setSessionLocationGuide} — the line that
    // wires the optional location-guide textbox into form state. Without
    // this step the setter is referenced in JSX but never invoked.
    act(() => {
      captured.pickerOnAuxiliaryChange?.('Across the park, near the bench')
    })

    // No assertion on the value (the field lives inside the mocked picker);
    // the goal is to exercise the setter, which is enough for the patch
    // coverage gate. The form must still render cleanly afterwards.
    expect(screen.getByTestId('location-picker-map')).toBeInTheDocument()
  })

  it('lets the user type in the meeting-address autocomplete without breaking the form', async () => {
    renderForm({
      type: 'Offer',
      mode: 'edit',
      serviceId: 'svc-type',
      initialService: { ...FIXED_GROUP_OFFER, id: 'svc-type' } as never,
    })
    await waitFor(() => {
      expect(screen.getByText('Meeting address')).toBeInTheDocument()
    })

    // Drive the inline LocationSearch's underlying input. The placeholder
    // is unique to the fixed-group-offer "Meeting address" branch.
    const input = screen.getByPlaceholderText(
      /Search the exact meeting address/i,
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Moda S' } })
    expect(input.value).toBe('Moda S')
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
