import { useEffect, useState } from 'react'
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'
import { FiActivity, FiUserPlus, FiCheckCircle, FiFileText } from 'react-icons/fi'

import { useGeoStore } from '@/store/useGeoStore'
import { activityAPI, type ActivityEvent } from '@/services/activityAPI'

function formatTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.max(1, Math.floor((Date.now() - then) / 60000))
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h ago`
  return `${Math.floor(diffMin / 1440)}d ago`
}

function actorName(a: ActivityEvent['actor']): string {
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Someone'
}

function VerbIcon({ verb }: { verb: ActivityEvent['verb'] }) {
  if (verb === 'service_created') return <FiFileText />
  if (verb === 'handshake_accepted') return <FiCheckCircle />
  return <FiUserPlus />
}

function describe(event: ActivityEvent): { text: string; href: string | null } {
  const actor = actorName(event.actor)
  if (event.verb === 'service_created' && event.service) {
    return {
      text: `${actor} posted ${event.service.title}`,
      href: `/service-detail/${event.service.id}`,
    }
  }
  if (event.verb === 'handshake_accepted' && event.service) {
    return {
      text: `${actor} is joining ${event.service.title}`,
      href: `/service-detail/${event.service.id}`,
    }
  }
  if (event.verb === 'user_followed' && event.target_user) {
    return {
      text: `${actor} started following ${actorName(event.target_user)}`,
      href: `/public-profile/${event.target_user.id}`,
    }
  }
  return { text: `${actor} did something`, href: null }
}

export default function ActivityPage() {
  const geoLocation = useGeoStore(state => state.geoLocation)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const lat = geoLocation?.latitude
  const lng = geoLocation?.longitude
  const hasLocation = lat != null && lng != null && (lat !== 0 || lng !== 0)

  useEffect(() => {
    let cancelled = false
    activityAPI
      .feed({
        lat: hasLocation ? lat : undefined,
        lng: hasLocation ? lng : undefined,
        days: 14,
      })
      .then(rows => {
        if (!cancelled) setEvents(rows)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load activity right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [hasLocation, lat, lng])

  return (
    <Box maxW="640px" mx="auto" px={4} py={6}>
      <Flex align="center" mb={4} gap={2}>
        <FiActivity />
        <Text fontSize="xl" fontWeight="800" color="gray.900">
          Activity
        </Text>
      </Flex>
      <Text fontSize="sm" color="gray.600" mb={4}>
        What people you follow and folks in your area have been up to.
      </Text>

      {loading ? (
        <Flex h="120px" align="center" justify="center">
          <Spinner color="purple.500" />
        </Flex>
      ) : error ? (
        <Box bg="red.50" p={3} borderRadius="md">
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      ) : events.length === 0 ? (
        <Box bg="gray.50" p={6} borderRadius="md">
          <Text fontSize="sm" color="gray.600">
            Nothing here yet. Follow some people or enable location to see events from your area.
          </Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {events.map(event => {
            const d = describe(event)
            const card = (
              <Flex
                align="center"
                gap={3}
                p={3}
                borderRadius="lg"
                bg="white"
                borderWidth="1px"
                borderColor="gray.200"
                _hover={d.href ? { bg: 'gray.50', cursor: 'pointer' } : {}}
              >
                <Box color="purple.500">
                  <VerbIcon verb={event.verb} />
                </Box>
                <Box flex="1">
                  <Text fontSize="sm" color="gray.900">{d.text}</Text>
                  <Text fontSize="xs" color="gray.500">{formatTime(event.created_at)}</Text>
                </Box>
              </Flex>
            )
            if (d.href) {
              return (
                <RouterLink key={event.id} to={d.href} style={{ textDecoration: 'none' }}>
                  {card}
                </RouterLink>
              )
            }
            return <Box key={event.id}>{card}</Box>
          })}
        </Stack>
      )}
    </Box>
  )
}
