import type { ForYouSignals, Service } from '@/types'

export interface SignalChip {
  name: 'tag' | 'follow' | 'cooccur' | 'default'
  label: string
  bg: string
  fg: string
}

// Mirror backend/hive_project/settings.py:RANKING_FOR_YOU_*_WEIGHT.
// Argmax on raw values made follow (flat 1.0) always win over Jaccard tag
// overlap (typically a small float); weighting matches the actual ranking blend
// so the chip reflects what moved the score.
export const FOR_YOU_WEIGHTS = { tag: 0.5, follow: 0.3, cooccur: 0.2 } as const

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
  return { name: 'cooccur', label: 'Popular with people like you', bg: 'rgba(59, 130, 246, 0.95)', fg: 'white' }
}

// Reorder so two consecutive cards rarely share a chip. Walks left to right;
// when position i would collide with i-1, swap in the first card within the
// next `lookahead` positions whose chip differs. Caps total swaps so the
// ranking signal isn't wiped out by aggressive rotation.
//
// `lookahead = 3` is tuned for the 10-card web carousel (ForYouCarousel).
// Mobile renders 5 cards via ForYouSection and currently does not call
// this helper; if it ever does, drop `lookahead` to 2 so we don't search
// beyond half the visible row.
export function diversifyByChip(services: Service[], lookahead = 3): Service[] {
  const out = services.slice()
  const chipName = (s: Service) => chipForSignals(s.for_you_signals).name
  const maxSwaps = Math.floor(out.length / 2)
  let swaps = 0
  for (let i = 1; i < out.length && swaps < maxSwaps; i++) {
    if (chipName(out[i]) !== chipName(out[i - 1])) continue
    const limit = Math.min(out.length, i + 1 + lookahead)
    for (let j = i + 1; j < limit; j++) {
      if (chipName(out[j]) !== chipName(out[i - 1])) {
        ;[out[i], out[j]] = [out[j], out[i]]
        swaps += 1
        break
      }
    }
  }
  return out
}
