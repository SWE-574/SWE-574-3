import { useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiCheckCircle, FiFileText, FiUserPlus, FiZap } from 'react-icons/fi'
import type { ActivityEvent } from '@/services/activityAPI'

interface StatChip {
  icon: React.ReactNode
  count: number
  label: string
  bg: string
  fg: string
}

interface ActivityHeaderStatsProps {
  events: ActivityEvent[]
}

export function ActivityHeaderStats({ events }: ActivityHeaderStatsProps) {
  // Capture "now" once at mount; useState initializer is the blessed pattern
  // for impure values that should not refresh on every render.
  const [now] = useState(() => Date.now())
  const counts = useMemo(() => {
    const oneWeekAgo = now - 7 * 86_400_000
    const recent = events.filter(e => new Date(e.created_at).getTime() >= oneWeekAgo)
    return {
      services: recent.filter(e => e.verb === 'service_created' || e.verb === 'event_filling_up').length,
      handshakes: recent.filter(e => e.verb === 'handshake_accepted' || e.verb === 'handshake_completed').length,
      neighbors: recent.filter(e => e.verb === 'new_neighbor').length,
      follows: recent.filter(e => e.verb === 'user_followed').length,
    }
  }, [events, now])

  const total = counts.services + counts.handshakes + counts.neighbors + counts.follows
  if (total === 0) return null

  const chips: StatChip[] = [
    {
      icon: <FiFileText size={14} />,
      count: counts.services,
      label: counts.services === 1 ? 'new post' : 'new posts',
      bg: 'rgba(22, 163, 74, 0.1)',
      fg: '#15803d',
    },
    {
      icon: <FiCheckCircle size={14} />,
      count: counts.handshakes,
      label: counts.handshakes === 1 ? 'handshake' : 'handshakes',
      bg: 'rgba(34, 197, 94, 0.12)',
      fg: '#166534',
    },
    {
      icon: <FiZap size={14} />,
      count: counts.neighbors,
      label: counts.neighbors === 1 ? 'new neighbor' : 'new neighbors',
      bg: 'rgba(20, 184, 166, 0.1)',
      fg: '#0f766e',
    },
    {
      icon: <FiUserPlus size={14} />,
      count: counts.follows,
      label: counts.follows === 1 ? 'connection' : 'connections',
      bg: 'rgba(168, 85, 247, 0.1)',
      fg: '#7e22ce',
    },
  ].filter(c => c.count > 0)

  return (
    <Flex
      gap={2}
      mb={5}
      wrap="wrap"
      align="center"
    >
      <Text fontSize="11px" fontWeight={700} color="gray.500" textTransform="uppercase" letterSpacing="0.7px" mr={1}>
        This week
      </Text>
      {chips.map(chip => (
        <Flex
          key={chip.label}
          align="center"
          gap="6px"
          px="11px"
          py="5px"
          borderRadius="999px"
          bg={chip.bg}
          color={chip.fg}
          fontSize="12px"
          fontWeight={600}
        >
          <Box>{chip.icon}</Box>
          <Text as="span" fontWeight={700}>{chip.count}</Text>
          <Text as="span">{chip.label}</Text>
        </Flex>
      ))}
    </Flex>
  )
}
