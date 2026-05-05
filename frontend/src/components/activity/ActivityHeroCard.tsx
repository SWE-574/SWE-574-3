import { useMemo, useState } from 'react'
import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import type { ActivityEvent } from '@/services/activityAPI'
import { actorAvatarStub, actorName, distanceLabel, startsInLabel, TYPE_GRADIENT } from './shared'

const TYPE_BADGE: Record<'Offer' | 'Need' | 'Event', { label: string; bg: string }> = {
  Offer: { label: 'OFFER', bg: 'rgba(22, 163, 74, 0.95)' },
  Need: { label: 'NEED', bg: 'rgba(59, 130, 246, 0.95)' },
  Event: { label: 'EVENT', bg: 'rgba(245, 158, 11, 0.95)' },
}

interface ActivityHeroCardProps {
  event: ActivityEvent
  variant?: 'default' | 'urgent'
}

const FRESH_THRESHOLD_MS = 60 * 60 * 1000

export function ActivityHeroCard({ event, variant = 'default' }: ActivityHeroCardProps) {
  // Hooks must run before any early return to satisfy rules-of-hooks.
  // useState initializer is the React-blessed way to read Date.now() purely.
  const [now] = useState(() => Date.now())
  const isUrgent = variant === 'urgent'
  const isFresh = useMemo(
    () => !isUrgent && (now - new Date(event.created_at).getTime()) < FRESH_THRESHOLD_MS,
    [isUrgent, event.created_at, now],
  )

  const svc = event.service
  if (!svc) return null
  const heroBg = svc.thumbnail_url
    ? `url(${svc.thumbnail_url}) center/cover no-repeat`
    : TYPE_GRADIENT[svc.type]
  const badge = TYPE_BADGE[svc.type]
  const distance = distanceLabel(event.distance_km)
  const startsIn = startsInLabel(event.event_starts_in_seconds)

  return (
    <Box
      borderWidth="1px"
      borderColor={isUrgent ? 'orange.300' : 'gray.200'}
      borderRadius="14px"
      bg="white"
      overflow="hidden"
      transition="all 0.18s ease"
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: isUrgent
          ? '0 12px 24px rgba(245, 158, 11, 0.18)'
          : '0 12px 24px rgba(0, 0, 0, 0.08)',
        borderColor: isUrgent ? 'orange.400' : 'gray.300',
      }}
    >
      <Box position="relative" h="160px" style={{ background: heroBg }}>
        <Box
          position="absolute"
          inset={0}
          background="linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 100%)"
        />
        <Box
          position="absolute"
          top="10px"
          left="10px"
          px="9px"
          py="3px"
          borderRadius="999px"
          fontSize="10px"
          fontWeight={700}
          letterSpacing="0.5px"
          bg={badge.bg}
          color="white"
          zIndex={1}
        >
          {badge.label}
        </Box>
        {isUrgent && event.event_capacity_pct != null && (
          <Box
            position="absolute"
            top="10px"
            right="10px"
            px="9px"
            py="3px"
            borderRadius="999px"
            fontSize="10px"
            fontWeight={700}
            bg="rgba(0,0,0,0.55)"
            color="white"
            zIndex={1}
          >
            {Math.round(event.event_capacity_pct)}% full
          </Box>
        )}
        {isFresh && (
          <Flex
            position="absolute"
            top="10px"
            right="10px"
            align="center"
            gap="5px"
            px="9px"
            py="3px"
            borderRadius="999px"
            fontSize="10px"
            fontWeight={700}
            letterSpacing="0.5px"
            bg="white"
            color="purple.700"
            zIndex={1}
            boxShadow="0 1px 3px rgba(0,0,0,0.2)"
          >
            <Box
              w="6px"
              h="6px"
              borderRadius="full"
              bg="purple.500"
              style={{ animation: 'activityPulse 1.6s ease-in-out infinite' }}
            />
            NEW
          </Flex>
        )}
        <style>{`@keyframes activityPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.85); } }`}</style>
        <Text
          position="absolute"
          bottom="12px"
          left="14px"
          right="14px"
          color="white"
          fontSize="16px"
          fontWeight={800}
          lineHeight={1.2}
          zIndex={1}
          lineClamp={2}
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
        >
          {svc.title}
        </Text>
      </Box>
      <Stack p="14px" gap="10px">
        <Flex align="center" gap={2}>
          <Avatar u={actorAvatarStub(event.actor)} size={28} />
          <Stack gap={0} flex={1} minW={0}>
            <Text fontSize="13px" fontWeight={600} color="gray.900" lineClamp={1}>
              {actorName(event.actor)} {isUrgent ? 'is hosting' : 'posted'}
            </Text>
            <Text fontSize="11px" color="gray.500" lineClamp={1}>
              {[svc.location_area, distance].filter(Boolean).join(' · ') || 'Online'}
              {startsIn && isUrgent ? ` · ${startsIn}` : ''}
            </Text>
          </Stack>
        </Flex>
        <Flex gap={2}>
          <RouterLink
            to={`/service-detail/${svc.id}`}
            style={{ flex: 1, textDecoration: 'none' }}
          >
            <Box
              textAlign="center"
              py="7px"
              borderRadius="9px"
              bg={isUrgent ? 'orange.500' : 'gray.900'}
              color="white"
              fontSize="12px"
              fontWeight={700}
              _hover={{ bg: isUrgent ? 'orange.600' : 'gray.800' }}
            >
              {isUrgent ? 'Join now' : 'Open'}
            </Box>
          </RouterLink>
        </Flex>
      </Stack>
    </Box>
  )
}
