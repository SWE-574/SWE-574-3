import type { ForYouSignals, Service } from '@/types'
import { isNearlyFull } from '@/utils/eventUtils'

export interface SignalChip {
  name: 'tag' | 'follow' | 'cooccur' | 'engagement' | 'default'
  label: string
  bg: string
  fg: string
}

// Stable key for the pill SmartPill will actually render. Mirrors the
// priority chain in SmartPill.tsx so the diversifier sees the same
// identities the user does. Without this, every card without
// for_you_signals collapses to 'default' and visible runs of e.g.
// "Fresh provider" or "Rising newcomer" survive the swap pass.
export type PillIdentity =
  | SignalChip['name']  // 'tag' | 'follow' | 'cooccur' | 'engagement' | 'default'
  | 'newcomer'
  | 'capacity'
  | 'pool:cold_start'
  | 'pool:undershown_quality'
  | 'pool:stale_recurring'
  | 'none'

// Mirror backend/hive_project/settings.py:RANKING_FOR_YOU_*_WEIGHT.
// Argmax on raw values made follow (flat 1.0) always win over Jaccard tag
// overlap (typically a small float); weighting matches the actual ranking blend
// so the chip reflects what moved the score.
//
// `engagement` (Jaccard overlap with the viewer's saved-services tags) is
// already computed at backend/api/ranking_personalized.py:393 and shipped on
// the ForYouSignals payload, but never previously surfaced as a chip. It
// rounds out the pill set with a pure interest-axis signal that is
// orthogonal to the social graph (`follow`) and the co-occurrence prior
// (`cooccur`). Weight is intentionally below `cooccur` so it doesn't crowd
// out the established signals on cards that score similarly across axes.
export const FOR_YOU_WEIGHTS = {
  tag: 0.5,
  follow: 0.3,
  cooccur: 0.2,
  engagement: 0.15,
} as const

export const DEFAULT_CHIP: SignalChip = {
  name: 'default',
  label: 'For you',
  bg: 'rgba(168, 85, 247, 0.95)',
  fg: 'white',
}

// Threshold for promoting a competitive interest signal over a winning
// `follow` chip. On dense social graphs (the demo seed creates 94 follows
// across 13 users, so almost every card has follow=1.0) the follow signal
// saturates and would label nearly every card "From your network", erasing
// the more discoverable interest-match story for cards that genuinely
// also overlap with the viewer's tags. When an interest axis is at least
// half as strong as follow, prefer it — the viewer already knows who they
// follow, but "Matches your interests" is the actionable insight that
// surfaces a discovery they can act on.
const FOLLOW_PROMOTION_RATIO = 0.5

export function chipForSignals(signals?: ForYouSignals | null): SignalChip {
  if (!signals) return DEFAULT_CHIP
  const entries: Array<[SignalChip['name'], number]> = [
    ['tag', signals.tag * FOR_YOU_WEIGHTS.tag],
    ['follow', signals.follow * FOR_YOU_WEIGHTS.follow],
    ['cooccur', signals.cooccur * FOR_YOU_WEIGHTS.cooccur],
    ['engagement', (signals.engagement ?? 0) * FOR_YOU_WEIGHTS.engagement],
  ]
  const argmax = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ['default' as SignalChip['name'], 0] as [SignalChip['name'], number],
  )
  let topName: SignalChip['name'] = argmax[0]
  const topValue = argmax[1]
  if (topValue <= 0) return DEFAULT_CHIP

  // Follow-saturation override: when follow wins by argmax but an interest
  // axis is competitive, swap the chip to that interest axis. Only fires
  // when the primary is `follow` so a card whose strongest signal is
  // genuinely an interest signal is never demoted to a weaker interest
  // signal.
  if (topName === 'follow') {
    const threshold = topValue * FOLLOW_PROMOTION_RATIO
    let promoted: SignalChip['name'] | null = null
    let promotedValue = -Infinity
    for (const [name, value] of entries) {
      if (name === 'follow') continue
      if (value > 0 && value >= threshold && value > promotedValue) {
        promoted = name
        promotedValue = value
      }
    }
    if (promoted !== null) {
      topName = promoted
    }
  }
  if (topName === 'tag') {
    return { name: 'tag', label: 'Matches your interests', bg: 'rgba(168, 85, 247, 0.95)', fg: 'white' }
  }
  if (topName === 'follow') {
    return { name: 'follow', label: 'From your network', bg: 'rgba(245, 158, 11, 0.95)', fg: 'white' }
  }
  if (topName === 'cooccur') {
    return { name: 'cooccur', label: 'Popular with people like you', bg: 'rgba(59, 130, 246, 0.95)', fg: 'white' }
  }
  return { name: 'engagement', label: 'Saved by others', bg: 'rgba(20, 184, 166, 0.95)', fg: 'white' }
}

// Identity of the pill SmartPill will render for `service`. Must stay in
// sync with SmartPill.tsx's priority chain. Used by the diversifier and
// (re-exported via SmartPill) by the renderer itself, so a single source
// of truth governs both.
//
// Newcomer-over-follow promotion: when the for-you chip resolves to
// `follow` BUT the connection is indirect (friend-of-friend, raw
// signal < 1.0) AND the owner is also a newcomer, surface the newcomer
// story instead. Direct follows (signal === 1.0) keep "From your
// network" because that IS the actual discovery story -- the viewer
// chose to follow this person. Indirect follows are weaker social
// proof, and on densely-connected seeds the newcomer pill never gets a
// chance to fire because every card has *some* follow signal. This
// surfaces the third pill colour on the demo grid without erasing the
// follow chip on real direct connections.
export function pillIdentity(service: Service): PillIdentity {
  const chip = chipForSignals(service.for_you_signals)
  const followSignal = service.for_you_signals?.follow ?? 0
  if (
    chip.name === 'follow'
    && service.is_newcomer_owner
    && followSignal < 1
  ) {
    return 'newcomer'
  }
  if (chip.name !== 'default') return chip.name
  if (service.is_newcomer_owner) return 'newcomer'
  const max = service.max_participants ?? 0
  const count = service.participant_count ?? 0
  if (isNearlyFull(max, count)) return 'capacity'
  if (service.explore_pool === 'cold_start') return 'pool:cold_start'
  if (service.explore_pool === 'undershown_quality') return 'pool:undershown_quality'
  if (service.explore_pool === 'stale_recurring') return 'pool:stale_recurring'
  return 'none'
}

// Reorder so two consecutive cards rarely share a chip. Walks left to
// right; when position i would collide with i-1, swap in the first card
// within the next `lookahead` positions whose pill identity differs.
// Caps total swaps so the ranking signal isn't wiped out by aggressive
// rotation.
//
// `lookahead = 7` is tuned for the 15-card Browse grid (3 columns × 5
// rows). On demo data ~80% of cards win the chip on `follow` because
// the seed is densely connected (94 follows / 13 users), and only ~3
// of the top 15 resolve to other signals. With the previous value of 4
// the diversifier could reach the first off-chip card but ran out of
// reach by the second row, leaving positions 2-4 as a visible
// monochrome cluster. 7 spans both visible rows above the fold so the
// rare non-follow cards can be pulled forward to actually break the
// run; the swap cap (floor(N / 2)) still bounds total rearrangement.
//
// Mobile renders 5 cards via ForYouSection and currently does not call
// this helper; if it ever does, drop `lookahead` to 2 so we don't
// search beyond half the visible row.
export function diversifyByChip(services: Service[], lookahead = 7): Service[] {
  const out = services.slice()
  const maxSwaps = Math.floor(out.length / 2)
  let swaps = 0
  for (let i = 1; i < out.length && swaps < maxSwaps; i++) {
    if (pillIdentity(out[i]) !== pillIdentity(out[i - 1])) continue
    const limit = Math.min(out.length, i + 1 + lookahead)
    for (let j = i + 1; j < limit; j++) {
      if (pillIdentity(out[j]) !== pillIdentity(out[i - 1])) {
        ;[out[i], out[j]] = [out[j], out[i]]
        swaps += 1
        break
      }
    }
  }
  return out
}
