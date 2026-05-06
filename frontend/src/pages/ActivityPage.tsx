import { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { FiActivity } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

import { useGeoStore } from '@/store/useGeoStore'
import { useAuthStore } from '@/store/useAuthStore'
import { activityAPI, type ActivityEvent } from '@/services/activityAPI'
import { userAPI } from '@/services/userAPI'
import { useAcquireLocation } from '@/hooks/useAcquireLocation'

import { ActivityFilterChips, type ActivityFilter } from '@/components/activity/ActivityFilterChips'
import { ActivityDayHeader } from '@/components/activity/ActivityDayHeader'
import { ActivityCard } from '@/components/activity/dispatcher'
import { applyFilter } from '@/components/activity/applyFilter'
import { ActivityPulseRail } from '@/components/activity/ActivityPulseRail'
import { ActivityHeaderStats } from '@/components/activity/ActivityHeaderStats'

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayBucketLabel(eventTs: number, today: number): string {
  const oneDay = 86_400_000
  const diff = today - eventTs
  if (diff <= 0) return 'Today'
  if (diff <= oneDay) return 'Yesterday'
  if (diff <= oneDay * 6) return `${Math.floor(diff / oneDay) + 1} days ago`
  return new Date(eventTs).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

interface DayGroup {
  label: string
  events: ActivityEvent[]
}

function groupByDay(events: ActivityEvent[]): DayGroup[] {
  const today = startOfDay(new Date())
  const buckets = new Map<string, DayGroup>()
  const order: string[] = []
  for (const ev of events) {
    const eventTs = startOfDay(new Date(ev.created_at))
    const label = dayBucketLabel(eventTs, today)
    if (!buckets.has(label)) {
      buckets.set(label, { label, events: [] })
      order.push(label)
    }
    buckets.get(label)!.events.push(ev)
  }
  return order.map(o => buckets.get(o)!)
}


export default function ActivityPage() {
  const navigate = useNavigate()
  useAcquireLocation()
  const geoLocation = useGeoStore(state => state.geoLocation)
  const user = useAuthStore(state => state.user)

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())

  const lat = geoLocation?.latitude
  const lng = geoLocation?.longitude
  const hasLocation = geoLocation != null

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    userAPI
      .getFollowing(user.id)
      .then(rows => {
        if (cancelled) return
        setFollowingIds(new Set(rows.map(r => r.id)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.id])

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

  const filtered = useMemo(
    () => applyFilter(events, filter, followingIds),
    [events, filter, followingIds],
  )
  const grouped = useMemo(() => groupByDay(filtered), [filtered])

  const filterCounts = useMemo(() => ({
    all: events.length,
    following: applyFilter(events, 'following', followingIds).length,
    nearby: applyFilter(events, 'nearby', followingIds).length,
    recent: applyFilter(events, 'recent', followingIds).length,
  }), [events, followingIds])

  return (
    <Box
      minH="calc(100vh - 64px)"
      style={{
        background: 'linear-gradient(180deg, #fafaff 0%, #f5f3ff 35%, #fafafa 100%)',
      }}
    >
      <Box maxW="1280px" mx="auto" px={{ base: 4, md: 6 }} py={8}>
        <Flex align="center" mb={2} gap={2}>
          <Box
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            w="38px"
            h="38px"
            borderRadius="12px"
            bg="linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)"
            color="purple.600"
          >
            <Box as={FiActivity} fontSize="20px" />
          </Box>
          <Text fontSize="2xl" fontWeight={800} color="gray.900">
            Activity
          </Text>
        </Flex>
        <Text fontSize="sm" color="gray.600" mb={5}>
          What people you follow and folks in your area have been up to.
          {!hasLocation && user && (
            <Text as="span" color="purple.700" fontWeight={600}>
              {' '}Enable location to widen the feed.
            </Text>
          )}
        </Text>

        <ActivityHeaderStats events={events} />
        <ActivityFilterChips active={filter} counts={filterCounts} onChange={setFilter} />

        <Flex gap={6} align="flex-start">
        <Box flex={1} minW={0}>
          {loading ? (
            <Flex h="160px" align="center" justify="center">
              <Spinner color="purple.500" />
            </Flex>
          ) : error ? (
            <Box bg="red.50" p={4} borderRadius="md">
              <Text fontSize="sm" color="red.700">{error}</Text>
            </Box>
          ) : grouped.length === 0 ? (
            <Box
              bg="purple.50"
              borderWidth="1px"
              borderColor="purple.100"
              borderRadius="14px"
              p={6}
            >
              <Text fontSize="sm" color="gray.700" mb={3}>
                Quiet day in the hive. Follow more people or zoom out to see broader activity.
              </Text>
              <Box
                as="button"
                onClick={() => navigate('/users/suggested')}
                px="14px"
                py="7px"
                borderRadius="9px"
                bg="purple.500"
                color="white"
                fontSize="12px"
                fontWeight={700}
                _hover={{ bg: 'purple.600' }}
                cursor="pointer"
              >
                Find people to follow
              </Box>
            </Box>
          ) : (
            <Stack gap={3}>
              {grouped.map(group => (
                <Box key={group.label}>
                  <ActivityDayHeader label={group.label} count={group.events.length} />
                  <Stack gap={3}>
                    {group.events.map(event => (
                      <ActivityCard key={event.id} event={event} />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Box>

          <Box w="320px" flexShrink={0} display={{ base: 'none', lg: 'block' }}>
            <ActivityPulseRail
              lat={hasLocation ? lat : undefined}
              lng={hasLocation ? lng : undefined}
            />
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}
