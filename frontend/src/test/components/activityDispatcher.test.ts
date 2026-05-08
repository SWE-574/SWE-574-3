/**
 * Tests for the activity feed filter logic and verb-to-card dispatcher (#493).
 *
 * applyFilter handles client-side chip filtering on top of the same fetch.
 * The dispatcher returns a different React element type per verb so the
 * feed reads with rhythm rather than as identical rows.
 */
import { describe, it, expect } from 'vitest'

import { applyFilter } from '@/components/activity/applyFilter'
import type { ActivityEvent, ActivityVerb } from '@/services/activityAPI'

function ev(
  id: number,
  verb: ActivityVerb,
  overrides: Partial<ActivityEvent> = {},
): ActivityEvent {
  return {
    id,
    verb,
    actor: { id: `actor-${id}`, first_name: 'A', last_name: 'B', avatar_url: null },
    target_user: null,
    service: null,
    created_at: new Date().toISOString(),
    distance_km: null,
    event_capacity_pct: null,
    event_starts_in_seconds: null,
    handshake_duration_hours: null,
    actor_skills: null,
    actor_location: null,
    ...overrides,
  }
}

describe('applyFilter', () => {
  it('all returns the input unchanged', () => {
    const events = [ev(1, 'service_created'), ev(2, 'user_followed')]
    expect(applyFilter(events, 'all', new Set())).toBe(events)
  })

  it('nearby keeps only events with a distance_km', () => {
    const events = [
      ev(1, 'service_created', { distance_km: 0.5 }),
      ev(2, 'service_created', { distance_km: null }),
      ev(3, 'handshake_accepted', { distance_km: 2.1 }),
    ]
    const out = applyFilter(events, 'nearby', new Set())
    expect(out.map(e => e.id)).toEqual([1, 3])
  })

  it('following keeps only events whose actor is in the followed set', () => {
    const followed = new Set(['actor-1', 'actor-3'])
    const events = [
      ev(1, 'service_created'),
      ev(2, 'service_created'),
      ev(3, 'service_created'),
    ]
    const out = applyFilter(events, 'following', followed)
    expect(out.map(e => e.id)).toEqual([1, 3])
  })

  it('recent drops events older than 24h', () => {
    const now = Date.now()
    const events = [
      ev(1, 'service_created', { created_at: new Date(now - 1_000).toISOString() }),
      ev(2, 'service_created', { created_at: new Date(now - 25 * 3_600_000).toISOString() }),
      ev(3, 'service_created', { created_at: new Date(now - 12 * 3_600_000).toISOString() }),
    ]
    const out = applyFilter(events, 'recent', new Set())
    expect(out.map(e => e.id)).toEqual([1, 3])
  })
})
