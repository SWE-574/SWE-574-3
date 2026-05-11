import { Box, Flex, Text } from '@chakra-ui/react'
import { FiBookmark, FiClock, FiCompass, FiStar, FiSunrise, FiTrendingUp, FiUsers } from 'react-icons/fi'

import { chipForSignals } from '@/utils/forYouChips'
import { isNearlyFull, spotsLeft } from '@/utils/eventUtils'
import type { Service } from '@/types'

interface FallbackFlavour {
  label: string
  bg: string
  fg: string
  border: string
  Icon: typeof FiStar
}

// Phase-3 fallback for owners who joined recently. Distinct from the
// `cold_start` explore pool ("Fresh provider"): newcomer-owner is a
// recency signal on the user, cold_start is an activity-history signal
// on the listing. When both apply, the newcomer pill takes priority
// because it's a stronger discovery story (a brand-new face, not just an
// under-shown listing).
const NEWCOMER_FLAVOUR: FallbackFlavour = {
  label: 'Rising newcomer',
  bg: 'rgba(244, 114, 182, 0.92)',
  fg: 'white',
  border: 'transparent',
  Icon: FiSunrise,
}

// Capacity-scarcity pill for multi-seat services in the 75-99% filled
// window. The `isNearlyFull` helper is reused as-is (already pinned by
// `frontend/src/test/utils/eventUtils.test.ts`) — single-seat services
// never trigger because they jump from 0% to 100% without crossing the
// band. Beats `explore_pool` because scarcity is a time-sensitive
// "act now" signal, but loses to a real for_you match and to the
// (rarer) newcomer flag, since both of those are stronger discovery
// stories than the generic "filling up" cue.
function buildCapacityFlavour(remaining: number): FallbackFlavour {
  return {
    label: remaining === 1 ? '1 spot left' : `${remaining} spots left`,
    bg: 'rgba(217, 119, 6, 0.95)',
    fg: 'white',
    border: 'transparent',
    Icon: FiTrendingUp,
  }
}

interface PoolFlavour {
  label: string
  bg: string
  fg: string
  border: string
  Icon: typeof FiStar
  /** Outline style is muted; cold_start uses it because every demo card
   *  qualifies and the saturated solid would dominate the page. */
  outline: boolean
}

const POOL_FLAVOUR: Record<NonNullable<Service['explore_pool']>, PoolFlavour> = {
  cold_start:         { label: 'Fresh provider', bg: 'rgba(255,255,255,0.6)', fg: '#0F766E', border: '#5EEAD4', Icon: FiCompass, outline: true },
  undershown_quality: { label: 'Hidden gem',     bg: 'rgba(168, 85, 247, 0.92)', fg: 'white', border: 'transparent', Icon: FiStar, outline: false },
  stale_recurring:    { label: 'Rediscovered',   bg: 'rgba(99, 102, 241, 0.92)', fg: 'white', border: 'transparent', Icon: FiClock, outline: false },
}

interface SmartPillProps {
  service: Service
}

/**
 * Small "why this card?" pill that renders only when the recommendation
 * engine elevated the card by some signal. Same restraint pattern YouTube
 * uses with "New to you" / "Watched" badges -- contextual, not always-on.
 *
 * Pill priority:
 *   1. strongest for_you signal (tag / follow / cooccur / engagement)
 *   2. is_newcomer_owner — distinct discovery story for brand-new faces
 *   3. capacity scarcity (`isNearlyFull` 75-99%) — time-sensitive "act now"
 *   4. explore-pool flavour as the final fallback
 *
 * The earlier order put the pool first, but on demo data every card
 * qualifies as cold_start, which drowned out cards that DID have a real
 * for_you signal. cold_start specifically renders as an outline pill so
 * it never dominates over a saturated for_you pill.
 *
 * IMPORTANT: this priority chain is also encoded in `pillIdentity` in
 * forYouChips.ts so the Browse-grid diversifier sees the same chip
 * identities the user does. If you reorder branches here, mirror the
 * change there or runs of identical pills will resurface.
 */
export default function SmartPill({ service }: SmartPillProps) {
  const chip = chipForSignals(service.for_you_signals)
  // Newcomer-over-follow promotion: when the for-you chip resolves to
  // `follow`, the owner is a newcomer, AND the follow signal is from an
  // indirect (friend-of-friend, raw signal < 1.0) connection, render
  // the newcomer story instead. Direct follows keep "From your network"
  // because that IS the actual discovery insight -- the viewer chose to
  // follow this person. Mirrors the same branch in `pillIdentity` so
  // the diversifier and the renderer agree on the chip identity.
  const followSignal = service.for_you_signals?.follow ?? 0
  if (
    chip.name === 'follow'
    && service.is_newcomer_owner
    && followSignal < 1
  ) {
    return (
      <PillBox
        label={NEWCOMER_FLAVOUR.label}
        bg={NEWCOMER_FLAVOUR.bg}
        fg={NEWCOMER_FLAVOUR.fg}
        border={NEWCOMER_FLAVOUR.border}
        Icon={NEWCOMER_FLAVOUR.Icon}
      />
    )
  }
  if (chip.name !== 'default') {
    const Icon =
      chip.name === 'follow' ? FiUsers
      : chip.name === 'cooccur' ? FiClock
      : chip.name === 'engagement' ? FiBookmark
      : FiStar
    return <PillBox label={chip.label} bg={chip.bg} fg={chip.fg} border="transparent" Icon={Icon} />
  }
  if (service.is_newcomer_owner) {
    return (
      <PillBox
        label={NEWCOMER_FLAVOUR.label}
        bg={NEWCOMER_FLAVOUR.bg}
        fg={NEWCOMER_FLAVOUR.fg}
        border={NEWCOMER_FLAVOUR.border}
        Icon={NEWCOMER_FLAVOUR.Icon}
      />
    )
  }
  const max = service.max_participants ?? 0
  const count = service.participant_count ?? 0
  if (isNearlyFull(max, count)) {
    const capacityFlavour = buildCapacityFlavour(spotsLeft(max, count))
    return (
      <PillBox
        label={capacityFlavour.label}
        bg={capacityFlavour.bg}
        fg={capacityFlavour.fg}
        border={capacityFlavour.border}
        Icon={capacityFlavour.Icon}
      />
    )
  }
  if (service.explore_pool && POOL_FLAVOUR[service.explore_pool]) {
    const flavour = POOL_FLAVOUR[service.explore_pool]
    return (
      <PillBox
        label={flavour.label}
        bg={flavour.bg}
        fg={flavour.fg}
        border={flavour.border}
        Icon={flavour.Icon}
      />
    )
  }
  return null
}

function PillBox({
  label,
  bg,
  fg,
  border,
  Icon,
}: {
  label: string
  bg: string
  fg: string
  border: string
  Icon: typeof FiStar
}) {
  return (
    <Box
      display="inline-block"
      bg={bg}
      color={fg}
      border={`1px solid ${border}`}
      px={2}
      py="3px"
      borderRadius="full"
    >
      <Flex align="center" gap={1}>
        <Icon size={10} />
        <Text fontSize="10px" fontWeight="800" letterSpacing="0.01em">{label}</Text>
      </Flex>
    </Box>
  )
}
