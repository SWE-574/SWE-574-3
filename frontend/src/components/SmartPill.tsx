import { Box, Flex, Text } from '@chakra-ui/react'
import { FiClock, FiCompass, FiStar, FiUsers } from 'react-icons/fi'

import { chipForSignals } from '@/utils/forYouChips'
import type { Service } from '@/types'

const POOL_FLAVOUR: Record<NonNullable<Service['explore_pool']>, { label: string; bg: string; fg: string; Icon: typeof FiStar }> = {
  cold_start:         { label: 'Fresh provider', bg: 'rgba(20, 184, 166, 0.92)',  fg: 'white', Icon: FiCompass },
  undershown_quality: { label: 'Hidden gem',     bg: 'rgba(168, 85, 247, 0.92)',  fg: 'white', Icon: FiStar },
  stale_recurring:    { label: 'Rediscovered',   bg: 'rgba(99, 102, 241, 0.92)',  fg: 'white', Icon: FiClock },
}

interface SmartPillProps {
  service: Service
}

/**
 * Small "why this card?" pill that renders only when the recommendation
 * engine elevated the card by some signal. Same restraint pattern YouTube
 * uses with "New to you" / "Watched" badges -- contextual, not always-on.
 *
 * Pill priority: explore-pool flavour first (Fresh provider / Hidden gem /
 * Rediscovered), then the strongest for_you signal (tag / follow / cooccur).
 * Returns null when nothing applies so default-hot cards render unadorned.
 */
export default function SmartPill({ service }: SmartPillProps) {
  if (service.explore_pool && POOL_FLAVOUR[service.explore_pool]) {
    const flavour = POOL_FLAVOUR[service.explore_pool]
    return <PillBox label={flavour.label} bg={flavour.bg} fg={flavour.fg} Icon={flavour.Icon} />
  }
  const chip = chipForSignals(service.for_you_signals)
  if (chip.name === 'default') return null
  const Icon = chip.name === 'follow' ? FiUsers : chip.name === 'cooccur' ? FiClock : FiStar
  return <PillBox label={chip.label} bg={chip.bg} fg={chip.fg} Icon={Icon} />
}

function PillBox({ label, bg, fg, Icon }: { label: string; bg: string; fg: string; Icon: typeof FiStar }) {
  return (
    <Box display="inline-block" bg={bg} color={fg} px={2} py="3px" borderRadius="full">
      <Flex align="center" gap={1}>
        <Icon size={10} />
        <Text fontSize="10px" fontWeight="800" letterSpacing="0.01em">{label}</Text>
      </Flex>
    </Box>
  )
}
