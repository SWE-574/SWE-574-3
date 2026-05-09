import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  Input,
  Grid,
  Spinner,
} from '@chakra-ui/react'
import {
  FiSearch,
  FiMapPin,
  FiClock,
  FiUsers,
  FiMonitor,
  FiCalendar,
  FiRefreshCw,
  FiSliders,
  FiMenu,
  FiX,
  FiZap,
  FiCompass,
  FiTrendingUp,
  FiNavigation,
  FiStar,
  FiCheck,
} from 'react-icons/fi'
import { MapView } from '@/components/MapView'
import { serviceAPI, type ServiceListParams } from '@/services/serviceAPI'
import { handshakeAPI } from '@/services/handshakeAPI'
import { useAuthStore } from '@/store/useAuthStore'
import { useGeoStore } from '@/store/useGeoStore'
import type { Service } from '@/types'
import { MainSidebar } from '@/components/MainSidebar'
import { Avatar } from '@/components/Avatar'
import { Pagination } from '@/components/Pagination'
import RecommendationDebugBar from '@/components/RecommendationDebugBar'
import type { Handshake } from '@/services/handshakeAPI'
import DashboardTour from '@/components/dashboard-tour/DashboardTour'

import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'
import { formatGroupOfferDateTime, isNearlyFull } from '@/utils/eventUtils'
import { isEventRecurrent } from '@/utils/eventRecurrence'

const DEBOUNCE_SEARCH   = 400
const DEBOUNCE_DISTANCE = 250
const POLL_INTERVAL     = 60_000
const GEO_TIMEOUT       = 10_000
const PAGE_SIZE         = 15

// ─── Ranking modes ────────────────────────────────────────────────────────────

type RankingMode = 'for_you' | 'discovery' | 'trending' | 'newest' | 'nearby'

interface RankingButtonDef {
  id: RankingMode
  label: string
  icon: React.ReactNode
}

const RANKING_BUTTONS: RankingButtonDef[] = [
  { id: 'for_you',   label: 'For you',   icon: <FiStar size={12} /> },
  { id: 'discovery', label: 'Discovery', icon: <FiCompass size={12} /> },
  { id: 'trending',  label: 'Trending',  icon: <FiTrendingUp size={12} /> },
  { id: 'newest',    label: 'Newest',    icon: <FiZap size={12} /> },
  { id: 'nearby',    label: 'Nearby',    icon: <FiNavigation size={12} /> },
]

// Secondary filters live in the [More filters ▾] popover. Multi-select; applied
// client-side over the current page slice.
type SecondaryFilter = 'online' | 'in_person' | 'one_time' | 'weekend'

interface SecondaryFilterDef {
  id: SecondaryFilter
  label: string
  icon: React.ReactNode
}

const SECONDARY_FILTERS: SecondaryFilterDef[] = [
  { id: 'online',    label: 'Online',    icon: <FiMonitor size={12} /> },
  { id: 'in_person', label: 'In-person', icon: <FiMapPin size={12} /> },
  { id: 'one_time',  label: 'One-time',  icon: <FiCalendar size={12} /> },
  { id: 'weekend',   label: 'Weekend',   icon: <FiRefreshCw size={12} /> },
]

const TYPE_FILTERS = [
  { id: 'Offer' as const, label: 'Offers', activeBg: GREEN, activeColor: WHITE, dotColor: GREEN },
  { id: 'Need'  as const, label: 'Needs',  activeBg: BLUE,  activeColor: WHITE, dotColor: BLUE  },
  { id: 'Event' as const, label: 'Events', activeBg: AMBER, activeColor: WHITE, dotColor: AMBER },
]

// ─── Handshake badge ──────────────────────────────────────────────────────────

const HANDSHAKE_BADGE: Record<
  Handshake['status'],
  { label: string; bg: string; color: string }
> = {
  pending:   { label: 'Interested',  bg: '#fef9c3', color: '#854d0e' },
  accepted:  { label: 'Accepted',    bg: '#dcfce7', color: '#166534' },
  completed: { label: 'Completed',   bg: '#d1fae5', color: '#065f46' },
  denied:    { label: 'Declined',    bg: '#fee2e2', color: '#991b1b' },
  cancelled: { label: 'Cancelled',   bg: '#f3f4f6', color: '#6b7280' },
  reported:   { label: 'Reported',    bg: '#fee2e2', color: '#991b1b' },
  paused:     { label: 'Paused',      bg: '#e0f2fe', color: '#0369a1' },
  checked_in: { label: 'Checked In',  bg: '#d1fae5', color: '#065f46' },
  attended:   { label: 'Attended',    bg: '#d1fae5', color: '#065f46' },
  no_show:    { label: 'No-Show',     bg: '#fee2e2', color: '#991b1b' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(h: number | string | undefined | null) {
  const n = typeof h === 'string' ? parseFloat(h) : (h ?? 0)
  if (isNaN(n)) return '?'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function fullName(u?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!u) return 'User'
  const n = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  return n || u.email || 'User'
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const dy = Math.floor(h / 24)
  return dy < 7 ? `${dy}d ago`
    : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sortServicesByFeedPriority(a: Service, b: Service) {
  const pinDiff = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned))
  if (pinDiff !== 0) return pinDiff

  const hotDiff = Number(b.hot_score ?? 0) - Number(a.hot_score ?? 0)
  if (hotDiff !== 0) return hotDiff

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function matchesSecondaryFilter(service: Service, filter: SecondaryFilter): boolean {
  switch (filter) {
    case 'online':    return service.location_type === 'Online'
    case 'in_person': return service.location_type === 'In-Person'
    case 'one_time':  return service.schedule_type === 'One-Time'
    case 'weekend':   return /saturday|sunday|weekend/i.test(service.schedule_details ?? '')
  }
}

// ─── Tiny reusable bits ───────────────────────────────────────────────────────

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <Box px="7px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700} bg={bg} color={color}>
      {label}
    </Box>
  )
}

function MetaChip({ icon, label, maxW }: { icon: React.ReactNode; label: string; maxW?: string }) {
  return (
    <Flex align="center" gap="3px" px="7px" py="4px" borderRadius="7px" bg={GRAY100} flexShrink={0} maxW={maxW ?? 'none'} overflow="hidden">
      <Box color={GRAY400} flexShrink={0}>{icon}</Box>
      <Text fontSize="11px" color={GRAY600} fontWeight={500}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >{label}</Text>
    </Flex>
  )
}

// ─── Service Card ─────────────────────────────────────────────────────────────
// Visual: coloured "poster" header, then info body — not a generic boring list row.

const CARD_GRADIENTS: Record<string, [string, string]> = {
  music:      ['#7C3AED', '#4F46E5'],
  art:        ['#DB2777', '#BE185D'],
  tech:       ['#0369A1', '#1D4ED8'],
  cook:       ['#D97706', '#B45309'],
  sport:      ['#16A34A', '#15803D'],
  lang:       ['#DC2626', '#B91C1C'],
  teach:      ['#2D5C4E', '#1a3d35'],
  need:       ['#1D4ED8', '#1e3a8a'],
  default_o:  ['#2D5C4E', '#1a4a3a'],
}

function pickGradient(service: Service): [string, string] {
  if (service.type === 'Event') return ['#D97706', '#B45309']
  if (service.type === 'Need') return CARD_GRADIENTS.need
  const combined = (service.title + ' ' + service.tags?.map((t) => t.name).join(' ')).toLowerCase()
  if (/music|guitar|piano|drum|sing/.test(combined))  return CARD_GRADIENTS.music
  if (/art|paint|draw|design|photo/.test(combined))   return CARD_GRADIENTS.art
  if (/tech|code|program|dev|web|soft/.test(combined)) return CARD_GRADIENTS.tech
  if (/cook|food|bak|chef|recipe/.test(combined))     return CARD_GRADIENTS.cook
  if (/sport|yoga|fitness|run|gym/.test(combined))    return CARD_GRADIENTS.sport
  if (/lang|english|spanish|french|translate/.test(combined)) return CARD_GRADIENTS.lang
  if (/teach|tutor|lesson|class|learn/.test(combined)) return CARD_GRADIENTS.teach
  return CARD_GRADIENTS.default_o
}

function CardHeader({ service, gradient }: { service: Service; gradient: [string, string] }) {
  const thumb = service.media?.[0]?.file_url ?? null
  return (
    <Box
      h="90px" position="relative" overflow="hidden"
      style={{ background: thumb ? undefined : `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)` }}
    >
      {thumb && (
        <img src={thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {/* Abstract decoration circles (only when no thumb) */}
      {!thumb && (
        <>
          <Box style={{ position: 'absolute', top: '-24px', right: '-24px', width: '90px', height: '90px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <Box style={{ position: 'absolute', bottom: '-30px', left: '30%', width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <Box style={{ position: 'absolute', top: '10px', left: '-20px', width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        </>
      )}
      {/* Gradient overlay at bottom when there's an image */}
      {thumb && (
        <Box style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 50%)' }} />
      )}
      {/* Title text over the visual */}
      <Box position="absolute" bottom={0} left={0} right={0} px={3} pb="10px">
        <Text
          fontSize="14px" fontWeight={800} color={WHITE} lineHeight="1.3"
          style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textShadow: thumb ? '0 1px 4px rgba(0,0,0,0.5)' : 'none' }}
        >
          {service.title}
        </Text>
      </Box>
    </Box>
  )
}

function ServiceCard({
  service, isOwn, handshake, incomingCount, pendingCount, onClick, onHover, dataTour,
}: {
  service: Service
  isOwn: boolean
  handshake?: Handshake
  incomingCount: number
  pendingCount: number
  onClick: () => void
  onHover?: () => void
  dataTour?: string
}) {
  const owner     = service.user ?? service.provider
  const isOffer   = service.type === 'Offer'
  const isRecurr  = isEventRecurrent(service)
  const isFixedGroupOffer = isOffer && service.schedule_type === 'One-Time' && service.max_participants > 1
  const gradient  = pickGradient(service)

  const showBadge = handshake && !(isRecurr && handshake.status === 'completed')
  const hsCfg     = showBadge ? HANDSHAKE_BADGE[handshake!.status] : null
  const isDimmed  = handshake?.status === 'denied' || handshake?.status === 'cancelled'

  return (
    <Box
      as="button" onClick={onClick} w="full" textAlign="left"
      onMouseEnter={onHover}
      onFocus={onHover}
      data-tour={dataTour}
      bg={WHITE} borderRadius="16px"
      border="1px solid" borderColor={isOwn ? '#FED7AA' : GRAY200}
      overflow="hidden"
      transition="all 0.18s ease"
      _hover={{ boxShadow: '0 6px 24px rgba(0,0,0,0.10)', transform: 'translateY(-2px)', borderColor: isOwn ? '#f97316' : GRAY300 }}
      cursor="pointer"
      opacity={isDimmed ? 0.6 : 1}
      display="flex"
      flexDirection="column"
      position="relative"
    >

      <CardHeader service={service} gradient={gradient} />

      <Flex direction="column" flex={1} px={3} pt="10px" pb={3}>
        {/* Provider row — left clips, right badges never wrap */}
        <Flex align="center" gap="6px" mb="8px" minW={0}>
          <Avatar u={owner} size={22} />
          {/* name + dot + time — flex-shrink to give badges room */}
          <Flex align="center" gap="4px" flex={1} minW={0} overflow="hidden">
            <Text fontSize="11px" fontWeight={600} color={GRAY500}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {fullName(owner)}
            </Text>
            <Text fontSize="10px" color={GRAY400} flexShrink={0}>·</Text>
            <Text fontSize="10px" color={GRAY400} flexShrink={0} whiteSpace="nowrap">{timeAgo(service.created_at)}</Text>
          </Flex>
          {/* Badges — never shrink or wrap */}
          <Flex gap="3px" align="center" flexShrink={0} flexWrap="nowrap">
            {service.is_pinned && (
              <Flex align="center" gap="3px" bg={GREEN_LT} color={GREEN} borderRadius="6px" px="6px" py="2px" fontSize="10px" fontWeight={700} flexShrink={0}>
                <FiMapPin size={9} /> Featured
              </Flex>
            )}
            <Pill
              label={isOffer ? 'Offer' : service.type === 'Event' ? 'Event' : 'Need'}
              bg={isOffer ? GREEN_LT : service.type === 'Event' ? AMBER_LT : BLUE_LT}
              color={isOffer ? GREEN : service.type === 'Event' ? AMBER : BLUE}
            />
            {isOwn && <Pill label="Yours" bg={AMBER_LT} color={AMBER} />}
            {!isOwn && hsCfg && <Pill label={hsCfg.label} bg={hsCfg.bg} color={hsCfg.color} />}
            {(service.type === 'Event' || (service.type === 'Offer' && service.max_participants > 1)) &&
              isNearlyFull(service.max_participants, service.participant_count ?? 0) && (
              <Pill label="Nearly Full" bg={RED_LT} color={RED} />
            )}
            {isOwn && incomingCount > 0 && (
              <Box
                px="5px" py="2px" borderRadius="full" fontSize="10px" fontWeight={800}
                bg={pendingCount > 0 ? '#f97316' : '#10B981'} color={WHITE} flexShrink={0}
              >
                {incomingCount}↗
              </Box>
            )}
          </Flex>
        </Flex>

        {/* Description — fixed 2-line clamp */}
        <Text
          fontSize="12px" color={GRAY500} mb="8px" flex={1}
          style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {service.description}
        </Text>

        {/* Meta chips — single row, chips truncate if too long */}
        <Flex gap="5px" mb="8px" overflow="hidden" flexWrap="nowrap">
          <MetaChip icon={<FiClock size={10} />} label={`${fmt(service.duration)}h`} />
          <MetaChip
            icon={service.location_type === 'Online' ? <FiMonitor size={10} /> : <FiMapPin size={10} />}
            label={service.location_area ?? service.location_type}
            maxW="110px"
          />
          {isRecurr && (
            <Flex align="center" gap="3px" px="7px" py="4px" borderRadius="7px" bg="#F3E8FF" flexShrink={0}>
              <FiRefreshCw size={9} color="#7C3AED" />
              <Text fontSize="11px" color="#7C3AED" fontWeight={600} whiteSpace="nowrap">Recurring</Text>
            </Flex>
          )}
          {isFixedGroupOffer && service.scheduled_time && (
            <MetaChip icon={<FiCalendar size={10} />} label={formatGroupOfferDateTime(service.scheduled_time)} maxW="120px" />
          )}
          {service.schedule_details && !isRecurr && (
            <MetaChip icon={<FiCalendar size={10} />} label={service.schedule_details} maxW="120px" />
          )}
        </Flex>

        {/* Tags + participants — always at bottom */}
        <Flex align="center" justify="space-between" mt="auto">
          <Flex gap="4px" overflow="hidden" flex={1} minW={0}>
            {service.tags?.slice(0, 3).map((t) => (
              <Text key={t.id} fontSize="10px" px="6px" py="2px" borderRadius="5px"
                bg={GRAY50} color={GRAY500} border={`1px solid ${GRAY200}`} fontWeight={500}
                flexShrink={0}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}
              >
                #{t.name}
              </Text>
            ))}
            {(service.tags?.length ?? 0) > 3 && (
              <Text fontSize="10px" color={GRAY400} flexShrink={0}>+{service.tags!.length - 3}</Text>
            )}
          </Flex>
          <Flex align="center" gap="3px" flexShrink={0} ml={2}>
            <FiUsers size={10} color={GRAY400} />
            <Text fontSize="10px" color={GRAY400} whiteSpace="nowrap">
              {service.max_participants > 1
                ? `${service.participant_count ?? 0}/${service.max_participants}`
                : `${service.max_participants}`}
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  )
}



// ─── Main Component ───────────────────────────────────────────────────────────

const DashboardPage = () => {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const [searchParams, setSearchParams]             = useSearchParams()
  const page                                         = Math.max(1, Number(searchParams.get('page') ?? 1))

  const [rankingMode, setRankingMode]               = useState<RankingMode>('trending')
  const [activeTypes, setActiveTypes]               = useState<Set<'Offer' | 'Need' | 'Event'>>(new Set())
  const [secondaryFilters, setSecondaryFilters]     = useState<Set<SecondaryFilter>>(new Set())
  const [searchQuery, setSearchQuery]               = useState('')
  const [debouncedSearch, setDebouncedSearch]       = useState('')

  const [services, setServices]                     = useState<Service[]>([])
  const [totalCount, setTotalCount]                 = useState(0)
  const [filtersOpen, setFiltersOpen]               = useState(false)
  const [sidebarOpen, setSidebarOpen]               = useState(false)

  const [userLocation, setUserLocation]             = useState<{ lat: number; lng: number } | null>(null)
  const [distanceKm, setDistanceKm]                 = useState(10)
  const [debouncedDistance, setDebouncedDistance]   = useState(10)
  const [locationEnabled, setLocationEnabled]       = useState(() => localStorage.getItem('locationEnabled') === 'true')
  const [locationLoading, setLocationLoading]       = useState(false)
  const [locationError, setLocationError]           = useState<string | null>(null)
  const locationAutoRequested                       = useRef(false)

  const [handshakeMap, setHandshakeMap]             = useState<Map<string, Handshake>>(new Map())
  const [incomingMap, setIncomingMap]               = useState<Map<string, Handshake[]>>(new Map())
  const [hoveredServiceId, setHoveredServiceId]     = useState<string | null>(null)
  const [rankingDebugEnabled, setRankingDebugEnabled] = useState(false)

  const searchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const distanceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goToPage = useCallback((p: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (p <= 1) next.delete('page')
        else next.set('page', String(p))
        return next
      },
      { replace: false },
    )
  }, [setSearchParams])

  // Reset to page 1 whenever a filter / search / mode changes — otherwise the
  // viewer sees an empty page when the result set shrinks.
  const filterKey = useMemo(
    () => JSON.stringify({
      mode: rankingMode,
      types: Array.from(activeTypes).sort(),
      filters: Array.from(secondaryFilters).sort(),
      search: debouncedSearch,
    }),
    [rankingMode, activeTypes, secondaryFilters, debouncedSearch],
  )
  const previousFilterKey = useRef(filterKey)
  useEffect(() => {
    if (previousFilterKey.current !== filterKey && page !== 1) {
      previousFilterKey.current = filterKey
      goToPage(1)
    } else {
      previousFilterKey.current = filterKey
    }
  }, [filterKey, page, goToPage])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), DEBOUNCE_SEARCH)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery])

  useEffect(() => {
    if (distanceTimer.current) clearTimeout(distanceTimer.current)
    distanceTimer.current = setTimeout(() => setDebouncedDistance(distanceKm), DEBOUNCE_DISTANCE)
    return () => { if (distanceTimer.current) clearTimeout(distanceTimer.current) }
  }, [distanceKm])

  // Ranking debug bar (#476) lives back on the dashboard so admins can hover
  // a card and see its Phase 2/3 breakdown live. The availability endpoint
  // is admin-only per #371, so non-admins quietly get no result and the bar
  // stays hidden. The PlatformSetting flag (toggled in the admin panel)
  // controls whether the bar appears at all even for admins.
  useEffect(() => {
    let cancelled = false
    serviceAPI
      .getRankingDebugAvailability()
      .then(({ enabled }) => {
        if (!cancelled) setRankingDebugEnabled(Boolean(enabled))
      })
      .catch(() => {
        if (!cancelled) setRankingDebugEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fetchServices = useCallback(async (signal: AbortSignal) => {
    const baseParams: ServiceListParams = {
      exclude_own: true,
      search: debouncedSearch || undefined,
      page,
      page_size: PAGE_SIZE,
    }

    // Map ranking button → backend sort/explore/lat-lng knobs.
    switch (rankingMode) {
      case 'for_you':
        baseParams.sort = 'for_you'
        break
      case 'discovery':
        baseParams.sort = 'for_you'
        baseParams.explore_only = true
        break
      case 'trending':
        baseParams.sort = 'hot'
        break
      case 'newest':
        baseParams.sort = 'latest'
        break
      case 'nearby':
        baseParams.sort = 'hot'
        if (locationEnabled && userLocation) {
          baseParams.lat = userLocation.lat
          baseParams.lng = userLocation.lng
          baseParams.distance = debouncedDistance
        }
        break
    }

    // Backend `type=` filter is single-valued. When the viewer ticks more
    // than one type chip we fan out one request per type and merge — bounded
    // by the 3 service types so even at PAGE_SIZE=15 this is at most three
    // small requests.
    if (activeTypes.size > 1) {
      const typeArr = Array.from(activeTypes)
      const responses = await Promise.all(
        typeArr.map((t) =>
          serviceAPI.listPaged({ ...baseParams, type: t }, signal),
        ),
      )
      const merged = new Map<string, Service>()
      let combinedCount = 0
      for (const r of responses) {
        for (const s of r.results) merged.set(s.id, s)
        combinedCount += r.count
      }
      const list = Array.from(merged.values())
      list.sort((a, b) =>
        rankingMode === 'newest'
          ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          : sortServicesByFeedPriority(a, b),
      )
      setServices(list.slice(0, PAGE_SIZE))
      setTotalCount(combinedCount)
      return
    }

    if (activeTypes.size === 1) {
      baseParams.type = Array.from(activeTypes)[0]
    }

    const resp = await serviceAPI.listPaged(baseParams, signal)
    setServices(resp.results)
    setTotalCount(resp.count)
  }, [
    debouncedSearch,
    page,
    rankingMode,
    activeTypes,
    locationEnabled,
    userLocation,
    debouncedDistance,
  ])

  const { isLoading, error: fetchError } = usePolling(fetchServices, [fetchServices], { interval: POLL_INTERVAL })

  const fetchHandshakes = useCallback(async (signal: AbortSignal) => {
    if (!isAuthenticated) {
      setHandshakeMap(new Map())
      setIncomingMap(new Map())
      return
    }
    const list = await handshakeAPI.list(signal)
    const out  = new Map<string, Handshake>()
    const inc  = new Map<string, Handshake[]>()
    list.forEach((h) => {
      const svcId = typeof h.service === 'string' ? h.service
        : typeof h.service === 'object' && h.service && 'id' in h.service ? (h.service as { id: string }).id
        : undefined
      if (!svcId) return
      if (h.requester === user?.id) { out.set(svcId, h) }
      else { const arr = inc.get(svcId) ?? []; arr.push(h); inc.set(svcId, arr) }
    })
    setHandshakeMap(out)
    setIncomingMap(inc)
  }, [isAuthenticated, user?.id])

  usePolling(fetchHandshakes, [fetchHandshakes], { interval: POLL_INTERVAL, enabled: isAuthenticated })

  // Auto-request location on mount if user previously allowed it
  useEffect(() => {
    if (locationAutoRequested.current) return
    if (locationEnabled && !userLocation) {
      locationAutoRequested.current = true
      requestLocation()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestLocation = useCallback(() => {
    setLocationLoading(true); setLocationError(null)
    if (!navigator.geolocation) { setLocationError('Geolocation not supported'); setLocationLoading(false); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        useGeoStore.getState().setGeoLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
        setLocationEnabled(true); localStorage.setItem('locationEnabled', 'true'); setLocationLoading(false)
      },
      (err) => {
        setLocationError(['Unknown error','Permission denied','Location unavailable','Timed out'][err.code] ?? 'Unable to get location')
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT, maximumAge: 300_000 },
    )
  }, [])

  const toggleLocation = useCallback(() => {
    if (locationEnabled) { setLocationEnabled(false); localStorage.setItem('locationEnabled', 'false') }
    else if (userLocation) { setLocationEnabled(true); localStorage.setItem('locationEnabled', 'true') }
    else { requestLocation() }
  }, [locationEnabled, userLocation, requestLocation])

  const toggleType = useCallback((t: 'Offer' | 'Need' | 'Event') => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }, [])

  const toggleSecondaryFilter = useCallback((f: SecondaryFilter) => {
    setSecondaryFilters((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
  }, [])

  // ── My listings: dedicated fetch for the sidebar widget. The main feed sets
  // `exclude_own=true` so it never includes the viewer's own services, which
  // means we can't derive "my listings" from it any more.
  const [myServices, setMyServices] = useState<Service[]>([])
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setMyServices([])
      return
    }
    let cancelled = false
    serviceAPI
      .list({ user_id: user.id, page_size: 50 })
      .then((list) => {
        if (cancelled) return
        setMyServices(list.filter((s) => s.status === 'Active' && s.is_visible))
      })
      .catch(() => { if (!cancelled) setMyServices([]) })
    return () => { cancelled = true }
  }, [isAuthenticated, user?.id])

  // ── Derived ───────────────────────────────────────────────────────────────
  const ownServiceHandshakes = useMemo(() => Array.from(incomingMap.values()).flat(), [incomingMap])

  // Hide events from the browse feed where the logged-in user was removed
  // (i.e. their handshake was cancelled by an admin after a report). Past
  // events drop out, and the secondary-filter popover (Online / In-person /
  // One-time / Weekend) is applied client-side over the page slice.
  const displayServices = useMemo(() => {
    const filters = Array.from(secondaryFilters)
    return (isAuthenticated
      ? services.filter((s) => {
          if (s.type !== 'Event') return true
          const hs = handshakeMap.get(s.id)
          return hs?.status !== 'cancelled'
        })
      : services
    )
      .filter((s) => {
        if (s.type === 'Event' && s.scheduled_time && new Date(s.scheduled_time).getTime() <= Date.now()) return false
        if (filters.length && !filters.every((f) => matchesSecondaryFilter(s, f))) return false
        return true
      })
      .sort((a, b) => {
        const aInactive = ['denied', 'cancelled'].includes(handshakeMap.get(a.id)?.status ?? '')
        const bInactive = ['denied', 'cancelled'].includes(handshakeMap.get(b.id)?.status ?? '')
        if (aInactive === bInactive) return 0
        return aInactive ? 1 : -1
      })
  }, [services, isAuthenticated, handshakeMap, secondaryFilters])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pendingHs          = myServices.filter((service) => {
    const incoming = incomingMap.get(service.id) ?? []
    return incoming.some((h) => h.status === 'pending')
  }).length
  const acceptedHs         = myServices.length
  const completedHs        = ownServiceHandshakes.filter((h) => h.status === 'completed').length
  const distanceLabel      = distanceKm <= 5 ? 'Nearby' : distanceKm <= 15 ? 'Local' : distanceKm <= 30 ? 'Wider' : 'City-wide'

  const sidebarProps = {
    pendingHs, acceptedHs, completedHs,
    myServices, incomingMap,
    locationEnabled, locationLoading, locationError, userLocation,
    distanceKm, distanceLabel, toggleLocation, setDistanceKm,
  }

  return (
    /* ── ChatPage-style outer wrapper ────────────────────────────────────── */
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflow="hidden" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box
        maxW="1440px" mx="auto"
        h={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        borderRadius={{ base: 0, md: '20px' }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        display="flex"
        overflow="hidden"
        position="relative"
      >
        {/* ── Sidebar (desktop always visible; mobile: overlay) ───────────── */}
        <Box
          display={{ base: sidebarOpen ? 'flex' : 'none', lg: 'flex' }}
          position={{ base: 'absolute', lg: 'relative' }}
          zIndex={{ base: 20, lg: 'auto' }}
          top={0} left={0} bottom={0}
          flexShrink={0}
        >
          <MainSidebar {...sidebarProps} />
        </Box>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <Box
            display={{ base: 'block', lg: 'none' }}
            position="absolute" inset={0} zIndex={10}
            bg="rgba(0,0,0,0.4)"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Main panel ──────────────────────────────────────────────────── */}
        <Flex direction="column" flex={1} h="100%" overflow="hidden" minW={0} bg={GRAY50}>

          {/* Top bar */}
          <Box px={{ base: 3, md: 5 }} py="12px" bg={WHITE} borderBottom={`1px solid ${GRAY200}`} flexShrink={0}>
            <Flex align="center" gap={2}>
              {/* Mobile sidebar toggle */}
              <Box
                as="button" display={{ base: 'flex', lg: 'none' }}
                alignItems="center" justifyContent="center"
                w="34px" h="34px" borderRadius="9px" flexShrink={0}
                bg={GRAY100} color={GRAY600}
                onClick={() => setSidebarOpen((v) => !v)}
              >
                {sidebarOpen ? <FiX size={16} /> : <FiMenu size={16} />}
              </Box>

              {/* Search */}
              <Flex
                data-tour="search"
                flex={1} align="center" gap={2}
                bg={GRAY50} border={`1px solid ${GRAY200}`} borderRadius="10px"
                px={3} overflow="hidden"
                _focusWithin={{ borderColor: GREEN, boxShadow: `0 0 0 2px ${GREEN}18` }}
                transition="all 0.15s"
              >
                <FiSearch size={14} color={GRAY400} />
                <Input
                  placeholder="Search services, skills, tags…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  border="none" outline="none"
                  _focus={{ boxShadow: 'none' }}
                  bg="transparent" fontSize="13px" color={GRAY800} py="7px" px={0}
                />
                {searchQuery && (
                  <Box as="button" color={GRAY400} onClick={() => setSearchQuery('')}
                    fontSize="11px" fontWeight={700} flexShrink={0} _hover={{ color: GRAY600 }}
                  >
                    ✕
                  </Box>
                )}
              </Flex>

              {/* Type chips + More filters popover — hidden on the smallest screens */}
              <Flex
                gap="6px" align="center" flexShrink={0}
                display={{ base: 'none', sm: 'flex' }}
              >
                <Flex data-tour="type-filter" gap="4px" align="center">
                  {TYPE_FILTERS.map((tf) => {
                    const isActive = activeTypes.has(tf.id)
                    return (
                      <Box
                        key={tf.id} as="button"
                        onClick={() => toggleType(tf.id)}
                        px="11px" py="6px" borderRadius="9999px"
                        fontSize="12px" fontWeight={isActive ? 700 : 500}
                        bg={isActive ? tf.activeBg : WHITE}
                        color={isActive ? tf.activeColor : GRAY600}
                        border={`1px solid ${isActive ? tf.activeBg : GRAY200}`}
                        cursor="pointer" transition="all 0.12s"
                        display="flex" alignItems="center" gap="6px"
                        _hover={isActive ? {} : { borderColor: GRAY400 }}
                      >
                        <Box w="6px" h="6px" borderRadius="full" bg={isActive ? tf.activeColor : tf.dotColor} flexShrink={0} />
                        {tf.label}
                      </Box>
                    )
                  })}
                </Flex>

                <MoreFiltersButton
                  active={secondaryFilters}
                  open={filtersOpen}
                  onOpenChange={setFiltersOpen}
                  onToggle={toggleSecondaryFilter}
                  onClear={() => setSecondaryFilters(new Set())}
                />
              </Flex>
            </Flex>

            {/* Mobile: type chips + More filters in a horizontal scroll row */}
            <Flex
              display={{ base: 'flex', sm: 'none' }}
              gap="6px" mt="8px" overflowX="auto" align="center"
              style={{ scrollbarWidth: 'none' }}
            >
              {TYPE_FILTERS.map((tf) => {
                const isActive = activeTypes.has(tf.id)
                return (
                  <Box
                    key={tf.id} as="button" flexShrink={0}
                    onClick={() => toggleType(tf.id)}
                    px="11px" py="6px" borderRadius="9999px"
                    fontSize="12px" fontWeight={isActive ? 700 : 500}
                    bg={isActive ? tf.activeBg : WHITE}
                    color={isActive ? tf.activeColor : GRAY600}
                    border={`1px solid ${isActive ? tf.activeBg : GRAY200}`}
                    cursor="pointer" transition="all 0.12s"
                    display="flex" alignItems="center" gap="6px"
                  >
                    <Box w="6px" h="6px" borderRadius="full" bg={isActive ? tf.activeColor : tf.dotColor} flexShrink={0} />
                    {tf.label}
                  </Box>
                )
              })}
              <Box flexShrink={0}>
                <MoreFiltersButton
                  active={secondaryFilters}
                  open={filtersOpen}
                  onOpenChange={setFiltersOpen}
                  onToggle={toggleSecondaryFilter}
                  onClear={() => setSecondaryFilters(new Set())}
                  compact
                />
              </Box>
            </Flex>

            {/* Ranking-mode buttons — single-select, default Trending */}
            <Flex
              data-tour="ranking-modes"
              gap="6px"
              mt="10px"
              overflowX="auto"
              align="center"
              style={{ scrollbarWidth: 'none' }}
            >
              {RANKING_BUTTONS.map((btn) => {
                const isActive = rankingMode === btn.id
                const disabled = isRankingButtonDisabled(btn.id, {
                  isAuthenticated,
                  isOnboarded: Boolean(user?.is_onboarded && user?.skills?.length),
                  hasGeo: Boolean(locationEnabled && userLocation),
                })
                return (
                  <Box
                    key={btn.id}
                    as="button"
                    flexShrink={0}
                    title={
                      disabled
                        ? btn.id === 'for_you'
                          ? 'Add your skills to unlock For you'
                          : btn.id === 'nearby'
                            ? 'Enable location to see nearby services'
                            : ''
                        : ''
                    }
                    onClick={() => !disabled && setRankingMode(btn.id)}
                    px="14px"
                    py="7px"
                    borderRadius="9999px"
                    fontSize="12px"
                    fontWeight={isActive ? 700 : 500}
                    bg={isActive ? GREEN : WHITE}
                    color={isActive ? WHITE : disabled ? GRAY400 : GRAY700}
                    border={`1px solid ${isActive ? GREEN : GRAY200}`}
                    transition="all 0.12s"
                    display="flex"
                    alignItems="center"
                    gap="6px"
                    style={{
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.55 : 1,
                    }}
                    _hover={isActive || disabled ? {} : { borderColor: GRAY400 }}
                  >
                    <Box color={isActive ? WHITE : disabled ? GRAY400 : GRAY500}>{btn.icon}</Box>
                    {btn.label}
                  </Box>
                )
              })}
            </Flex>
          </Box>

          {/* Map panel — always visible, fixed height. */}
          <Box bg={WHITE} borderBottom={`1px solid ${GRAY200}`} flexShrink={0} p={3}>
            <MapView
              services={displayServices}
              height="280px"
              onServiceClick={(id) => navigate(`/service-detail/${id}`)}
              userLocation={userLocation}
              isRefreshing={isLoading && services.length > 0}
            />
          </Box>

          {/* Grid */}
          <Box
            flex={1}
            overflowY="auto"
            px={{ base: 3, md: 6 }}
            pt={4}
            pb={8}
          >
            {isLoading && displayServices.length === 0 ? (
              <Flex justify="center" py={16}><Spinner size="lg" color="green.600" /></Flex>
            ) : fetchError && displayServices.length === 0 ? (
              <Flex direction="column" align="center" py={16} gap={3}>
                <Text fontSize="2xl">⚡</Text>
                <Text color="red.500" fontSize="13px">{fetchError}</Text>
              </Flex>
            ) : displayServices.length === 0 ? (
              <Flex direction="column" align="center" py={16} gap={3}>
                <Text fontSize="3xl">🔍</Text>
                <Text color={GRAY500} fontSize="13px">No services found. Be the first to post one!</Text>
                {isAuthenticated && (
                  <Box as="button" px={5} py="9px" borderRadius="9999px" bg={GREEN} color={WHITE}
                    fontSize="13px" fontWeight={700} onClick={() => navigate('/post-offer')}
                    _hover={{ opacity: 0.9 }} transition="opacity 0.15s"
                  >
                    Post a Service
                  </Box>
                )}
              </Flex>
            ) : (
              <Grid
                templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }}
                gap={4}
                alignItems="stretch"
              >
                {displayServices.map((service, idx) => {
                  const owner    = service.user ?? service.provider
                  const isOwn    = !!user && owner?.id === user.id
                  const hs       = handshakeMap.get(service.id)
                  const isRecurr = isEventRecurrent(service)
                  const showBadge = hs && !(isRecurr && hs.status === 'completed')
                  const inList   = isOwn ? (incomingMap.get(service.id) ?? []) : []
                  const pCount   = inList.filter((h) => h.status === 'pending').length
                  const aCount   = inList.filter((h) => ['pending', 'accepted'].includes(h.status)).length

                  return (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      isOwn={isOwn}
                      handshake={showBadge ? hs : undefined}
                      incomingCount={aCount}
                      pendingCount={pCount}
                      onClick={() => navigate(`/service-detail/${service.id}`)}
                      onHover={
                        rankingDebugEnabled
                          ? () => setHoveredServiceId(service.id)
                          : undefined
                      }
                      dataTour={idx === 0 ? 'listing-card' : undefined}
                    />
                  )
                })}
              </Grid>
            )}
            {!isLoading && !fetchError && totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onChange={goToPage}
              />
            )}
          </Box>
        </Flex>
      </Box>
      <DashboardTour />
      {rankingDebugEnabled && (
        <RecommendationDebugBar
          services={displayServices}
          hoveredServiceId={hoveredServiceId}
          activeFilter={rankingMode}
          search={debouncedSearch}
          lat={userLocation?.lat}
          lng={userLocation?.lng}
          distance={debouncedDistance}
        />
      )}
    </Box>
  )
}

// ─── Helpers used by the topbar ───────────────────────────────────────────────

interface RankingDisabledContext {
  isAuthenticated: boolean
  isOnboarded: boolean
  hasGeo: boolean
}

function isRankingButtonDisabled(id: RankingMode, ctx: RankingDisabledContext): boolean {
  if (id === 'for_you') return !ctx.isAuthenticated || !ctx.isOnboarded
  if (id === 'discovery') return !ctx.isAuthenticated || !ctx.isOnboarded
  if (id === 'nearby') return !ctx.hasGeo
  return false
}

interface MoreFiltersButtonProps {
  active: Set<SecondaryFilter>
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (f: SecondaryFilter) => void
  onClear: () => void
  compact?: boolean
}

function MoreFiltersButton({ active, open, onOpenChange, onToggle, onClear, compact }: MoreFiltersButtonProps) {
  const count = active.size
  return (
    <Box position="relative">
      <Box
        as="button"
        onClick={() => onOpenChange(!open)}
        px={compact ? '11px' : '12px'}
        py="6px"
        borderRadius="9999px"
        border={`1px solid ${count > 0 ? GREEN : GRAY200}`}
        bg={count > 0 ? GREEN_LT : WHITE}
        color={count > 0 ? GREEN : GRAY700}
        fontSize="12px"
        fontWeight={count > 0 ? 700 : 500}
        display="flex"
        alignItems="center"
        gap="6px"
        cursor="pointer"
        transition="all 0.12s"
        _hover={{ borderColor: count > 0 ? GREEN : GRAY400 }}
      >
        <FiSliders size={12} />
        Filters
        {count > 0 && (
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            minW="18px"
            h="18px"
            px="5px"
            borderRadius="9999px"
            bg={GREEN}
            color={WHITE}
            fontSize="10px"
            fontWeight={800}
          >
            {count}
          </Box>
        )}
      </Box>
      {open && (
        <>
          <Box
            position="fixed"
            inset={0}
            zIndex={30}
            onClick={() => onOpenChange(false)}
          />
          <Box
            position="absolute"
            top="calc(100% + 6px)"
            right={0}
            w="240px"
            bg={WHITE}
            border={`1px solid ${GRAY200}`}
            borderRadius="12px"
            boxShadow="0 4px 18px rgba(0,0,0,0.10)"
            p="10px"
            zIndex={40}
          >
            <Text fontSize="10px" fontWeight={700} color={GRAY400} px="6px" mb="6px"
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              Refine
            </Text>
            {SECONDARY_FILTERS.map((f) => {
              const isActive = active.has(f.id)
              return (
                <Box
                  key={f.id}
                  as="button"
                  onClick={() => onToggle(f.id)}
                  w="full"
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  px="8px"
                  py="8px"
                  borderRadius="8px"
                  bg={isActive ? GREEN_LT : 'transparent'}
                  color={isActive ? GREEN : GRAY700}
                  fontSize="13px"
                  fontWeight={isActive ? 600 : 500}
                  cursor="pointer"
                  _hover={{ bg: isActive ? GREEN_LT : GRAY100 }}
                  transition="background 0.12s"
                >
                  <Flex align="center" gap="8px">
                    <Box color={isActive ? GREEN : GRAY400}>{f.icon}</Box>
                    {f.label}
                  </Flex>
                  {isActive && <FiCheck size={14} />}
                </Box>
              )
            })}
            <Flex justify="space-between" align="center" mt="6px" pt="8px"
              borderTop={`1px solid ${GRAY100}`}
            >
              <Box
                as="button"
                aria-disabled={count === 0 || undefined}
                onClick={count > 0 ? onClear : undefined}
                fontSize="12px"
                color={GRAY500}
                _hover={{ color: GRAY700 }}
                style={{ cursor: count > 0 ? 'pointer' : 'default', opacity: count > 0 ? 1 : 0.5 }}
              >
                Clear
              </Box>
              <Box
                as="button"
                onClick={() => onOpenChange(false)}
                px="12px"
                py="5px"
                borderRadius="7px"
                bg={GREEN}
                color={WHITE}
                fontSize="12px"
                fontWeight={700}
                cursor="pointer"
                _hover={{ opacity: 0.9 }}
              >
                Done
              </Box>
            </Flex>
          </Box>
        </>
      )}
    </Box>
  )
}

export default DashboardPage
