import { Box, Flex, Text } from '@chakra-ui/react'
import { FiClock, FiCompass, FiStar, FiUsers } from 'react-icons/fi'

import { chipForSignals } from '@/utils/forYouChips'
import type { Service } from '@/types'

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
 * Pill priority: strongest for_you signal first (tag / follow / cooccur),
 * then the explore-pool flavour as a fallback. The earlier order put the
 * pool first, but on demo data every card qualifies as cold_start, so the
 * "Fresh provider" pill drowned out cards that DID have a real for_you
 * signal. cold_start specifically renders as an outline pill so it never
 * dominates over a saturated for_you pill.
 */
export default function SmartPill({ service }: SmartPillProps) {
  const chip = chipForSignals(service.for_you_signals)
  if (chip.name !== 'default') {
    const Icon = chip.name === 'follow' ? FiUsers : chip.name === 'cooccur' ? FiClock : FiStar
    return <PillBox label={chip.label} bg={chip.bg} fg={chip.fg} border="transparent" Icon={Icon} />
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
