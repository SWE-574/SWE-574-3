import { describe, expect, it } from 'vitest'
import { isNearlyFull } from '@/utils/eventUtils'

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
