import { describe, expect, it } from 'vitest'
import { canDirectlyAcceptHandshake } from '@/utils/handshakeActions'

describe('canDirectlyAcceptHandshake', () => {
  it('allows direct accept on pending Event handshakes', () => {
    expect(canDirectlyAcceptHandshake('pending', 'Event')).toBe(true)
  })

  it('blocks direct accept on Offer and Need handshakes (propose→approve only)', () => {
    expect(canDirectlyAcceptHandshake('pending', 'Offer')).toBe(false)
    expect(canDirectlyAcceptHandshake('pending', 'Need')).toBe(false)
  })

  it('blocks direct accept once the handshake is no longer pending', () => {
    expect(canDirectlyAcceptHandshake('accepted', 'Event')).toBe(false)
    expect(canDirectlyAcceptHandshake('completed', 'Event')).toBe(false)
    expect(canDirectlyAcceptHandshake('cancelled', 'Event')).toBe(false)
    expect(canDirectlyAcceptHandshake('denied', 'Event')).toBe(false)
  })
})
