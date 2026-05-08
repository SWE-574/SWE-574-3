import { describe, expect, it } from 'vitest'
import {
  maxParticipantsFloor,
  validateMaxParticipantsValue,
} from '@/utils/serviceFormCapacity'

describe('maxParticipantsFloor', () => {
  it('returns 1 in create mode regardless of participant count', () => {
    expect(maxParticipantsFloor(false, 0)).toBe(1)
    expect(maxParticipantsFloor(false, 4)).toBe(1)
    expect(maxParticipantsFloor(false, undefined)).toBe(1)
  })

  it('returns the current participant count in edit mode', () => {
    expect(maxParticipantsFloor(true, 3)).toBe(3)
    expect(maxParticipantsFloor(true, 7)).toBe(7)
  })

  it('clamps to 1 in edit mode when nothing is accepted yet', () => {
    expect(maxParticipantsFloor(true, 0)).toBe(1)
    expect(maxParticipantsFloor(true, null)).toBe(1)
    expect(maxParticipantsFloor(true, undefined)).toBe(1)
  })
})

describe('validateMaxParticipantsValue', () => {
  it('always passes in create mode', () => {
    expect(validateMaxParticipantsValue(1, false, 1)).toBe(true)
    expect(validateMaxParticipantsValue(0, false, 5)).toBe(true)
  })

  it('passes when value is at or above the floor in edit mode', () => {
    expect(validateMaxParticipantsValue(3, true, 3)).toBe(true)
    expect(validateMaxParticipantsValue(8, true, 3)).toBe(true)
    expect(validateMaxParticipantsValue('5', true, 3)).toBe(true)
  })

  it('returns the floor message when below it', () => {
    const result = validateMaxParticipantsValue(1, true, 3)
    expect(typeof result).toBe('string')
    expect(result).toContain('3')
    expect(result).toContain('Cannot lower')
  })
})
