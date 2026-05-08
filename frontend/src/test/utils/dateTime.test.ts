import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, formatDuration, chatTimestamp } from '@/utils/dateTime'

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    expect(formatDate('2024-06-15T10:30:00Z')).toMatch(/Jun 15, 2024/)
  })

  it('returns the original string for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('respects a custom pattern', () => {
    expect(formatDate('2024-01-01T00:00:00Z', 'yyyy')).toBe('2024')
  })
})

describe('formatDateTime', () => {
  it('formats a valid ISO datetime string', () => {
    const result = formatDateTime('2024-06-15T14:30:00Z')
    expect(result).toMatch(/Jun 15, 2024/)
  })

  it('returns the original string for invalid input', () => {
    expect(formatDateTime('bad')).toBe('bad')
  })
})

describe('formatDuration', () => {
  it('formats exactly one hour', () => {
    expect(formatDuration(1)).toBe('1h')
  })

  it('formats sub-hour as minutes', () => {
    expect(formatDuration(0.5)).toBe('30 min')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(1.5)).toBe('1h 30min')
  })

  it('formats multiple full hours', () => {
    expect(formatDuration(3)).toBe('3h')
  })

  it('drops the minute segment when the rounded minutes are zero', () => {
    // 2.001 hours → m = round(0.001 * 60) = 0; the `m > 0` branch must
    // collapse to "2h" rather than emit "2h 0min".
    expect(formatDuration(2.001)).toBe('2h')
  })

  it('rounds minutes correctly', () => {
    expect(formatDuration(0.25)).toBe('15 min')
  })
})

describe('chatTimestamp', () => {
  it('returns HH:mm for a timestamp within 24 hours', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
    expect(chatTimestamp(recent)).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns "EEE HH:mm" between 24 hours and 48 days ago', () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600_000).toISOString()
    expect(chatTimestamp(threeDaysAgo)).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{2}:\d{2}$/)
  })

  it('switches to "EEE HH:mm" at exactly the 24-hour boundary', () => {
    const now = new Date()
    const exactly24hAgo = new Date(now.getTime() - 24 * 3600_000).toISOString()
    expect(chatTimestamp(exactly24hAgo)).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{2}:\d{2}$/)
  })

  it('returns "MMM d" for timestamps older than 48 days', () => {
    const now = new Date()
    const longAgo = new Date(now.getTime() - 60 * 24 * 3600_000).toISOString()
    expect(chatTimestamp(longAgo)).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/)
  })

  it('switches to "MMM d" at exactly the 48-day boundary', () => {
    const now = new Date()
    const exactly48dAgo = new Date(now.getTime() - 48 * 24 * 3600_000).toISOString()
    expect(chatTimestamp(exactly48dAgo)).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/)
  })

  it('returns the original string for invalid input', () => {
    expect(chatTimestamp('nonsense')).toBe('nonsense')
  })
})
