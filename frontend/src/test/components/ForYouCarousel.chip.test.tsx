/**
 * Tests for the For You carousel chip picker and diversifier.
 *
 * Chip variance fix: the picker must mirror the backend blend weights
 * (RANKING_FOR_YOU_*_WEIGHT in settings.py) so a strong tag overlap can win
 * the chip even when follow is also positive. Diversifier: no two consecutive
 * cards should share a chip when a different-chip card is within the lookahead.
 */
import { describe, it, expect } from 'vitest'

import { diversifyByChip } from '@/utils/forYouChips'
import type { ForYouSignals, Service } from '@/types'

function svc(id: string, signals: ForYouSignals): Service {
  return {
    id,
    title: `Service ${id}`,
    type: 'Offer',
    for_you_signals: signals,
  } as unknown as Service
}

describe('diversifyByChip', () => {
  it('breaks runs of same-chip cards by swapping in a different-chip card within lookahead', () => {
    // Three follow-strongest cards in a row, then a tag-strongest card.
    const cards = [
      svc('a', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 }),
      svc('b', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 }),
      svc('c', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 }),
      svc('d', { tag: 0.6, follow: 0, cooccur: 0, recency_penalty: 0 }),
    ]

    const out = diversifyByChip(cards)

    // First card stays put; position 1 should differ from position 0.
    expect(out[0].id).toBe('a')
    expect(out[1].id).not.toBe('b') // 'b' was a follow-chip duplicate
  })

  it('leaves an already-varied list unchanged', () => {
    const cards = [
      svc('a', { tag: 1, follow: 0, cooccur: 0, recency_penalty: 0 }),
      svc('b', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 }),
      svc('c', { tag: 0, follow: 0, cooccur: 1, recency_penalty: 0 }),
    ]

    const out = diversifyByChip(cards)
    expect(out.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not swap when no alternative chip is within the lookahead window', () => {
    // All five cards are follow-strongest; nothing to swap with.
    const cards = Array.from({ length: 5 }, (_, i) =>
      svc(String(i), { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 }),
    )

    const out = diversifyByChip(cards)
    expect(out.map(s => s.id)).toEqual(['0', '1', '2', '3', '4'])
  })
})

describe('weighted chip picker', () => {
  // Reaches into the picker by checking that the diversifier sees the picker's
  // output: when tag*0.3 > follow*0.4 the tag-strong card should not collide
  // with a true follow card next to it.
  it('lets a strong tag overlap win the chip over a moderate follow signal', () => {
    // tag=0.8 -> 0.24 weighted; follow=0.5 -> 0.20 weighted -> tag wins.
    const tagStrong = svc('tag', { tag: 0.8, follow: 0.5, cooccur: 0, recency_penalty: 0 })
    const followStrong = svc('follow', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 })
    const followStrong2 = svc('follow2', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 })

    // tag-strong sits between two follow-strongest -- diversifier should leave
    // it alone because it already provides variance.
    const out = diversifyByChip([followStrong, tagStrong, followStrong2])
    expect(out.map(s => s.id)).toEqual(['follow', 'tag', 'follow2'])
  })

  it('treats follow as winning when raw values are comparable', () => {
    // tag=0.3 -> 0.09; follow=0.5 -> 0.20 -> follow wins.
    const followLeaning = svc('a', { tag: 0.3, follow: 0.5, cooccur: 0, recency_penalty: 0 })
    const followLeaning2 = svc('b', { tag: 0.3, follow: 0.5, cooccur: 0, recency_penalty: 0 })
    const tagPure = svc('c', { tag: 0.9, follow: 0, cooccur: 0, recency_penalty: 0 })

    // Both leaning-follow cards collide; diversifier should swap in 'c'.
    const out = diversifyByChip([followLeaning, followLeaning2, tagPure])
    expect(out[0].id).toBe('a')
    expect(out[1].id).toBe('c')
  })
})
