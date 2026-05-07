import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  eventCountdownSummary,
  formatBanExpiry,
  formatEventDateTime,
  isEventBanned,
  isEventFull,
  isEventPast,
  isFutureEvent,
  isNearlyFull,
  isOrganizerBanned,
  isWithinLockdownWindow,
  spotsLeft,
  timeUntilEvent,
} from '@/utils/eventUtils'

const FIXED_NOW = new Date('2026-05-10T12:00:00Z').getTime()

function inFuture(ms: number): string {
  return new Date(FIXED_NOW + ms).toISOString()
}
function inPast(ms: number): string {
  return new Date(FIXED_NOW - ms).toISOString()
}

describe('isNearlyFull', () => {
  // ── Boundary cases required by FR-RANK-03 acceptance criteria ─────────────

  it('returns false at 74% capacity (just below threshold)', () => {
    expect(isNearlyFull(100, 74)).toBe(false)
  })

  it('returns true at exactly 75% capacity (lower boundary)', () => {
    expect(isNearlyFull(100, 75)).toBe(true)
  })

  it('returns true at 99% capacity (last slot open)', () => {
    expect(isNearlyFull(100, 99)).toBe(true)
  })

  it('returns false at 100% capacity (exactly full)', () => {
    expect(isNearlyFull(100, 100)).toBe(false)
  })

  // ── Small capacity edge cases ──────────────────────────────────────────────

  it('returns true for 3 of 4 slots (75%)', () => {
    expect(isNearlyFull(4, 3)).toBe(true)
  })

  it('returns false for 4 of 4 slots (100%)', () => {
    expect(isNearlyFull(4, 4)).toBe(false)
  })

  it('returns false for 2 of 4 slots (50%)', () => {
    expect(isNearlyFull(4, 2)).toBe(false)
  })

  // ── Guard conditions ───────────────────────────────────────────────────────

  it('returns false when maxParticipants is 0', () => {
    expect(isNearlyFull(0, 0)).toBe(false)
  })

  it('returns false when participantCount is 0', () => {
    expect(isNearlyFull(10, 0)).toBe(false)
  })

  it('returns false for single-participant capacity (max=1, count=0)', () => {
    expect(isNearlyFull(1, 0)).toBe(false)
  })

  it('returns false for single-participant at 100% (max=1, count=1)', () => {
    expect(isNearlyFull(1, 1)).toBe(false)
  })
})


describe('eventUtils — time-dependent helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('isWithinLockdownWindow', () => {
    it('is false 25 hours away', () => {
      expect(isWithinLockdownWindow(inFuture(25 * 3600_000))).toBe(false)
    })
    it('is true exactly at the 24h boundary', () => {
      expect(isWithinLockdownWindow(inFuture(24 * 3600_000))).toBe(true)
    })
    it('is true once the event has started', () => {
      expect(isWithinLockdownWindow(inPast(3600_000))).toBe(true)
    })
    it('is false when scheduledTime is missing', () => {
      expect(isWithinLockdownWindow(null)).toBe(false)
      expect(isWithinLockdownWindow(undefined)).toBe(false)
    })
  })

  describe('isFutureEvent / isEventPast', () => {
    it('isFutureEvent is true for any future timestamp', () => {
      expect(isFutureEvent(inFuture(60_000))).toBe(true)
    })
    it('isFutureEvent is false at the exact current time', () => {
      expect(isFutureEvent(new Date(FIXED_NOW).toISOString())).toBe(false)
    })
    it('isEventPast is true at the current time and false in the future', () => {
      expect(isEventPast(new Date(FIXED_NOW).toISOString())).toBe(true)
      expect(isEventPast(inFuture(60_000))).toBe(false)
    })
    it('both helpers are false for missing input', () => {
      expect(isFutureEvent(null)).toBe(false)
      expect(isEventPast(undefined)).toBe(false)
    })
  })

  describe('spotsLeft', () => {
    it('returns the difference when participants are below cap', () => {
      expect(spotsLeft(10, 4)).toBe(6)
    })
    it('clamps to zero rather than going negative', () => {
      expect(spotsLeft(5, 9)).toBe(0)
    })
    it('returns the full capacity when nobody has joined', () => {
      expect(spotsLeft(8, 0)).toBe(8)
    })
  })

  describe('isEventFull', () => {
    it('is true at the cap', () => {
      expect(isEventFull(4, 4)).toBe(true)
    })
    it('is true when participants exceed the cap', () => {
      expect(isEventFull(4, 5)).toBe(true)
    })
    it('is false below the cap', () => {
      expect(isEventFull(4, 3)).toBe(false)
    })
    it('is false when max_participants is zero', () => {
      expect(isEventFull(0, 5)).toBe(false)
    })
  })

  describe('formatEventDateTime', () => {
    it('returns TBD when there is no scheduled time', () => {
      expect(formatEventDateTime(null)).toBe('TBD')
      expect(formatEventDateTime(undefined)).toBe('TBD')
    })
    it('returns a non-empty string for a real timestamp', () => {
      const formatted = formatEventDateTime(inFuture(2 * 24 * 3600_000))
      expect(formatted.length).toBeGreaterThan(0)
      expect(formatted).not.toBe('TBD')
    })
  })

  describe('timeUntilEvent', () => {
    it('uses minutes when under one hour', () => {
      expect(timeUntilEvent(inFuture(45 * 60_000))).toBe('45m away')
    })
    it('uses hours when under one day', () => {
      expect(timeUntilEvent(inFuture(5 * 3600_000))).toBe('5h away')
    })
    it('uses days otherwise', () => {
      expect(timeUntilEvent(inFuture(3 * 24 * 3600_000))).toBe('3d away')
    })
    it('reports "Event started" once the event has begun', () => {
      expect(timeUntilEvent(inPast(60_000))).toBe('Event started')
    })
    it('returns an empty string when the input is missing', () => {
      expect(timeUntilEvent(null)).toBe('')
    })
  })

  describe('eventCountdownSummary', () => {
    it('falls through to timeUntilEvent for future events', () => {
      expect(eventCountdownSummary(inFuture(2 * 3600_000), 'Active')).toBe('2h away')
    })
    it('reports "Ended" for completed past events', () => {
      expect(eventCountdownSummary(inPast(3600_000), 'Completed')).toBe('Ended')
    })
    it('reports "Cancelled" for cancelled past events', () => {
      expect(eventCountdownSummary(inPast(3600_000), 'Cancelled')).toBe('Cancelled')
    })
    it('reports "RSVPs closed" for past active events', () => {
      expect(eventCountdownSummary(inPast(3600_000), 'Active')).toBe('RSVPs closed')
    })
    it('reports "Event started" when scheduled_time is missing', () => {
      expect(eventCountdownSummary(null, 'Active')).toBe('Event started')
    })
  })

  describe('isEventBanned / isOrganizerBanned', () => {
    it('is true when the ban expires in the future', () => {
      expect(isEventBanned(inFuture(3600_000))).toBe(true)
      expect(isOrganizerBanned(inFuture(3600_000))).toBe(true)
    })
    it('is false when the ban expired in the past', () => {
      expect(isEventBanned(inPast(3600_000))).toBe(false)
      expect(isOrganizerBanned(inPast(3600_000))).toBe(false)
    })
    it('is false for missing input', () => {
      expect(isEventBanned(null)).toBe(false)
      expect(isOrganizerBanned(undefined)).toBe(false)
    })
  })

  describe('formatBanExpiry', () => {
    it('returns an empty string for missing input', () => {
      expect(formatBanExpiry(null)).toBe('')
    })
    it('returns a non-empty formatted string for a real timestamp', () => {
      const formatted = formatBanExpiry(inFuture(7 * 24 * 3600_000))
      expect(formatted.length).toBeGreaterThan(0)
    })
  })
})
