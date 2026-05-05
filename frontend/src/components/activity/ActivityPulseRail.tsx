import { useEffect, useState } from 'react'
import { Box, Flex, HStack, Skeleton, Stack, Text } from '@chakra-ui/react'
import { FiActivity, FiChevronDown, FiChevronUp, FiMapPin, FiNavigation } from 'react-icons/fi'
import { Link as RouterLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { activityAPI, type ActivityEvent } from '@/services/activityAPI'
import { actorAvatarStub, actorName, distanceLabel } from './shared'

const REFRESH_MS = 60_000

interface ActivityPulseRailProps {
  lat?: number
  lng?: number
}

function pulseLine(event: ActivityEvent): string {
  if (event.verb === 'service_created' && event.service) {
    return event.service.type === 'Event'
      ? `posted an event - ${event.service.title}`
      : `posted ${event.service.type === 'Need' ? 'a need' : 'an offer'}`
  }
  if (event.verb === 'handshake_accepted' && event.service) {
    return `joined "${event.service.title}"`
  }
  if (event.verb === 'handshake_completed' && event.service) {
    return `finished "${event.service.title}"`
  }
  if (event.verb === 'event_filling_up' && event.service) {
    return `event filling up: ${event.service.title}`
  }
  if (event.verb === 'new_neighbor') return 'just joined the hive'
  if (event.verb === 'user_followed') return 'made a new connection'
  return 'is active'
}

function pulseHref(event: ActivityEvent): string {
  if (event.service) return `/service-detail/${event.service.id}`
  return `/public-profile/${event.actor.id}`
}

function timeAgo(iso: string): string {
  const m = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function ActivityPulseRail({ lat, lng }: ActivityPulseRailProps) {
  const hasLoc = lat != null && lng != null && (lat !== 0 || lng !== 0)
  const [pulses, setPulses] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(hasLoc)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!hasLoc) return
    let cancelled = false
    const load = () => {
      activityAPI
        .feed({ lat, lng, sort: 'nearby' })
        .then(rows => {
          if (!cancelled) setPulses(rows)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [hasLoc, lat, lng])

  const empty = !loading && pulses.length === 0

  return (
    <Box
      position="sticky"
      top="20px"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="14px"
      p="14px"
    >
      <Flex
        align="center"
        gap={2}
        mb={collapsed ? 0 : "12px"}
        cursor="pointer"
        onClick={() => setCollapsed(c => !c)}
      >
        <Box as={FiActivity} color="purple.500" />
        <Text fontSize="13px" fontWeight={700} color="gray.900" flex={1}>
          Active near you
        </Text>
        <Box as={collapsed ? FiChevronDown : FiChevronUp} color="gray.500" />
      </Flex>
      {!collapsed && (
        <>
          {!hasLoc ? (
            <Box
              p="14px"
              borderRadius="12px"
              bg="linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)"
              borderWidth="1px"
              borderColor="purple.100"
            >
              <Flex align="center" gap="8px" mb="6px" color="purple.700">
                <Box as={FiMapPin} fontSize="16px" />
                <Text fontSize="12px" fontWeight={700}>Tune in to your area</Text>
              </Flex>
              <Text fontSize="11px" color="gray.600" mb="10px" lineHeight={1.45}>
                Enable location and you'll see what people are up to within walking distance.
              </Text>
              <RouterLink to="/dashboard" style={{ textDecoration: 'none' }}>
                <Box
                  display="inline-flex"
                  alignItems="center"
                  gap="5px"
                  px="10px"
                  py="5px"
                  borderRadius="8px"
                  bg="purple.500"
                  color="white"
                  fontSize="11px"
                  fontWeight={700}
                  _hover={{ bg: 'purple.600' }}
                >
                  <Box as={FiNavigation} />
                  Enable on dashboard
                </Box>
              </RouterLink>
            </Box>
          ) : loading ? (
            <Stack gap="10px">
              {[0, 1, 2].map(i => (
                <HStack key={i} gap={2}>
                  <Skeleton boxSize="32px" borderRadius="full" />
                  <Stack gap={1} flex={1}>
                    <Skeleton h="10px" w="70%" />
                    <Skeleton h="9px" w="50%" />
                  </Stack>
                </HStack>
              ))}
            </Stack>
          ) : empty ? (
            <Text fontSize="12px" color="gray.500">
              No one's active near you right now.
            </Text>
          ) : (
            <Stack gap="10px">
              {pulses.map(p => (
                <RouterLink
                  key={p.id}
                  to={pulseHref(p)}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <Flex
                    align="flex-start"
                    gap="8px"
                    borderRadius="9px"
                    p="6px"
                    mx="-6px"
                    _hover={{ bg: 'gray.50' }}
                  >
                    <Avatar u={actorAvatarStub(p.actor)} size={32} />
                    <Stack gap={0} flex={1} minW={0}>
                      <Text fontSize="12px" fontWeight={600} color="gray.900" lineClamp={1}>
                        {actorName(p.actor)}
                      </Text>
                      <Text fontSize="11px" color="gray.600" lineClamp={1}>
                        {pulseLine(p)}
                      </Text>
                      <Flex gap="6px" align="center" mt="1px">
                        {p.distance_km != null && (
                          <Text fontSize="10px" color="purple.600" fontWeight={600}>
                            {distanceLabel(p.distance_km)}
                          </Text>
                        )}
                        <Text fontSize="10px" color="gray.400">
                          {timeAgo(p.created_at)} ago
                        </Text>
                      </Flex>
                    </Stack>
                  </Flex>
                </RouterLink>
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  )
}
