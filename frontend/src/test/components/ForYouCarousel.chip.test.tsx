/**
 * Tests for the For You carousel chip picker and diversifier.
 *
 * Chip variance fix: the picker must mirror the backend blend weights
 * (RANKING_FOR_YOU_*_WEIGHT in settings.py) so a strong tag overlap can win
 * the chip even when follow is also positive. Diversifier: no two consecutive
 * cards should share a chip when a different-chip card is within the lookahead.
 */
import { describe, it, expect } from 'vitest'

import { chipForSignals, diversifyByChip, pillIdentity } from '@/utils/forYouChips'
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

  it('does not perturb ranking to break a run of invisible (none-identity) pills', () => {
    // pillIdentity returns 'none' for vanilla cards: no for_you_signals,
    // no explore_pool, no newcomer flag, not capacity-near-full. SmartPill
    // renders nothing for these. Two consecutive 'none' cards are not a
    // user-visible cluster, so the diversifier must NOT bump a higher-
    // ranked 'none' card down just to lift a single 'follow' card up
    // through the lookahead window — that perturbs ranking order to
    // resolve a collision the user can't see.
    const vanilla = (id: string): Service =>
      ({ id, title: `Service ${id}`, type: 'Offer' } as unknown as Service)
    const followCard = (id: string) =>
      svc(id, { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 })
    const cards = [
      vanilla('a'),
      vanilla('b'),
      vanilla('c'),
      followCard('d'),
    ]

    const out = diversifyByChip(cards)
    // Sanity: every vanilla card is identity 'none' and the follow card is
    // identity 'follow' — the precondition that triggered the spurious swap.
    expect(pillIdentity(cards[0])).toBe('none')
    expect(pillIdentity(cards[1])).toBe('none')
    expect(pillIdentity(cards[3])).toBe('follow')
    // Order is preserved: the follow card stays at the bottom even though
    // pulling it up would technically "diversify" the none-none collision.
    expect(out.map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('breaks up follow-saturated runs across the first two visible rows of a 15-card grid', () => {
    // Mirrors Elif's account on the demo seed, where ~80% of cards win
    // the chip on `follow` (everyone-follows-everyone) and only 3 of 15
    // resolve to `tag`. With a too-narrow lookahead the diversifier can
    // only reach the first tag card and leaves positions 3-4-5 as an
    // all-follow cluster — the second row of the 3-column grid renders
    // as three identical "From your network" pills.
    const followCard = (id: string) =>
      svc(id, { tag: 0, follow: 1, cooccur: 0, recency_penalty: 0 })
    const tagCard = (id: string, weight: number) =>
      svc(id, { tag: weight, follow: 0, cooccur: 0, recency_penalty: 0 })
    const cards = [
      followCard('0'), followCard('1'), tagCard('2', 0.5),
      followCard('3'), followCard('4'), followCard('5'),
      followCard('6'), followCard('7'), followCard('8'),
      followCard('9'), followCard('10'), tagCard('11', 1.0),
      followCard('12'), tagCard('13', 0.67), followCard('14'),
    ]

    const out = diversifyByChip(cards)

    // No three consecutive cards anywhere in the first two visible rows
    // (positions 0-5) may share a chip identity. This is the regression
    // the bumped lookahead unlocks: rows 1 and 2 must each render at
    // least one non-follow pill so the page does not look monochrome.
    const namesInFirstSixRows = out
      .slice(0, 6)
      .map(s => chipForSignals(s.for_you_signals).name)
    for (let i = 0; i + 2 < namesInFirstSixRows.length; i++) {
      const triplet = namesInFirstSixRows.slice(i, i + 3)
      expect(new Set(triplet).size).toBeGreaterThan(1)
    }
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

  it('promotes a competitive interest signal over follow on dense follow graphs', () => {
    // Mirrors the demo seed: everyone-follows-everyone makes most cards
    // win on `follow`, even when `tag` overlap is non-trivial. Showing
    // "From your network" 10 times in a row erases the more actionable
    // "Matches your interests" story for cards that genuinely have
    // interest overlap. Promote `tag` whenever its weighted score is at
    // least half of follow's, so the demo Browse grid no longer renders
    // a near-monochrome strip of follow chips.
    //
    // Raw weights: tag * 0.5, follow * 0.3.
    // tag=0.5 -> 0.25; follow=1.0 -> 0.30. Ratio 0.83 -> tag wins.
    const card = chipForSignals({
      tag: 0.5, follow: 1.0, cooccur: 0, recency_penalty: 0,
    } as ForYouSignals)
    expect(card.name).toBe('tag')

    // tag=0.33 -> 0.165; follow=1.0 -> 0.30. Ratio 0.55 -> tag still wins.
    const moderate = chipForSignals({
      tag: 0.33, follow: 1.0, cooccur: 0, recency_penalty: 0,
    } as ForYouSignals)
    expect(moderate.name).toBe('tag')

    // tag=0.1 -> 0.05; follow=1.0 -> 0.30. Ratio 0.17 -> follow wins.
    // Below the half-strength bar a tiny tag overlap should not hijack
    // the chip.
    const trace = chipForSignals({
      tag: 0.1, follow: 1.0, cooccur: 0, recency_penalty: 0,
    } as ForYouSignals)
    expect(trace.name).toBe('follow')
  })

  it('does not promote a competitive cooccur/engagement signal over a primary tag chip', () => {
    // The promotion only fires for follow saturation. A card whose
    // primary signal is already an interest axis should not flip to a
    // weaker interest axis just because that axis is competitive.
    // tag=0.5 -> 0.25; cooccur=1.0 -> 0.20. tag is primary. Ratio
    // (cooccur / tag) = 0.80, so without the follow-only guard the
    // logic would replace tag with cooccur and harm clarity.
    const c = chipForSignals({
      tag: 0.5, follow: 0, cooccur: 1.0, recency_penalty: 0,
    } as ForYouSignals)
    expect(c.name).toBe('tag')
  })

  it('promotes newcomer over follow only on indirect (friend-of-friend) connections', () => {
    // Demo seed creates direct follows (signal=1.0) and second-degree
    // follows (signal=0.5). When the owner is a newcomer, only the
    // indirect cards should flip to "Rising newcomer" -- direct
    // follows keep "From your network" because that IS the actual
    // discovery story (the viewer chose to follow this person). On
    // densely-connected seeds this still surfaces a third pill colour
    // for the indirect-follow newcomers without erasing the follow
    // chip on direct-follow cards.

    // Direct follow + newcomer => stays follow (the explicit follow
    // is the more relevant story than "rising newcomer").
    const directFollowNewcomer = {
      id: 'd', type: 'Offer',
      for_you_signals: { tag: 0, follow: 1.0, cooccur: 0, recency_penalty: 0 },
      is_newcomer_owner: true,
    } as unknown as Service
    expect(pillIdentity(directFollowNewcomer)).toBe('follow')

    // Indirect follow + newcomer => promoted to newcomer.
    const indirectFollowNewcomer = {
      id: 'i', type: 'Offer',
      for_you_signals: { tag: 0, follow: 0.5, cooccur: 0, recency_penalty: 0 },
      is_newcomer_owner: true,
    } as unknown as Service
    expect(pillIdentity(indirectFollowNewcomer)).toBe('newcomer')

    // Indirect follow + non-newcomer => stays follow (no newcomer story
    // to promote).
    const indirectFollowOldOwner = {
      id: 'o', type: 'Offer',
      for_you_signals: { tag: 0, follow: 0.5, cooccur: 0, recency_penalty: 0 },
      is_newcomer_owner: false,
    } as unknown as Service
    expect(pillIdentity(indirectFollowOldOwner)).toBe('follow')

    // No for-you signals + newcomer => still resolves through the
    // existing fallback branch.
    const newcomerOnly = {
      id: 'n', type: 'Offer',
      for_you_signals: { tag: 0, follow: 0, cooccur: 0, recency_penalty: 0 },
      is_newcomer_owner: true,
    } as unknown as Service
    expect(pillIdentity(newcomerOnly)).toBe('newcomer')
  })

})
