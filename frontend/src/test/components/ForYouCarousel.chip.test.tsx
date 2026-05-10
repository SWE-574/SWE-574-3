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

// Cards without for_you_signals still render distinct pills in SmartPill
// based on explore_pool / is_newcomer_owner / capacity. The diversifier
// must see the same identities or runs of e.g. "Fresh provider" survive.
function exploreSvc(id: string, pool: NonNullable<Service['explore_pool']>): Service {
  return {
    id,
    title: `Service ${id}`,
    type: 'Offer',
    explore_pool: pool,
  } as unknown as Service
}

function newcomerSvc(id: string): Service {
  return {
    id,
    title: `Service ${id}`,
    type: 'Offer',
    is_newcomer_owner: true,
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

  it('breaks runs of same-explore_pool cards even when for_you_signals are absent', () => {
    // Demo data: most cards are cold_start with no for_you_signals. Before
    // the fix, every such card mapped to 'default' for the diversifier,
    // so clusters of "Fresh provider" survived untouched. With pillIdentity
    // mirroring SmartPill, cold_start ≠ undershown_quality and the
    // duplicate at index 1 should be swapped with the differing card
    // at index 3.
    const cards = [
      exploreSvc('a', 'cold_start'),
      exploreSvc('b', 'cold_start'),
      exploreSvc('c', 'cold_start'),
      exploreSvc('d', 'undershown_quality'),
    ]

    const out = diversifyByChip(cards)
    expect(out[0].id).toBe('a')
    expect(out[1].id).not.toBe('b')
  })

  it('treats newcomer and explore_pool as distinct identities', () => {
    // SmartPill renders "Rising newcomer" for is_newcomer_owner and
    // "Fresh provider" for cold_start. The diversifier must see them as
    // different so a newcomer adjacent to two cold_starts breaks the run.
    const cards = [
      exploreSvc('a', 'cold_start'),
      exploreSvc('b', 'cold_start'),
      newcomerSvc('c'),
    ]

    const out = diversifyByChip(cards)
    expect(out[0].id).toBe('a')
    expect(out[1].id).toBe('c')
  })

  it('still leaves runs alone when every card shares the same pill identity', () => {
    // Five cold_start cards in a row; nothing to swap with — diversifier
    // must not invent variance that does not exist in the source.
    const cards = Array.from({ length: 5 }, (_, i) =>
      exploreSvc(String(i), 'cold_start'),
    )

    const out = diversifyByChip(cards)
    expect(out.map(s => s.id)).toEqual(['0', '1', '2', '3', '4'])
  })
})

describe('weighted chip picker', () => {
  // Reaches into the picker by checking that the diversifier sees the picker's
  // output: when tag*W_TAG > follow*W_FOLLOW the tag-strong card should not
  // collide with a true follow card next to it.
  it('lets a strong tag overlap win the chip over a moderate follow signal', () => {
    // tag=0.8 -> 0.40 weighted; follow=0.5 -> 0.15 weighted -> tag wins.
    const tagStrong = svc('tag', { tag: 0.8, follow: 0.5, cooccur: 0, recency_penalty: 0 })
    const followStrong = svc('follow', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 })
    const followStrong2 = svc('follow2', { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 })

    // tag-strong sits between two follow-strongest -- diversifier should leave
    // it alone because it already provides variance.
    const out = diversifyByChip([followStrong, tagStrong, followStrong2])
    expect(out.map(s => s.id)).toEqual(['follow', 'tag', 'follow2'])
  })

  it('treats follow as winning when raw follow value is much higher', () => {
    // tag=0.1 -> 0.05; follow=0.8 -> 0.24 -> follow wins each.
    const followLeaning = svc('a', { tag: 0.1, follow: 0.8, cooccur: 0, recency_penalty: 0 })
    const followLeaning2 = svc('b', { tag: 0.1, follow: 0.8, cooccur: 0, recency_penalty: 0 })
    const tagPure = svc('c', { tag: 0.9, follow: 0, cooccur: 0, recency_penalty: 0 })

    // Both leaning-follow cards collide; diversifier should swap in 'c'.
    const out = diversifyByChip([followLeaning, followLeaning2, tagPure])
    expect(out[0].id).toBe('a')
    expect(out[1].id).toBe('c')
  })
})
