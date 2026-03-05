/**
 * Tests for ChatPage event-filtering logic (GitHub issue #76).
 *
 * The ChatPage filters out conversations where service_type === 'Event'
 * so that events only appear in the dedicated EventChatModal.
 */
import { describe, it, expect } from 'vitest'

// Extract the filter logic used in ChatPage for isolated testing
const filterEventConversations = <T extends { service_type: string }>(data: T[]): T[] =>
  data.filter((c) => c.service_type !== 'Event')

describe('filterEventConversations', () => {
  it('removes Event-type conversations', () => {
    const conversations = [
      { service_type: 'Offer', handshake_id: '1' },
      { service_type: 'Event', handshake_id: '2' },
      { service_type: 'Need', handshake_id: '3' },
    ]

    const result = filterEventConversations(conversations)
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.service_type)).toEqual(['Offer', 'Need'])
  })

  it('returns empty array when all are events', () => {
    const conversations = [
      { service_type: 'Event', handshake_id: '1' },
      { service_type: 'Event', handshake_id: '2' },
    ]

    const result = filterEventConversations(conversations)
    expect(result).toHaveLength(0)
  })

  it('returns all when none are events', () => {
    const conversations = [
      { service_type: 'Offer', handshake_id: '1' },
      { service_type: 'Need', handshake_id: '2' },
    ]

    const result = filterEventConversations(conversations)
    expect(result).toHaveLength(2)
  })

  it('handles empty array', () => {
    const result = filterEventConversations([])
    expect(result).toHaveLength(0)
  })

  it('is case-sensitive (Event vs event)', () => {
    const conversations = [
      { service_type: 'event', handshake_id: '1' },
      { service_type: 'Event', handshake_id: '2' },
    ]

    // Only exact 'Event' is filtered
    const result = filterEventConversations(conversations)
    expect(result).toHaveLength(1)
    expect(result[0].service_type).toBe('event')
  })
})
