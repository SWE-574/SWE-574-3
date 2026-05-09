import { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import { FiClock, FiMapPin, FiStar, FiUsers } from 'react-icons/fi'

import { featuredAPI } from '@/services/featuredAPI'
import { serviceAPI } from '@/services/serviceAPI'
import { isNearlyFull } from '@/utils/eventUtils'
import type { FeaturedResponse, FeaturedService, Service } from '@/types'

type TabKey = 'friends' | 'nearby' | 'nearly_full'

interface TabDef {
  key: TabKey
  label: string
}

const TABS: TabDef[] = [
  { key: 'friends',     label: 'Friends'     },
  { key: 'nearby',      label: 'Nearby'      },
  { key: 'nearly_full', label: 'Nearly Full' },
]

const DEFAULT_MAX_NEARBY_KM = 30

const TYPE_COLOR: Record<'Offer' | 'Need' | 'Event', string> = {
  Offer: '#10B981',
  Need:  '#3B82F6',
  Event: '#F59E0B',
}

interface ContextBadge {
  text: string
  tone: 'purple' | 'green' | 'red'
}

interface FeaturedItem {
  service: Service
  contextBadge?: ContextBadge
}

interface FeaturedSectionProps {
  services: Service[]
  userLocation?: { lat: number; lng: number } | null
  maxNearbyKm?: number
  onMaxNearbyKmChange?: (value: number) => void
  isAuthenticated: boolean
  onServicePress?: (id: string) => void
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function serviceLatLng(service: Service): { lat: number; lng: number } | null {
  const lat = Number(service.location_lat ?? service.latitude ?? service.session_exact_location_lat ?? NaN)
  const lng = Number(service.location_lng ?? service.longitude ?? service.session_exact_location_lng ?? NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function normalizeFeatured(item: FeaturedService): Service {
  return {
    id: String(item.id),
    title: item.title,
    description: '',
    type: item.type,
    duration: '',
    location_type: item.location_area ? 'In-Person' : 'Online',
    location_area: item.location_area ?? undefined,
    status: 'Active',
    max_participants: item.max_participants,
    participant_count: item.participant_count,
    created_at: item.created_at,
    schedule_type: 'One-Time',
    tags: item.tags,
    user: {
      id: item.user.id,
      first_name: item.user.first_name,
      last_name: item.user.last_name,
      avatar_url: item.user.avatar_url ?? undefined,
    } as Service['user'],
  } as Service
}

export default function FeaturedSection({
  services,
  userLocation,
  maxNearbyKm = DEFAULT_MAX_NEARBY_KM,
  onMaxNearbyKmChange,
  isAuthenticated,
  onServicePress,
}: FeaturedSectionProps) {
  const [featuredData, setFeaturedData] = useState<FeaturedResponse | null>(null)
  const [hotFallback, setHotFallback] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [apiFailed, setApiFailed] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('friends')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setApiFailed(false)

    const run = async () => {
      try {
        if (!isAuthenticated) {
          // /featured/ requires auth, mirror mobile's gating.
          const fallback = await serviceAPI.listPaged(
            { sort: 'hot', page_size: 8 },
            controller.signal,
          )
          setHotFallback(fallback.results ?? [])
          setFeaturedData(null)
          return
        }
        const data = await featuredAPI.get(controller.signal)
        setFeaturedData(data)
        if (!data.friends || data.friends.length === 0) {
          const fallback = await serviceAPI.listPaged(
            { sort: 'hot', page_size: 8 },
            controller.signal,
          )
          setHotFallback(fallback.results ?? [])
        }
      } catch (err: unknown) {
        const e = err as { name?: string; code?: string }
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return
        setApiFailed(true)
        try {
          const fallback = await serviceAPI.listPaged(
            { sort: 'hot', page_size: 8 },
            controller.signal,
          )
          setHotFallback(fallback.results ?? [])
        } catch {
          // silent
        }
      } finally {
        setLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [isAuthenticated])

  const friendsItems = useMemo<FeaturedItem[]>(() => {
    const apiItems = featuredData?.friends ?? []
    if (apiItems.length > 0) {
      return apiItems.map(item => ({
        service: normalizeFeatured(item),
        contextBadge: item.friend_count && item.friend_count > 0
          ? {
              text: `${item.friend_count} friend${item.friend_count > 1 ? 's' : ''}`,
              tone: 'purple',
            }
          : undefined,
      }))
    }
    if (hotFallback.length > 0) {
      return hotFallback.slice(0, 8).map(service => ({
        service,
        contextBadge: { text: 'Suggested for you', tone: 'purple' },
      }))
    }
    return []
  }, [featuredData, hotFallback])

  const nearbyItems = useMemo<FeaturedItem[]>(() => {
    if (!userLocation) return []
    type WithDist = { service: Service; distanceKm: number }
    const enriched: WithDist[] = services
      .map(service => {
        const coords = serviceLatLng(service)
        if (!coords) return null
        return { service, distanceKm: haversineKm(userLocation, coords) }
      })
      .filter((entry): entry is WithDist => (
        entry !== null && entry.distanceKm <= maxNearbyKm && service_isInPerson(entry.service)
      ))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 8)
    return enriched.map(({ service, distanceKm }) => ({
      service,
      contextBadge: {
        text: distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m away` : `${distanceKm.toFixed(1)} km away`,
        tone: 'green',
      },
    }))
  }, [services, userLocation, maxNearbyKm])

  const nearlyFullItems = useMemo<FeaturedItem[]>(() => {
    return services
      .filter(service => isNearlyFull(service.max_participants ?? 0, service.participant_count ?? 0))
      .sort((a, b) => {
        const ratioA = (a.participant_count ?? 0) / (a.max_participants ?? 1)
        const ratioB = (b.participant_count ?? 0) / (b.max_participants ?? 1)
        if (ratioA !== ratioB) return ratioB - ratioA
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      })
      .slice(0, 8)
      .map(service => ({
        service,
        contextBadge: {
          text: `${service.participant_count ?? 0}/${service.max_participants} spots`,
          tone: 'red',
        },
      }))
  }, [services])

  const itemsByTab: Record<TabKey, FeaturedItem[]> = {
    friends: friendsItems,
    nearby: nearbyItems,
    nearly_full: nearlyFullItems,
  }
  const currentItems = itemsByTab[activeTab]

  const emptyMessage = (() => {
    if (activeTab === 'friends') {
      if (!isAuthenticated) return 'Sign in to see what your friends are up to.'
      return apiFailed
        ? 'Friend activity is unavailable right now.'
        : 'Follow people to see their activity here.'
    }
    if (activeTab === 'nearby') {
      if (!userLocation) return 'Enable location to populate this tab.'
      return 'No nearby services within your radius.'
    }
    return 'No nearly full services right now.'
  })()

  if (loading && !featuredData && services.length === 0) {
    return (
      <Box mb={4}>
        <Text fontSize="sm" fontWeight="800" color="gray.700" mb={2}>Featured</Text>
        <Flex h="120px" align="center" justify="center"><Spinner color="green.500" /></Flex>
      </Box>
    )
  }

  return (
    <Box mb={4}>
      <Text fontSize="sm" fontWeight="800" color="gray.700" mb={2}>Featured</Text>
      <Flex gap={2} mb={3} wrap="wrap">
        {TABS.map(tab => {
          const isSelected = activeTab === tab.key
          const count = itemsByTab[tab.key].length
          return (
            <Box
              key={tab.key}
              as="button"
              onClick={() => setActiveTab(tab.key)}
              bg={isSelected ? 'gray.900' : 'gray.100'}
              color={isSelected ? 'white' : 'gray.700'}
              px={3}
              py={1.5}
              borderRadius="full"
              fontWeight="700"
              fontSize="xs"
            >
              <Flex align="center" gap={1.5}>
                <TabIcon kind={tab.key} active={isSelected} />
                <span>{tab.label}</span>
                {count > 0 ? (
                  <Box
                    bg={isSelected ? 'whiteAlpha.300' : 'gray.300'}
                    color={isSelected ? 'white' : 'gray.700'}
                    px={1.5}
                    borderRadius="full"
                    fontSize="10px"
                    fontWeight="800"
                  >
                    {count}
                  </Box>
                ) : null}
              </Flex>
            </Box>
          )
        })}
      </Flex>

      {activeTab === 'nearby' && userLocation && onMaxNearbyKmChange ? (
        <Flex align="center" gap={2} mb={2}>
          <Text fontSize="11px" color="gray.600" fontWeight="700" minW="64px">
            Within {maxNearbyKm} km
          </Text>
          <Box flex={1}>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={maxNearbyKm}
              onChange={(e) => onMaxNearbyKmChange(Number(e.target.value))}
              style={{ width: '100%' }}
              aria-label="Nearby radius in kilometres"
            />
          </Box>
        </Flex>
      ) : null}

      {currentItems.length === 0 ? (
        <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="14px" p={4}>
          <Text fontSize="sm" color="gray.600">{emptyMessage}</Text>
        </Box>
      ) : (
        <Flex gap={3} overflowX="auto" pb={1} css={{ scrollbarWidth: 'thin' }}>
          {currentItems.map(item => (
            <FeaturedCard
              key={String(item.service.id)}
              service={item.service}
              badge={item.contextBadge}
              onPress={() => onServicePress?.(String(item.service.id))}
            />
          ))}
        </Flex>
      )}
    </Box>
  )
}

function service_isInPerson(service: Service): boolean {
  if (service.location_type === 'In-Person') return true
  return Boolean(service.location_lat || service.latitude || service.location_area)
}

function TabIcon({ kind, active }: { kind: TabKey; active: boolean }) {
  const color = active ? 'white' : '#475569'
  if (kind === 'friends') return <FiUsers size={12} color={color} />
  if (kind === 'nearby') return <FiMapPin size={12} color={color} />
  return <FiClock size={12} color={color} />
}

function FeaturedCard({
  service,
  badge,
  onPress,
}: {
  service: Service
  badge?: ContextBadge
  onPress: () => void
}) {
  const typeColor = TYPE_COLOR[service.type]
  const owner = service.user || service.provider
  const ownerName = owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : ''
  const badgeColors: Record<NonNullable<ContextBadge['tone']>, { bg: string; fg: string }> = {
    purple: { bg: 'purple.100', fg: 'purple.800' },
    green:  { bg: 'green.100',  fg: 'green.800'  },
    red:    { bg: 'red.100',    fg: 'red.800'    },
  }
  return (
    <Box
      as="button"
      onClick={onPress}
      minW="220px"
      maxW="220px"
      textAlign="left"
      borderRadius="14px"
      overflow="hidden"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      boxShadow="0 4px 14px rgba(15, 23, 42, 0.04)"
    >
      <Box bg={typeColor} px={3} py={2}>
        <Box bg="whiteAlpha.900" px={2} py="2px" borderRadius="full" display="inline-block">
          <Text fontSize="9px" fontWeight="900" color={typeColor} letterSpacing="0.05em">
            {service.type.toUpperCase()}
          </Text>
        </Box>
      </Box>
      <Box p={3}>
        <Text fontSize="sm" fontWeight="800" color="gray.900" lineClamp={2} mb={1}>
          {service.title}
        </Text>
        {ownerName ? (
          <Text fontSize="xs" color="gray.500" mb={2} lineClamp={1}>by {ownerName}</Text>
        ) : null}
        {badge ? (
          <Box bg={badgeColors[badge.tone].bg} display="inline-block" px={2} py={1} borderRadius="full">
            <Flex align="center" gap={1}>
              {badge.tone === 'purple' ? <FiStar size={10} color="#6B21A8" /> : null}
              {badge.tone === 'green' ? <FiMapPin size={10} color="#166534" /> : null}
              {badge.tone === 'red' ? <FiClock size={10} color="#991B1B" /> : null}
              <Text fontSize="10px" fontWeight="800" color={badgeColors[badge.tone].fg}>
                {badge.text}
              </Text>
            </Flex>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
