import { Box, Flex, Text } from '@chakra-ui/react'
import { FiBookmark, FiClock, FiCompass, FiStar, FiSunrise, FiUsers } from 'react-icons/fi'

import { chipForSignals } from '@/utils/forYouChips'
import type { Service } from '@/types'

interface NewcomerFlavour {
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
const NEWCOMER_FLAVOUR: NewcomerFlavour = {
  label: 'Rising newcomer',
  bg: 'rgba(244, 114, 182, 0.92)',
  fg: 'white',
  border: 'transparent',
  Icon: FiSunrise,
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
 *   3. explore-pool flavour as the final fallback
 *
 * The earlier order put the pool first, but on demo data every card
 * qualifies as cold_start, which drowned out cards that DID have a real
 * for_you signal. cold_start specifically renders as an outline pill so
 * it never dominates over a saturated for_you pill.
 */
export default function SmartPill({ service }: SmartPillProps) {
  const chip = chipForSignals(service.for_you_signals)
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
