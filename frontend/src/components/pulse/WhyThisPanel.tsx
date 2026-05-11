import { Box, Stack, Text } from '@chakra-ui/react'
import { FiCheck } from 'react-icons/fi'

import { useAuthStore } from '@/store/useAuthStore'
import { GRAY100, GRAY200, GRAY500, GRAY700, GREEN } from '@/theme/tokens'
import type { ForYouSignals, Service } from '@/types'

interface Props {
  signals: ForYouSignals | null | undefined
  service: Service
}

export default function WhyThisPanel({ signals, service }: Props) {
  const user = useAuthStore((state) => state.user)
  const reasons: string[] = []

  if (signals) {
    if (signals.tag > 0.1) {
      const userSkillIds = new Set((user?.skills ?? []).map((t) => t.id))
      const matched = (service.tags ?? [])
        .filter((t) => userSkillIds.has(t.id))
        .map((t) => t.name)
        .slice(0, 2)
      if (matched.length > 0) {
        reasons.push(`Matches your interests: ${matched.join(', ')}`)
      } else {
        reasons.push('Matches your interests')
      }
    }
    if (signals.follow > 0.5) {
      reasons.push('From people you follow')
    } else if (signals.follow > 0) {
      reasons.push('From your network (2nd-degree)')
    }
    if (signals.cooccur > 0) {
      reasons.push('Popular with people who saved similar services')
    }
    if ((signals.engagement ?? 0) > 0.1) {
      reasons.push("Similar to services you've saved")
    }
  }

  if (service.explore_pool === 'cold_start') {
    reasons.push('Surfaced as a fresh provider just getting started')
  } else if (service.explore_pool === 'undershown_quality') {
    reasons.push('A hidden gem that deserves more visibility')
  } else if (service.explore_pool === 'stale_recurring') {
    reasons.push('Rediscovered — popular before, worth a fresh look')
  }

  if (reasons.length === 0) {
    reasons.push("Picked because it's trending in your area")
  }

  return (
    <Box
      mt="6px"
      mb="2px"
      p="10px 12px"
      borderRadius="10px"
      bg={GRAY100}
      borderWidth="1px"
      borderColor={GRAY200}
      data-testid="why-this-panel"
    >
      <Text
        fontSize="10px"
        fontWeight={700}
        color={GRAY500}
        mb="6px"
        style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        Why this?
      </Text>
      <Stack gap="4px">
        {reasons.map((reason, i) => (
          <Box
            key={i}
            display="flex"
            alignItems="flex-start"
            gap="6px"
            fontSize="12px"
            color={GRAY700}
            lineHeight="1.4"
          >
            <Box
              flexShrink={0}
              mt="3px"
              color={GREEN}
              display="inline-flex"
              alignItems="center"
            >
              <FiCheck size={11} />
            </Box>
            <Box as="span">{reason}</Box>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
