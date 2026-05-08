import { Flex, Text } from '@chakra-ui/react'

import type { PulseStats as PulseStatsType } from '@/services/pulseAPI'

interface Props {
  stats: PulseStatsType | null
}

function pluralise(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : plural ?? `${singular}s`
}

export default function PulseStats({ stats }: Props) {
  if (!stats) return null
  const parts: string[] = []
  parts.push(
    `${stats.new_since_last_visit} new ${pluralise(stats.new_since_last_visit, 'pick')} since you last visited`,
  )
  parts.push(
    `${stats.saved_count} saved`,
  )
  parts.push(
    `${stats.follow_handshakes_week} ${pluralise(stats.follow_handshakes_week, 'handshake')} from your follows this week`,
  )

  return (
    <Flex gap={2} flexWrap="wrap" data-testid="pulse-stats">
      {parts.map((p, i) => (
        <Text key={i} fontSize="13px" color="gray.600">
          {p}
          {i < parts.length - 1 ? ' · ' : ''}
        </Text>
      ))}
    </Flex>
  )
}
