import { ChakraProvider } from '@chakra-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RecommendationShowcasePanel from '@/components/RecommendationShowcasePanel'
import system from '@/theme'
import type {
  RecommendationDebugDiagnosisClass,
  RecommendationDebugResponse,
  Service,
} from '@/types'

const { getRankingDebugMock } = vi.hoisted(() => ({
  getRankingDebugMock: vi.fn(),
}))

vi.mock('@/services/serviceAPI', () => ({
  serviceAPI: {
    getRankingDebug: getRankingDebugMock,
  },
}))

function makeService(id: string): Service {
  return {
    id,
    title: `Service ${id}`,
    description: '',
    type: 'Offer',
    duration: 1,
    location_type: 'In-Person',
    location_area: 'Istanbul',
    schedule_type: 'One-Time',
    max_participants: 1,
    participant_count: 0,
    status: 'Active',
    is_visible: true,
    is_pinned: false,
    created_at: new Date().toISOString(),
    user: { id: `u-${id}`, first_name: 'A', last_name: 'B', avatar_url: null },
    tags: [],
  } as unknown as Service
}

function makePayload(
  diagnosisClass: RecommendationDebugDiagnosisClass,
  overrides: Partial<RecommendationDebugResponse['selected_service']> = {},
): RecommendationDebugResponse {
  const base: RecommendationDebugResponse = {
    active_filter: 'all',
    total_services: 3,
    selected_service: {
      id: 's1',
      title: 'Guitar lessons',
      type: 'Offer',
      owner_name: 'Ada',
      location_type: 'In-Person',
      location_area: 'Istanbul',
      current_position: 14,
      is_pinned: false,
      stored_hot_score: 0.45,
      recomputed_hot_score: 0.45,
      search_score: 0.0,
      social_boost: 0.0,
      weighted_social_boost: 0.0,
      distance_km: 4.2,
      participant_count: 0,
      max_participants: 1,
      factors: {
        kind: 'service',
        positive_count: 2,
        negative_count: 1,
        comment_count: 3,
        hours_exchanged: 5,
        quality: 0.5,
        activity: 0.91,
        capacity_multiplier: 1.0,
        newcomer_boost: 1.0,
        is_newcomer: false,
        final_score: 0.45,
      },
      phase1: {
        active_filter: 'nearby',
        sort_mode: 'composite',
        client_reorder: false,
        distance_km: 4.2,
        search_score: 0,
        is_pinned: false,
        service_type: 'Offer',
        location_type: 'In-Person',
      },
      phase2b: {
        hot_score: 0.45,
        recomputed_hot_score: 0.45,
        proximity_factor: 0.71,
        proximity_half_life_km: 10,
        distance_km: 4.2,
        social_boost: 0,
        weighted_social_boost: 0,
        social_reason: 'none',
        composite_score: 0.32,
      },
      phase3: {
        pool: null,
        exploration_rate: 0.2,
        lifetime_completed_handshakes: 4,
        days_since_last_completed_handshake: null,
        is_stale_recurring: false,
        cold_start_threshold: 5,
        undershown_quality_threshold: 0.4,
        undershown_stale_days: 14,
        injected_on_this_request: false,
        injected_card_id: null,
        injected_slot_index: null,
      },
      sort: {
        sort_key: '(-is_pinned, -composite_score, -created_at)',
        sort_mode: 'composite',
        this_card_key: { is_pinned: false, composite_score: 0.32, created_at: '2026-04-15T00:00:00+00:00' },
        neighbours: [
          { position: 13, id: 's0', title: 'Other A', is_pinned: false, composite_score: 0.34, created_at: '2026-03-30T00:00:00+00:00', is_selected: false },
          { position: 14, id: 's1', title: 'Guitar lessons', is_pinned: false, composite_score: 0.32, created_at: '2026-04-15T00:00:00+00:00', is_selected: true },
          { position: 15, id: 's2', title: 'Other B', is_pinned: false, composite_score: 0.30, created_at: '2026-04-12T00:00:00+00:00', is_selected: false },
        ],
        pinned_count_in_list: 0,
      },
      diagnosis: {
        class: diagnosisClass,
        message: `diagnosis-${diagnosisClass}`,
      },
      breakdown: {
        positive_count: 2,
        negative_count: 1,
        comment_count: 3,
        capacity_ratio: null,
        capacity_boost_applied: false,
        social_reason: 'none',
      },
      formula_lines: [
        'quality (Wilson) = Wilson(2, 4) = 0.5000',
        'activity = log2(2 + 5.0) + 0.5 * log2(2 + 3) = 0.9100',
        'capacity_multiplier = 1.00',
        'newcomer_boost = 1.00',
        'final = quality * activity * capacity * newcomer = 0.45',
      ],
      notes: [],
      ...overrides,
    },
  }
  return base
}

function renderPanel(props: Partial<Parameters<typeof RecommendationShowcasePanel>[0]> = {}) {
  const services = [makeService('s1'), makeService('s2'), makeService('s3')]
  render(
    <ChakraProvider value={system}>
      <RecommendationShowcasePanel
        services={services}
        hoveredServiceId={'s1'}
        activeFilter="all"
        search=""
        {...props}
      />
    </ChakraProvider>,
  )
}

describe('RecommendationShowcasePanel', () => {
  beforeEach(() => {
    getRankingDebugMock.mockReset()
  })
  afterEach(() => vi.clearAllMocks())

  it('renders the diagnosis line for the proximity branch', async () => {
    getRankingDebugMock.mockResolvedValue(makePayload('proximity'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('diagnosis-proximity')).toBeInTheDocument())
    // Visible position is computed from service-list index, not the
    // payload's current_position. Selected is s1 (index 0) of three services.
    expect(screen.getByText(/Position #1 of 3/i)).toBeInTheDocument()
  })

  it('renders the diagnosis line for the trust branch', async () => {
    getRankingDebugMock.mockResolvedValue(makePayload('trust'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('diagnosis-trust')).toBeInTheDocument())
  })

  it('shows the injected pill when phase3 was the source on this request', async () => {
    const payload = makePayload('explore', {
      phase3: {
        pool: 'cold_start',
        exploration_rate: 0.2,
        lifetime_completed_handshakes: 1,
        days_since_last_completed_handshake: null,
        is_stale_recurring: false,
        cold_start_threshold: 5,
        undershown_quality_threshold: 0.4,
        undershown_stale_days: 14,
        injected_on_this_request: true,
        injected_card_id: 's1',
        injected_slot_index: 5,
      },
    })
    getRankingDebugMock.mockResolvedValue(payload)
    renderPanel({ phase3InjectedId: 's1', phase3SlotIndex: 5 })
    await waitFor(() => expect(screen.getByText('diagnosis-explore')).toBeInTheDocument())
    // The Phase 3 accordion is opened by default for the 'explore' diagnosis
    // class; the injection pill is visible inside it.
    expect(screen.getByText(/Injected at slot 5 on this request/i)).toBeInTheDocument()
  })

  it('warns when sort is chronological (composite is informational only)', async () => {
    const payload = makePayload('chronological', {
      phase1: {
        active_filter: 'newest',
        sort_mode: 'chronological',
        client_reorder: true,
        distance_km: null,
        search_score: 0,
        is_pinned: false,
        service_type: 'Offer',
        location_type: 'In-Person',
      },
    })
    getRankingDebugMock.mockResolvedValue(payload)
    renderPanel({ activeFilter: 'newest' })
    await waitFor(() => expect(screen.getByText('diagnosis-chronological')).toBeInTheDocument())
    // Open the Phase 1 accordion to surface the warning banner.
    const phase1Toggle = screen.getByRole('button', { name: /Phase 1 — Filter/i })
    await userEvent.click(phase1Toggle)
    expect(screen.getByText(/sorted by created_at descending/i)).toBeInTheDocument()
  })

  it('forwards phase3 injection params to the API call', async () => {
    getRankingDebugMock.mockResolvedValue(makePayload('neutral'))
    renderPanel({ phase3InjectedId: 'abc-123', phase3SlotIndex: 7 })
    await waitFor(() => expect(getRankingDebugMock).toHaveBeenCalled())
    const args = getRankingDebugMock.mock.calls[0][0]
    expect(args.phase3_injected_id).toBe('abc-123')
    expect(args.phase3_slot_index).toBe(7)
  })
})
