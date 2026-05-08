import { useCallback, useEffect, useState } from 'react'
import { Box, Flex, Grid, Spinner, Stack, Text } from '@chakra-ui/react'
import { FiMenu, FiNavigation, FiX } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'

import { activityAPI, type ActivityEvent } from '@/services/activityAPI'
import { pulseAPI, type PulseStats as PulseStatsType } from '@/services/pulseAPI'
import { serviceAPI } from '@/services/serviceAPI'
import { userAPI } from '@/services/userAPI'
import { useAuthStore } from '@/store/useAuthStore'
import { useGeoStore } from '@/store/useGeoStore'
import { useAcquireLocation } from '@/hooks/useAcquireLocation'
import {
  GRAY100, GRAY200, GRAY50, GRAY600, GREEN, WHITE,
} from '@/theme/tokens'
import type { Service, UserSummary } from '@/types'

import RecommendationCard from '@/components/pulse/RecommendationCard'
import ActivityEventCard from '@/components/pulse/ActivityEventCard'
import PulseLane from '@/components/pulse/PulseLane'
import PulseSidebar, { type PulseLaneKey } from '@/components/pulse/PulseSidebar'
import EmptyStateHero from '@/components/pulse/EmptyStateHero'
import BigMapModal from '@/components/BigMapModal'
import { SuggestedUserCard } from '@/components/users/SuggestedUserCard'

const FOR_YOU_LIMIT = 6
const WORTH_LOOK_LIMIT = 4
const NEARBY_LIMIT = 3
const EVENTS_LIMIT = 4
const HELP_OTHERS_LIMIT = 4
const PEOPLE_LIMIT = 6
const MAP_POOL_LIMIT = 100

const ALL_LANES: PulseLaneKey[] = [
  'for_you', 'events', 'help_others', 'worth_a_look', 'nearby', 'people', 'follows',
]

export default function PulsePage() {
  useAcquireLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const geoLocation = useGeoStore((state) => state.geoLocation)

  const [forYou, setForYou] = useState<Service[]>([])
  const [worthALook, setWorthALook] = useState<Service[]>([])
  const [following, setFollowing] = useState<ActivityEvent[]>([])
  const [nearby, setNearby] = useState<Service[]>([])
  const [events, setEvents] = useState<Service[]>([])
  const [helpOthers, setHelpOthers] = useState<Service[]>([])
  const [peopleToFollow, setPeopleToFollow] = useState<UserSummary[]>([])
  const [stats, setStats] = useState<PulseStatsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleLanes, setVisibleLanes] = useState<Set<PulseLaneKey>>(
    () => new Set(ALL_LANES),
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Location-enable flow for the Nearby empty state
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  // Map modal state — fetched once, cached after that
  const [mapModalOpen, setMapModalOpen] = useState(false)
  const [mapServices, setMapServices] = useState<Service[] | null>(null)

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
      .then((evts) => evts.filter((e) => e.verb !== 'new_neighbor'))
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

    const eventsP = eligibleForYou
      ? serviceAPI
          .list({
            sort: 'for_you',
            type: 'Event',
            date_from: new Date().toISOString(),
            page_size: EVENTS_LIMIT,
          })
          .catch(() => [] as Service[])
      : Promise.resolve([] as Service[])

    const helpOthersP = eligibleForYou
      ? serviceAPI
          .list({
            sort: 'for_you',
            type: 'Need',
            page_size: HELP_OTHERS_LIMIT,
          })
          .catch(() => [] as Service[])
      : Promise.resolve([] as Service[])

    const peopleP = userAPI
      .getSuggested()
      .then(({ results }) => results.slice(0, PEOPLE_LIMIT))
      .catch(() => [] as UserSummary[])

    const statsP = pulseAPI.getStats().catch(() => null)
    const visitP = pulseAPI.recordVisit().catch(() => null)

    Promise.all([
      forYouP, worthLookP, followingP, nearbyP, eventsP, helpOthersP,
      peopleP, statsP, visitP,
    ])
      .then(([fy, wl, follow, near, evts, helps, people, st]) => {
        if (cancelled) return
        setForYou(fy)
        setWorthALook(wl)
        setFollowing(follow)
        setNearby(near)
        setEvents(evts)
        setHelpOthers(helps)
        setPeopleToFollow(people)
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
    setEvents((cur) => cur.filter((s) => s.id !== serviceId))
    setHelpOthers((cur) => cur.filter((s) => s.id !== serviceId))
  }, [])

  const handleToggleLane = useCallback((lane: PulseLaneKey) => {
    setVisibleLanes((cur) => {
      const next = new Set(cur)
      if (next.has(lane)) next.delete(lane)
      else next.add(lane)
      return next
    })
  }, [])

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported on this device.')
      return
    }
    setLocationLoading(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        useGeoStore.getState().setGeoLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
        localStorage.setItem('locationEnabled', 'true')
        setLocationLoading(false)
      },
      (err) => {
        setLocationError(
          ['Unknown error', 'Permission denied', 'Location unavailable', 'Timed out'][err.code]
            ?? 'Unable to get location',
        )
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
    )
  }, [])

  const handleOpenMap = useCallback(() => {
    setMapModalOpen(true)
    if (mapServices === null) {
      serviceAPI
        .list({ page_size: MAP_POOL_LIMIT })
        .then((rows) => setMapServices(rows))
        .catch((err) => {
          console.error('PulsePage: map pool fetch failed', err)
          setMapServices([])
        })
    }
  }, [mapServices])

  if (!user) return null

  const hero = forYou[0]
  const moreForYou = forYou.slice(1)
  const showOnboardingHero = !eligibleForYou
  const showNoRecsHero = eligibleForYou && !loading && forYou.length === 0
  const showForYou = visibleLanes.has('for_you')
  const showEvents = visibleLanes.has('events')
  const showHelpOthers = visibleLanes.has('help_others')
  const showWorthLook = visibleLanes.has('worth_a_look')
  const showNearby = visibleLanes.has('nearby')
  const showPeople = visibleLanes.has('people')
  const showFollows = visibleLanes.has('follows')

  const userLocation = geoLocation
    ? { lat: geoLocation.latitude, lng: geoLocation.longitude }
    : null

  return (
    <Box
      px={{ base: 0, md: 4 }} py={{ base: 0, md: 3 }}
      bg={GRAY50} minH="100vh"
    >
      <Flex
        w="full"
        maxW="1440px" mx="auto"
        h={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        borderRadius={{ base: 0, md: '20px' }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        bg={WHITE}
        display="flex"
        overflow="hidden"
        position="relative"
      >
        <Box
          display={{ base: sidebarOpen ? 'flex' : 'none', lg: 'flex' }}
          position={{ base: 'absolute', lg: 'relative' }}
          zIndex={{ base: 20, lg: 'auto' }}
          top={0} left={0} bottom={0}
          flexShrink={0}
        >
          <PulseSidebar
            stats={stats}
            visibleLanes={visibleLanes}
            onToggleLane={handleToggleLane}
            onOpenMap={handleOpenMap}
          />
        </Box>

        {sidebarOpen && (
          <Box
            display={{ base: 'block', lg: 'none' }}
            position="absolute" inset={0} zIndex={10}
            bg="rgba(0,0,0,0.4)"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Flex direction="column" flex={1} h="100%" overflow="hidden" minW={0} bg={GRAY50}>
          <Flex
            display={{ base: 'flex', lg: 'none' }}
            align="center" gap={2}
            px={3} py="10px" bg={WHITE}
            borderBottom={`1px solid ${GRAY200}`} flexShrink={0}
          >
            <Box
              as="button"
              alignItems="center" justifyContent="center"
              w="34px" h="34px" borderRadius="9px"
              bg={GRAY100} color={GRAY600}
              display="flex"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              {sidebarOpen ? <FiX size={16} /> : <FiMenu size={16} />}
            </Box>
            <Text fontSize="15px" fontWeight={700}>Pulse</Text>
          </Flex>

          {error ? (
            <Box mx={{ base: 4, md: 6 }} mt={4} p={3} bg="red.50" color="red.700" borderRadius="md">
              {error}
            </Box>
          ) : null}

          <Box flex={1} overflowY="auto" px={{ base: 4, md: 6 }} py={{ base: 4, md: 6 }}>
            {loading ? (
              <Flex justify="center" py={16}>
                <Spinner size="lg" color={GREEN} />
              </Flex>
            ) : (
              <Stack gap={2}>
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

                {showForYou && eligibleForYou && moreForYou.length > 0 ? (
                  <PulseLane label="More for you" childCount={moreForYou.length}>
                    <Grid
                      templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
                      gap={3}
                    >
                      {moreForYou.map((s) => (
                        <RecommendationCard
                          key={s.id}
                          service={s}
                          lane="for_you"
                          onDismissed={handleDismissed}
                        />
                      ))}
                    </Grid>
                  </PulseLane>
                ) : null}

                {showEvents && events.length > 0 ? (
                  <PulseLane label="Events for you" childCount={events.length}>
                    <Grid
                      templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
                      gap={3}
                    >
                      {events.map((s) => (
                        <RecommendationCard
                          key={s.id}
                          service={s}
                          lane="events"
                          onDismissed={handleDismissed}
                        />
                      ))}
                    </Grid>
                  </PulseLane>
                ) : null}

                {showHelpOthers && helpOthers.length > 0 ? (
                  <PulseLane
                    label="Help others"
                    hint="Neighbours looking for a hand"
                    childCount={helpOthers.length}
                  >
                    <Grid
                      templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
                      gap={3}
                    >
                      {helpOthers.map((s) => (
                        <RecommendationCard
                          key={s.id}
                          service={s}
                          lane="help_others"
                          onDismissed={handleDismissed}
                        />
                      ))}
                    </Grid>
                  </PulseLane>
                ) : null}

                {showWorthLook && worthALook.length > 0 ? (
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

                {showNearby ? (
                  hasGeo ? (
                    <PulseLane label="Nearby" childCount={nearby.length}>
                      <Grid
                        templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
                        gap={3}
                      >
                        {nearby.map((s) => (
                          <RecommendationCard
                            key={s.id}
                            service={s}
                            lane="nearby"
                            onDismissed={handleDismissed}
                          />
                        ))}
                      </Grid>
                    </PulseLane>
                  ) : (
                    <PulseLane label="Nearby" childCount={0} emptyState={
                      <Box
                        bg={WHITE}
                        borderWidth="1px"
                        borderColor="gray.200"
                        borderRadius="14px"
                        p={5}
                      >
                        <Text fontSize="14px" fontWeight={700} color="gray.900" mb={1}>
                          See what's around you
                        </Text>
                        <Text fontSize="12px" color="gray.600" mb={3}>
                          Enable location to surface neighbours within walking distance.
                        </Text>
                        <Flex align="center" gap={3} flexWrap="wrap">
                          <Box
                            as="button"
                            onClick={() => { if (!locationLoading) requestLocation() }}
                            aria-disabled={locationLoading}
                            px={5}
                            py="9px"
                            borderRadius="9999px"
                            bg={GREEN}
                            color={WHITE}
                            fontSize="13px"
                            fontWeight={700}
                            display="flex"
                            alignItems="center"
                            gap="6px"
                            style={{
                              opacity: locationLoading ? 0.7 : 1,
                              cursor: locationLoading ? 'not-allowed' : 'pointer',
                            }}
                            _hover={locationLoading ? undefined : { opacity: 0.9 }}
                            transition="opacity 0.15s"
                            aria-label="Enable location"
                          >
                            {locationLoading ? <Spinner size="xs" color={WHITE} /> : <FiNavigation size={13} />}
                            {locationLoading ? 'Getting location…' : 'Enable location'}
                          </Box>
                          {locationError ? (
                            <Text fontSize="12px" color="red.600">{locationError}</Text>
                          ) : null}
                        </Flex>
                      </Box>
                    }>
                      {null}
                    </PulseLane>
                  )
                ) : null}

                {showPeople && peopleToFollow.length > 0 ? (
                  <Box>
                    <PulseLane
                      label="People to follow"
                      hint="Ranked by shared skills + karma"
                      layout="horizontal"
                      childCount={peopleToFollow.length}
                    >
                      {peopleToFollow.map((u) => (
                        <Box key={u.id} minW="240px" maxW="280px">
                          <SuggestedUserCard user={u} />
                        </Box>
                      ))}
                    </PulseLane>
                    <Flex justify="flex-end" mt={2}>
                      <Box
                        as="button"
                        fontSize="12px"
                        color={GREEN}
                        fontWeight={600}
                        onClick={() => navigate('/users/suggested')}
                        cursor="pointer"
                        _hover={{ textDecoration: 'underline' }}
                      >
                        See all suggestions →
                      </Box>
                    </Flex>
                  </Box>
                ) : null}

                {showFollows ? (
                  <PulseLane
                    label="From your follows"
                    childCount={following.length}
                    emptyState={
                      <Box
                        p={4} bg="gray.50" borderRadius="md"
                        borderWidth="1px" borderColor="gray.200"
                      >
                        <Text fontSize="13px" color="gray.700">
                          Follow some people to fill this lane with their activity.
                        </Text>
                      </Box>
                    }
                  >
                    <Stack gap={3}>
                      {following.slice(0, 5).map((event) => (
                        <ActivityEventCard key={event.id} event={event} />
                      ))}
                    </Stack>
                  </PulseLane>
                ) : null}
              </Stack>
            )}
          </Box>
        </Flex>
      </Flex>

      <BigMapModal
        isOpen={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        services={mapServices ?? []}
        loading={mapServices === null}
        userLocation={userLocation}
      />
    </Box>
  )
}
