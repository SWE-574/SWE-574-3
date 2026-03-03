import { useState, useEffect, useCallback, useRef } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  Grid,
  VStack,
  HStack,
  Badge,
  Spinner,
} from '@chakra-ui/react'
import {
  FiSearch,
  FiNavigation,
  FiMapPin,
  FiClock,
  FiUsers,
  FiMonitor,
  FiCalendar,
  FiLoader,
  FiRefreshCw,
} from 'react-icons/fi'
import { MapView } from '@/components/MapView'
import { serviceAPI } from '@/services/serviceAPI'
import { handshakeAPI } from '@/services/handshakeAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'
import type { Handshake } from '@/services/handshakeAPI'

const YELLOW = '#F8C84A'
const GREEN = '#2D5C4E'
const ORANGE = '#f97316'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHours(h: number | string | undefined | null) {
  const n = typeof h === 'string' ? parseFloat(h) : (h ?? 0)
  if (isNaN(n)) return '?'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function userInitials(u?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!u) return '?'
  const f = u.first_name?.[0] ?? ''
  const l = u.last_name?.[0] ?? ''
  if (f || l) return `${f}${l}`.toUpperCase()
  return (u.email?.[0] ?? '?').toUpperCase()
}

function userName(u?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!u) return 'User'
  const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return name || u.email || 'User'
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all', label: 'All Services' },
  { id: 'weekend', label: 'This Weekend' },
  { id: 'online', label: 'Online Only' },
  { id: 'recurrent', label: 'Recurrent' },
  { id: 'newest', label: 'Newest' },
]

const DEBOUNCE_SEARCH = 400
const DEBOUNCE_DISTANCE = 600
const POLL_INTERVAL = 30_000
const GEO_TIMEOUT = 10_000

// ─── Component ────────────────────────────────────────────────────────────────
// ─── Handshake status badge config ───────────────────────────────────────────
const HANDSHAKE_BADGE: Record<
  Handshake['status'],
  { label: string; bg: string; color: string }
> = {
  pending:   { label: 'Interested',  bg: '#fef9c3', color: '#854d0e' },
  accepted:  { label: 'Accepted',    bg: '#dcfce7', color: '#166534' },
  completed: { label: 'Completed',   bg: '#d1fae5', color: '#065f46' },
  denied:    { label: 'Declined',    bg: '#fee2e2', color: '#991b1b' },
  cancelled: { label: 'Cancelled',   bg: '#f3f4f6', color: '#6b7280' },
  reported:  { label: 'Reported',    bg: '#fee2e2', color: '#991b1b' },
  paused:    { label: 'Paused',      bg: '#e0f2fe', color: '#0369a1' },
}

// ─── Component ────────────────────────────────────────────────────────────────
const DashboardPage = () => {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [services, setServices] = useState<Service[]>([])

  // Location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [distanceKm, setDistanceKm] = useState(10)
  const [debouncedDistance, setDebouncedDistance] = useState(10)
  const [locationEnabled, setLocationEnabled] = useState(() => localStorage.getItem('locationEnabled') === 'true')
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  // Outgoing: services I expressed interest in → serviceId → Handshake
  const [handshakeMap, setHandshakeMap] = useState<Map<string, Handshake>>(new Map())
  // Incoming: requests on MY services → serviceId → Handshake[]
  const [incomingMap, setIncomingMap] = useState<Map<string, Handshake[]>>(new Map())

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const distanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), DEBOUNCE_SEARCH)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery])

  // Debounce distance
  useEffect(() => {
    if (distanceTimer.current) clearTimeout(distanceTimer.current)
    distanceTimer.current = setTimeout(() => setDebouncedDistance(distanceKm), DEBOUNCE_DISTANCE)
    return () => { if (distanceTimer.current) clearTimeout(distanceTimer.current) }
  }, [distanceKm])

  // ── Services polling ──────────────────────────────────────────────────────
  const fetchServices = useCallback(async (signal: AbortSignal) => {
    const params =
      locationEnabled && userLocation
        ? { lat: userLocation.lat, lng: userLocation.lng, distance: debouncedDistance }
        : undefined

    const data = await serviceAPI.list(params, signal)
    // Backend already sends status='Active', but guard against stale cache or edge cases
    const active = data.filter((s) => s.status?.toLowerCase() === 'active')
    const unique = Array.from(new Map(active.map((s) => [s.id, s])).values())

    let filtered = unique
    if (activeFilter === 'online') {
      filtered = filtered.filter((s) => s.location_type === 'Online')
    } else if (activeFilter === 'recurrent') {
      filtered = filtered.filter((s) => s.schedule_type === 'Recurrent')
    } else if (activeFilter === 'newest') {
      filtered = [...filtered].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    } else if (activeFilter === 'weekend') {
      filtered = filtered.filter((s) => {
        const details = s.schedule_details?.toLowerCase() ?? ''
        return details.includes('saturday') || details.includes('sunday') || details.includes('weekend')
      })
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags?.some((t) => t.name.toLowerCase().includes(q)),
      )
    }
    setServices(filtered)
  }, [activeFilter, debouncedSearch, locationEnabled, userLocation, debouncedDistance])

  const { isLoading, error: fetchError } = usePolling(
    fetchServices,
    [fetchServices],
    { interval: POLL_INTERVAL },
  )

  // ── Handshakes polling (silent, no loading state needed) ──────────────────
  const fetchHandshakes = useCallback(async (signal: AbortSignal) => {
    if (!isAuthenticated) {
      setHandshakeMap(new Map())
      setIncomingMap(new Map())
      return
    }
    const list = await handshakeAPI.list(signal)
    const outgoing = new Map<string, Handshake>()
    const incoming = new Map<string, Handshake[]>()
    list.forEach((h) => {
      const svcId =
        typeof h.service === 'string'
          ? h.service
          : typeof h.service === 'object' && h.service && 'id' in h.service
            ? (h.service as { id: string }).id
            : undefined
      if (!svcId) return
      if (h.requester === user?.id) {
        outgoing.set(svcId, h)
      } else {
        const arr = incoming.get(svcId) ?? []
        arr.push(h)
        incoming.set(svcId, arr)
      }
    })
    setHandshakeMap(outgoing)
    setIncomingMap(incoming)
  }, [isAuthenticated, user?.id])

  usePolling(fetchHandshakes, [fetchHandshakes], {
    interval: POLL_INTERVAL,
    enabled: isAuthenticated,
  })

  // Request geolocation
  const requestLocation = useCallback(() => {
    setLocationLoading(true)
    setLocationError(null)
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      setLocationLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationEnabled(true)
        localStorage.setItem('locationEnabled', 'true')
        setLocationLoading(false)
      },
      (err) => {
        const msgs: Record<number, string> = {
          [err.PERMISSION_DENIED]: 'Location permission denied',
          [err.POSITION_UNAVAILABLE]: 'Location information unavailable',
          [err.TIMEOUT]: 'Location request timed out',
        }
        setLocationError(msgs[err.code] ?? 'Unable to get your location')
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT, maximumAge: 300_000 },
    )
  }, [])

  const toggleLocation = useCallback(() => {
    if (locationEnabled) {
      setLocationEnabled(false)
      localStorage.setItem('locationEnabled', 'false')
    } else if (userLocation) {
      setLocationEnabled(true)
      localStorage.setItem('locationEnabled', 'true')
    } else {
      requestLocation()
    }
  }, [locationEnabled, userLocation, requestLocation])

  const distanceLabel =
    distanceKm <= 5 ? 'Nearby' : distanceKm <= 15 ? 'Local Area' : distanceKm <= 30 ? 'Wider Area' : 'City-wide'

  return (
    <Box minH="100vh" bg="gray.50">
      {/* ── Page header ── */}
      <Box maxW="1440px" mx="auto" px={8} pt={8} pb={2}>
        <Text as="h1" fontSize="2xl" fontWeight="800" color="gray.900" mb={1}>
          Browse Services
        </Text>
        <Text color="gray.500" fontSize="sm">
          Discover what your community has to offer and share
        </Text>
      </Box>

      <Box maxW="1440px" mx="auto" px={8} pb={12}>
        {/* ── Map ── */}
        <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" p={4} mb={8}>
          <Flex align="center" justify="space-between" mb={3}>
            <Text fontWeight="600" color="gray.900">
              Map View
            </Text>
            <HStack gap={4} fontSize="sm">
              <Flex align="center" gap={2}>
                <Box w={3} h={3} borderRadius="full" bg="green.400" />
                <Text color="gray.500">Offers</Text>
              </Flex>
              <Flex align="center" gap={2}>
                <Box w={3} h={3} borderRadius="full" bg="blue.400" />
                <Text color="gray.500">Wants</Text>
              </Flex>
            </HStack>
          </Flex>
          <MapView
            services={services}
            height="380px"
            onServiceClick={(id) => navigate(`/service-detail/${id}`)}
          />
        </Box>

        {/* ── Controls ── */}
        <VStack gap={4} mb={6} align="stretch">
          {/* Search input */}
          <Flex
            align="center"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            overflow="hidden"
            _focusWithin={{ borderColor: ORANGE, boxShadow: `0 0 0 2px ${ORANGE}22` }}
          >
            <Box px={3} color="gray.400">
              <FiSearch size={17} />
            </Box>
            <Input
              placeholder="Search services, skills, or tags…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              border="none"
              outline="none"
              _focus={{ boxShadow: 'none' }}
              flex={1}
            />
          </Flex>

          {/* Distance filter */}
          <Box bg="white" borderRadius="lg" border="1px solid" borderColor="gray.200" p={4}>
            <Flex align="center" justify="space-between" mb={3}>
              <Flex align="center" gap={2}>
                <FiNavigation size={17} color={ORANGE} />
                <Text fontWeight={500} color="gray.900" fontSize="sm">
                  Search by Distance
                </Text>
              </Flex>
              <Button
                size="sm"
                onClick={toggleLocation}
                disabled={locationLoading}
                style={{
                  background: locationEnabled ? ORANGE : 'transparent',
                  color: locationEnabled ? '#fff' : '#374151',
                  border: locationEnabled ? 'none' : '1px solid #d1d5db',
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {locationLoading ? (
                  <>
                    <FiLoader size={13} />
                    Getting location…
                  </>
                ) : locationEnabled ? (
                  <>
                    <FiMapPin size={13} />
                    By Distance
                  </>
                ) : (
                  <>
                    <FiNavigation size={13} />
                    Enable Location
                  </>
                )}
              </Button>
            </Flex>

            {locationError && (
              <Text fontSize="sm" color="red.500" mb={3}>
                {locationError}
              </Text>
            )}

            {locationEnabled && userLocation ? (
              <VStack gap={3} align="stretch">
                <Flex justify="space-between">
                  <Text fontSize="sm" color="gray.600">
                    Distance: {distanceKm} km
                  </Text>
                  <Text fontSize="xs" color="gray.400">
                    {distanceLabel}
                  </Text>
                </Flex>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: ORANGE,
                    height: '6px',
                    cursor: 'pointer',
                  }}
                />
                <Flex justify="space-between">
                  <Text fontSize="xs" color="gray.400">1 km</Text>
                  <Text fontSize="xs" color="gray.400">25 km</Text>
                  <Text fontSize="xs" color="gray.400">50 km</Text>
                </Flex>
              </VStack>
            ) : (
              !locationLoading && (
                <Text fontSize="sm" color="gray.500">
                  Enable location to find services near you, sorted by distance.
                </Text>
              )
            )}
          </Box>
        </VStack>

        {/* ── Filter tabs ── */}
        <Flex gap={2} mb={6} pb={6} borderBottom="1px solid" borderColor="gray.200" flexWrap="wrap">
          {FILTERS.map((f) => (
            <Box
              key={f.id}
              as="button"
              onClick={() => setActiveFilter(f.id)}
              px={4}
              py={2}
              borderRadius="lg"
              fontSize="sm"
              fontWeight={activeFilter === f.id ? 600 : 400}
              bg={activeFilter === f.id ? ORANGE : 'white'}
              color={activeFilter === f.id ? 'white' : 'gray.700'}
              border="1px solid"
              borderColor={activeFilter === f.id ? ORANGE : 'gray.200'}
              cursor="pointer"
              transition="all 0.15s"
              _hover={{
                bg: activeFilter === f.id ? ORANGE : 'gray.50',
              }}
            >
              {f.label}
            </Box>
          ))}
        </Flex>

        {/* ── Service cards ── */}
        {/* Full spinner only on very first load (no data yet) */}
        {isLoading && services.length === 0 ? (
          <Flex justify="center" py={16}>
            <Spinner size="lg" color="orange.400" />
          </Flex>
        ) : fetchError && services.length === 0 ? (
          <Flex justify="center" py={16}>
            <Text color="red.500">{fetchError}</Text>
          </Flex>
        ) : services.length === 0 ? (
          <Flex direction="column" align="center" py={16} gap={3}>
            <Text fontSize="4xl">🔍</Text>
            <Text color="gray.500">No services found. Be the first to post one!</Text>
            <Button
              size="sm"
              onClick={() => navigate('/post-offer')}
              style={{ background: ORANGE, color: '#fff', borderRadius: '9999px' }}
            >
              Post a Service
            </Button>
          </Flex>
        ) : (
          <Grid templateColumns="repeat(2, 1fr)" gap={6}>
            {services.map((service) => {
              const owner = service.user ?? service.provider
              const name = userName(owner)
              const initials = userInitials(owner)
              const avatarUrl = owner?.avatar_url
              const isOffer = service.type === 'Offer'

              // Ownership & handshake state
              const isOwn = !!user && (owner?.id === user.id)
              const handshake = handshakeMap.get(service.id)
              // Recurrent services are ongoing — a completed handshake = one session done,
              // not the service itself. Hide 'completed' badge for Recurrent.
              const isRecurrent = service.schedule_type === 'Recurrent'
              const showHandshakeBadge =
                handshake &&
                !(isRecurrent && handshake.status === 'completed')
              const hsConfig = showHandshakeBadge ? HANDSHAKE_BADGE[handshake!.status] : null
              const isDimmed = handshake?.status === 'denied' || handshake?.status === 'cancelled'

              // Incoming requests on own services
              const incomingList = isOwn ? (incomingMap.get(service.id) ?? []) : []
              const pendingCount = incomingList.filter((h) => h.status === 'pending').length
              const activeCount  = incomingList.filter((h) => ['pending', 'accepted'].includes(h.status)).length

              return (
                <Box
                  key={service.id}
                  as="button"
                  onClick={() => navigate(`/service-detail/${service.id}`)}
                  bg="white"
                  borderRadius="xl"
                  border="1px solid"
                  borderColor={isOwn ? 'orange.200' : 'gray.200'}
                  p={6}
                  textAlign="left"
                  w="full"
                  transition="all 0.15s"
                  _hover={{ borderColor: 'orange.300', boxShadow: 'md' }}
                  cursor="pointer"
                  opacity={isDimmed ? 0.65 : 1}
                >
                  {/* User + title row */}
                  <Flex gap={3} mb={3} align="flex-start">
                    <Box
                      w="40px"
                      h="40px"
                      borderRadius="full"
                      bg={YELLOW}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontWeight="700"
                      fontSize="13px"
                      color={GREEN}
                      flexShrink={0}
                      overflow="hidden"
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initials
                      )}
                    </Box>
                    <Box flex={1} minW={0}>
                      <Flex align="center" justify="space-between" gap={2} mb={1}>
                        <Flex align="center" gap={2} flex={1} minW={0} flexWrap="wrap">
                        <Text fontWeight="700" color="gray.900" fontSize="sm" overflow="hidden" style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                          {service.title}
                        </Text>
                        <Badge
                          fontSize="xs"
                          px={2}
                          py={0.5}
                          borderRadius="full"
                          bg={isOffer ? 'green.100' : 'blue.100'}
                          color={isOffer ? 'green.700' : 'blue.700'}
                        >
                          {service.type === 'Need' ? 'Want' : service.type}
                        </Badge>
                        {/* Ownership badge */}
                        {isOwn && (
                          <Badge
                            fontSize="xs"
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            bg="orange.50"
                            color="orange.600"
                            border="1px solid"
                            borderColor="orange.200"
                          >
                            Your listing
                          </Badge>
                        )}
                        {/* Handshake status badge */}
                        {!isOwn && hsConfig && (
                          <Badge
                            fontSize="xs"
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            style={{ background: hsConfig.bg, color: hsConfig.color }}
                          >
                            {hsConfig.label}
                          </Badge>
                        )}
                        </Flex>
                        {/* Incoming request count — inline, right side of title row */}
                        {isOwn && activeCount > 0 && (
                          <Box
                            display="flex"
                            alignItems="center"
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            fontSize="11px"
                            fontWeight={700}
                            bg={pendingCount > 0 ? 'orange.500' : 'green.500'}
                            color="white"
                            flexShrink={0}
                          >
                            {activeCount} {activeCount === 1 ? 'request' : 'requests'}
                          </Box>
                        )}
                      </Flex>
                      <Text fontSize="xs" color="gray.400">
                        {name}
                      </Text>
                    </Box>
                  </Flex>

                  {/* Description */}
                  <Text fontSize="sm" color="gray.600" mb={3} style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {service.description}
                  </Text>

                  {/* Meta row */}
                  <HStack gap={4} fontSize="sm" color="gray.500" mb={3} flexWrap="wrap">
                    <Flex align="center" gap={1}>
                      <FiClock size={13} />
                      <Text>{formatHours(service.duration)}h</Text>
                    </Flex>
                    <Flex align="center" gap={1}>
                      {service.location_type === 'Online' ? (
                        <FiMonitor size={13} />
                      ) : (
                        <FiUsers size={13} />
                      )}
                      <Text>{service.location_type}</Text>
                    </Flex>
                    {service.location_area && (
                      <Flex align="center" gap={1}>
                        <FiMapPin size={13} />
                        <Text>{service.location_area}</Text>
                      </Flex>
                    )}
                  </HStack>

                  {/* Schedule */}
                  <Flex align="center" gap={3} mb={3} fontSize="xs" color="gray.400" flexWrap="wrap">
                    {isRecurrent && (
                      <Flex
                        align="center"
                        gap={1}
                        px={2}
                        py={0.5}
                        borderRadius="full"
                        bg="purple.50"
                        color="purple.600"
                        border="1px solid"
                        borderColor="purple.100"
                        fontWeight={600}
                      >
                        <FiRefreshCw size={10} />
                        <Text>Recurrent</Text>
                      </Flex>
                    )}
                    {service.schedule_details && (
                      <Flex align="center" gap={1}>
                        <FiCalendar size={12} />
                        <Text>{service.schedule_details}</Text>
                      </Flex>
                    )}
                  </Flex>

                  {/* Tags + participants */}
                  <Flex align="center" justify="space-between">
                    <HStack gap={2} flexWrap="wrap">
                      {service.tags?.slice(0, 3).map((tag) => (
                        <Text
                          key={tag.id}
                          fontSize="xs"
                          px={2}
                          py={0.5}
                          bg="gray.100"
                          color="gray.600"
                          borderRadius="md"
                        >
                          #{tag.name}
                        </Text>
                      ))}
                    </HStack>
                    <Flex align="center" gap={1} fontSize="xs" color="gray.400">
                      <FiUsers size={11} />
                      {service.max_participants > 1 ? (
                        <Text>
                          {service.participant_count ?? 0}/{service.max_participants}
                          {' '}slots
                        </Text>
                      ) : (
                        <Text>Max {service.max_participants}</Text>
                      )}
                    </Flex>
                  </Flex>
                </Box>
              )
            })}
          </Grid>
        )}
      </Box>
    </Box>
  )
}

export default DashboardPage
