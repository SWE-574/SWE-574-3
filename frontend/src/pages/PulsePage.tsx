import { useCallback, useEffect, useState } from 'react'
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { FiActivity } from 'react-icons/fi'

import { activityAPI, type ActivityEvent } from '@/services/activityAPI'
import { pulseAPI, type PulseStats as PulseStatsType } from '@/services/pulseAPI'
import { serviceAPI } from '@/services/serviceAPI'
import { useAuthStore } from '@/store/useAuthStore'
import { useGeoStore } from '@/store/useGeoStore'
import { useAcquireLocation } from '@/hooks/useAcquireLocation'
import type { Service } from '@/types'

import RecommendationCard from '@/components/pulse/RecommendationCard'
import ActivityEventCard from '@/components/pulse/ActivityEventCard'
import PulseLane from '@/components/pulse/PulseLane'
import PulseStats from '@/components/pulse/PulseStats'
import EmptyStateHero from '@/components/pulse/EmptyStateHero'

const FOR_YOU_LIMIT = 6
const WORTH_LOOK_LIMIT = 4
const NEARBY_LIMIT = 3

export default function PulsePage() {
  useAcquireLocation()
  const user = useAuthStore((state) => state.user)
  const geoLocation = useGeoStore((state) => state.geoLocation)

  const [forYou, setForYou] = useState<Service[]>([])
  const [worthALook, setWorthALook] = useState<Service[]>([])
  const [following, setFollowing] = useState<ActivityEvent[]>([])
  const [nearby, setNearby] = useState<Service[]>([])
  const [stats, setStats] = useState<PulseStatsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const eligibleForYou = Boolean(user?.is_onboarded && user?.skills?.length)
  const hasGeo = Boolean(geoLocation?.latitude && geoLocation?.longitude)

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const forYouP = eligibleForYou
      ? serviceAPI
          .list({ sort: 'for_you', page_size: FOR_YOU_LIMIT })
          .catch(() => [] as Service[])
      : Promise.resolve([] as Service[])

    const worthLookP = eligibleForYou
      ? serviceAPI
          .list({
            sort: 'for_you',
            explore_only: true,
            page_size: WORTH_LOOK_LIMIT,
          })
          .catch(() => [] as Service[])
      : Promise.resolve([] as Service[])

    const followingP = activityAPI
      .feed({ days: 7 })
      .then((events) => events.filter((e) => e.verb !== 'new_neighbor'))
      .catch(() => [] as ActivityEvent[])

    const nearbyP = hasGeo
      ? serviceAPI
          .list({
            lat: geoLocation!.latitude,
            lng: geoLocation!.longitude,
            distance: 3,
            page_size: NEARBY_LIMIT,
          })
          .catch(() => [] as Service[])
      : Promise.resolve([] as Service[])

    const statsP = pulseAPI.getStats().catch(() => null)
    const visitP = pulseAPI.recordVisit().catch(() => null)

    Promise.all([forYouP, worthLookP, followingP, nearbyP, statsP, visitP])
      .then(([fy, wl, follow, near, st]) => {
        if (cancelled) return
        setForYou(fy)
        setWorthALook(wl)
        setFollowing(follow)
        setNearby(near)
        setStats(st)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('PulsePage: load failed', err)
        setError('We could not load your Pulse. Try refreshing.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, eligibleForYou, hasGeo, geoLocation])

  const handleDismissed = useCallback((serviceId: string) => {
    setForYou((cur) => cur.filter((s) => s.id !== serviceId))
    setWorthALook((cur) => cur.filter((s) => s.id !== serviceId))
    setNearby((cur) => cur.filter((s) => s.id !== serviceId))
  }, [])

  if (!user) return null

  const hero = forYou[0]
  const moreForYou = forYou.slice(1)
  const showOnboardingHero = !eligibleForYou
  const showNoRecsHero = eligibleForYou && !loading && forYou.length === 0

  return (
    <Box maxW="900px" mx="auto" px={{ base: 4, md: 6 }} py={6}>
      <Flex align="center" gap={2} mb={2}>
        <Box as={FiActivity} color="purple.500" />
        <Text fontSize="2xl" fontWeight={700} color="gray.900">
          Pulse
        </Text>
      </Flex>
      <PulseStats stats={stats} />

      {error ? (
        <Box mt={4} p={3} bg="red.50" color="red.700" borderRadius="md">
          {error}
        </Box>
      ) : null}

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner size="lg" color="purple.500" />
        </Flex>
      ) : (
        <Stack mt={4} gap={2}>
          {showOnboardingHero ? (
            <EmptyStateHero reason="no_skills" />
          ) : showNoRecsHero ? (
            <EmptyStateHero reason="no_recommendations" />
          ) : hero ? (
            <RecommendationCard
              service={hero}
              lane="hero"
              variant="hero"
              onDismissed={handleDismissed}
            />
          ) : null}

          {eligibleForYou && moreForYou.length > 0 ? (
            <PulseLane label="More for you" childCount={moreForYou.length}>
              {moreForYou.map((s) => (
                <RecommendationCard
                  key={s.id}
                  service={s}
                  lane="for_you"
                  onDismissed={handleDismissed}
                />
              ))}
            </PulseLane>
          ) : null}

          <PulseLane
            label="From your follows"
            childCount={following.length}
            emptyState={
              <Box
                p={4}
                bg="gray.50"
                borderRadius="md"
                borderWidth="1px"
                borderColor="gray.200"
              >
                <Text fontSize="13px" color="gray.700">
                  Follow some people to fill this lane with their activity.
                </Text>
              </Box>
            }
          >
            {following.slice(0, 5).map((event) => (
              <ActivityEventCard key={event.id} event={event} />
            ))}
          </PulseLane>

          {worthALook.length > 0 ? (
            <PulseLane
              label="Worth a look"
              hint="Picks the engine wants to surface"
              layout="horizontal"
              childCount={worthALook.length}
            >
              {worthALook.map((s) => (
                <Box key={s.id} minW="280px" maxW="320px">
                  <RecommendationCard
                    service={s}
                    lane="worth_a_look"
                    onDismissed={handleDismissed}
                  />
                </Box>
              ))}
            </PulseLane>
          ) : null}

          {hasGeo ? (
            <PulseLane label="Nearby" childCount={nearby.length}>
              {nearby.map((s) => (
                <RecommendationCard
                  key={s.id}
                  service={s}
                  lane="nearby"
                  onDismissed={handleDismissed}
                />
              ))}
            </PulseLane>
          ) : (
            <Box
              mt={6}
              p={3}
              borderRadius="md"
              borderWidth="1px"
              borderColor="gray.200"
              bg="gray.50"
            >
              <Text fontSize="12px" color="gray.600">
                Enable location to surface neighbours.
              </Text>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  )
}
