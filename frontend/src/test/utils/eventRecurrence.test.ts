import { describe, expect, it } from 'vitest'
import {
  effectiveScheduleType,
  isEventRecurrent,
  recurrenceIntervalForSubmission,
  recurrenceLabel,
} from '@/utils/eventRecurrence'

describe('isEventRecurrent', () => {
  it('returns true only for recurring Events', () => {
    expect(isEventRecurrent({ type: 'Event', schedule_type: 'Recurrent' })).toBe(true)
  })

  it('returns false for one-time Events', () => {
    expect(isEventRecurrent({ type: 'Event', schedule_type: 'One-Time' })).toBe(false)
  })

  it('returns false for Offers and Needs even when schedule_type says Recurrent', () => {
    expect(isEventRecurrent({ type: 'Offer', schedule_type: 'Recurrent' })).toBe(false)
    expect(isEventRecurrent({ type: 'Need', schedule_type: 'Recurrent' })).toBe(false)
  })

  it('returns false for null / undefined input', () => {
    expect(isEventRecurrent(null)).toBe(false)
    expect(isEventRecurrent(undefined)).toBe(false)
  })
})

describe('recurrenceLabel', () => {
  it('returns "Recurring" only when the schedule_type is Recurrent', () => {
    expect(recurrenceLabel('Recurrent')).toBe('Recurring')
  })

  it('returns "One-time" for One-Time, missing, or unknown values', () => {
    expect(recurrenceLabel('One-Time')).toBe('One-time')
    expect(recurrenceLabel(null)).toBe('One-time')
    expect(recurrenceLabel(undefined)).toBe('One-time')
    expect(recurrenceLabel('something else')).toBe('One-time')
  })
})

describe('effectiveScheduleType', () => {
  it('preserves the schedule_type for Events', () => {
    expect(effectiveScheduleType('Event', 'Recurrent')).toBe('Recurrent')
    expect(effectiveScheduleType('Event', 'One-Time')).toBe('One-Time')
  })

  it('forces One-Time for Offers and Needs regardless of input', () => {
    expect(effectiveScheduleType('Offer', 'Recurrent')).toBe('One-Time')
    expect(effectiveScheduleType('Offer', 'One-Time')).toBe('One-Time')
    expect(effectiveScheduleType('Need', 'Recurrent')).toBe('One-Time')
    expect(effectiveScheduleType('Need', 'One-Time')).toBe('One-Time')
  })
})

describe('recurrenceIntervalForSubmission', () => {
  it('returns the interval only for recurring Events with a positive value', () => {
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', 7)).toBe(7)
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', 30)).toBe(30)
  })

  it('floors fractional values', () => {
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', 7.9)).toBe(7)
  })

  it('returns null for Events that are One-Time', () => {
    expect(recurrenceIntervalForSubmission('Event', 'One-Time', 7)).toBeNull()
  })

  it('returns null for Offers and Needs even when Recurrent + positive', () => {
    expect(recurrenceIntervalForSubmission('Offer', 'Recurrent', 7)).toBeNull()
    expect(recurrenceIntervalForSubmission('Need', 'Recurrent', 7)).toBeNull()
  })

  it('returns null for missing or non-positive intervals', () => {
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', null)).toBeNull()
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', undefined)).toBeNull()
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', 0)).toBeNull()
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', -3)).toBeNull()
  })

  it('returns null for non-finite numbers', () => {
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', Number.NaN)).toBeNull()
    expect(recurrenceIntervalForSubmission('Event', 'Recurrent', Number.POSITIVE_INFINITY)).toBeNull()
  })
})
