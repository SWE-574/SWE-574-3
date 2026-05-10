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

export function chipForSignals(signals?: ForYouSignals | null): SignalChip {
  if (!signals) return DEFAULT_CHIP
  const entries: Array<[SignalChip['name'], number]> = [
    ['tag', signals.tag * FOR_YOU_WEIGHTS.tag],
    ['follow', signals.follow * FOR_YOU_WEIGHTS.follow],
    ['cooccur', signals.cooccur * FOR_YOU_WEIGHTS.cooccur],
    ['engagement', (signals.engagement ?? 0) * FOR_YOU_WEIGHTS.engagement],
  ]
  const [topName, topValue] = entries.reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ['default' as SignalChip['name'], 0],
  )
  if (topValue <= 0) return DEFAULT_CHIP
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
export function pillIdentity(service: Service): PillIdentity {
  const chip = chipForSignals(service.for_you_signals)
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
// `lookahead = 4` is tuned for the 10-card web carousel and the Browse
// grid. Earlier value of 3 left visible 4-in-a-row clusters intact when
// the diverging card sat just past the window. Mobile renders 5 cards
// via ForYouSection and currently does not call this helper; if it ever
// does, drop `lookahead` to 2 so we don't search beyond half the row.
export function diversifyByChip(services: Service[], lookahead = 4): Service[] {
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
