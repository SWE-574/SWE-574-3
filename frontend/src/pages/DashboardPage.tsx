import { useState, useEffect, useCallback, useRef } from 'react'
import { usePolling } from '@/hooks/usePolling'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  Input,
  Grid,
  HStack,
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
  FiChevronDown,
  FiChevronUp,
  FiTrendingUp,
  FiGrid,
  FiWifi,
  FiMenu,
  FiX,
} from 'react-icons/fi'
import { MapView } from '@/components/MapView'
import { serviceAPI } from '@/services/serviceAPI'
import { handshakeAPI } from '@/services/handshakeAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Service } from '@/types'
import { MainSidebar } from '@/components/MainSidebar'
import type { Handshake } from '@/services/handshakeAPI'

import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'
import { isNearlyFull } from '@/utils/eventUtils'

const TRANSPARENT = 'transparent'

const DEBOUNCE_SEARCH   = 400
const DEBOUNCE_DISTANCE = 600
const POLL_INTERVAL     = 60_000
const GEO_TIMEOUT       = 10_000

// ─── Filters ──────────────────────────────────────────────────────────────────

const FILTERS = [
  { id: 'all',       label: 'All',       icon: <FiGrid size={12} /> },
  { id: 'newest',    label: 'New',        icon: <FiTrendingUp size={12} /> },
  { id: 'online',    label: 'Online',     icon: <FiWifi size={12} /> },
  { id: 'recurrent', label: 'Recurrent',  icon: <FiRefreshCw size={12} /> },
  { id: 'weekend',   label: 'Weekend',    icon: <FiCalendar size={12} /> },
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

function initials(u?: { first_name?: string; last_name?: string; email?: string } | null) {
  if (!u) return '?'
  const f = u.first_name?.[0] ?? ''
  const l = u.last_name?.[0] ?? ''
  return (f || l) ? `${f}${l}`.toUpperCase() : (u.email?.[0] ?? '?').toUpperCase()
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

// ─── Tiny reusable bits ───────────────────────────────────────────────────────

function Avatar({ u, size = 36 }: { u?: { first_name?: string; last_name?: string; email?: string; avatar_url?: string } | null; size?: number }) {
  return (
    <Box
      w={`${size}px`} h={`${size}px`} borderRadius="full" flexShrink={0}
      bg={GREEN} color={WHITE} overflow="hidden"
      display="flex" alignItems="center" justifyContent="center"
      fontSize={`${Math.round(size * 0.34)}px`} fontWeight={700}
    >
      {u?.avatar_url
        ? <img src={u.avatar_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(u)
      }
    </Box>
  )
}

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
  service, isOwn, handshake, incomingCount, pendingCount, onClick,
}: {
  service: Service
  isOwn: boolean
  handshake?: Handshake
  incomingCount: number
  pendingCount: number
  onClick: () => void
}) {
  const owner     = service.user ?? service.provider
  const isOffer   = service.type === 'Offer'
  const isRecurr  = service.schedule_type === 'Recurrent'
  const gradient  = pickGradient(service)

  const showBadge = handshake && !(isRecurr && handshake.status === 'completed')
  const hsCfg     = showBadge ? HANDSHAKE_BADGE[handshake!.status] : null
  const isDimmed  = handshake?.status === 'denied' || handshake?.status === 'cancelled'

  return (
    <Box
      as="button" onClick={onClick} w="full" textAlign="left"
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
              label={isOffer ? 'Offer' : service.type === 'Event' ? 'Event' : 'Want'}
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

  const [activeFilter, setActiveFilter]             = useState('all')
  const [searchQuery, setSearchQuery]               = useState('')
  const [debouncedSearch, setDebouncedSearch]       = useState('')
  const [services, setServices]                     = useState<Service[]>([])
  const [allActiveServices, setAllActiveServices]   = useState<Service[]>([])
  const [mapOpen, setMapOpen]                       = useState(true)
  const [sidebarOpen, setSidebarOpen]               = useState(false)

  const [userLocation, setUserLocation]             = useState<{ lat: number; lng: number } | null>(null)
  const [distanceKm, setDistanceKm]                 = useState(50)
  const [debouncedDistance, setDebouncedDistance]   = useState(50)
  const [locationEnabled, setLocationEnabled]       = useState(() => localStorage.getItem('locationEnabled') === 'true')
  const [locationLoading, setLocationLoading]       = useState(false)
  const [locationError, setLocationError]           = useState<string | null>(null)
  const locationAutoRequested                       = useRef(false)

  const [handshakeMap, setHandshakeMap]             = useState<Map<string, Handshake>>(new Map())
  const [incomingMap, setIncomingMap]               = useState<Map<string, Handshake[]>>(new Map())

  const searchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const distanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const fetchServices = useCallback(async (signal: AbortSignal) => {
    let raw: typeof services
    if (locationEnabled && userLocation) {
      // Distance filter only affects In-Person — fetch Online separately and merge
      const [nearby, online] = await Promise.all([
        serviceAPI.list({ lat: userLocation.lat, lng: userLocation.lng, distance: debouncedDistance }, signal),
        serviceAPI.list({ search: debouncedSearch || undefined }, signal),
      ])
      const onlineOnly = online.filter((s) => s.location_type === 'Online')
      raw = [...nearby, ...onlineOnly]
    } else {
      raw = await serviceAPI.list(undefined, signal)
    }
    const active = raw.filter((s) => s.status === 'Active' && s.is_visible)
    const unique = Array.from(new Map(active.map((s) => [s.id, s])).values())
    setAllActiveServices(unique)
    let filtered = unique
    if (activeFilter === 'online')    filtered = filtered.filter((s) => s.location_type === 'Online')
    if (activeFilter === 'recurrent') filtered = filtered.filter((s) => s.schedule_type === 'Recurrent')
    if (activeFilter === 'newest')    filtered = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (activeFilter === 'weekend')   filtered = filtered.filter((s) => /saturday|sunday|weekend/i.test(s.schedule_details ?? ''))
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      filtered = filtered.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.name.toLowerCase().includes(q)),
      )
    }
    // Float pinned services to the top
    filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
    setServices(filtered)
  }, [activeFilter, debouncedSearch, locationEnabled, userLocation, debouncedDistance])

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

  // ── Derived ───────────────────────────────────────────────────────────────
  const ownServiceHandshakes = Array.from(incomingMap.values()).flat()
  const myServices         = allActiveServices.filter((s) => { const o = s.user ?? s.provider; return !!user && o?.id === user.id })

  // Hide events from the browse feed where the logged-in user was removed
  // (i.e. their handshake was cancelled by an admin after a report).
  const displayServices = isAuthenticated
    ? services.filter((s) => {
        if (s.type !== 'Event') return true
        const hs = handshakeMap.get(s.id)
        return hs?.status !== 'cancelled'
      })
    : services
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

              {/* Filter pills — hidden on very small screens */}
              <Flex
                gap="3px" bg={GRAY100} p="3px" borderRadius="10px"
                display={{ base: 'none', sm: 'flex' }}
                flexShrink={0}
              >
                {FILTERS.map((f) => (
                  <Box
                    key={f.id} as="button"
                    onClick={() => setActiveFilter(f.id)}
                    px={{ base: '8px', md: '10px' }} py="5px" borderRadius="7px"
                    fontSize="12px" fontWeight={activeFilter === f.id ? 700 : 500}
                    bg={activeFilter === f.id ? WHITE : 'transparent'}
                    color={activeFilter === f.id ? GRAY800 : GRAY500}
                    boxShadow={activeFilter === f.id ? '0 1px 3px rgba(0,0,0,0.09)' : 'none'}
                    cursor="pointer" transition="all 0.12s"
                    display="flex" alignItems="center" gap="4px"
                  >
                    <Box color={activeFilter === f.id ? GREEN : GRAY400}>{f.icon}</Box>
                    <Box display={{ base: 'none', md: 'block' }}>{f.label}</Box>
                  </Box>
                ))}
              </Flex>

              {/* Map toggle */}
              <Box
                as="button" flexShrink={0}
                px="11px" py="7px" borderRadius="9px"
                bg={mapOpen ? GREEN : GRAY100}
                color={mapOpen ? WHITE : GRAY600}
                fontSize="12px" fontWeight={600}
                display="flex" alignItems="center" gap="5px"
                onClick={() => setMapOpen((v) => !v)}
                _hover={{ opacity: 0.9 }} transition="all 0.15s"
              >
                <FiMapPin size={12} />
                <Box display={{ base: 'none', sm: 'block' }}>Map</Box>
                {mapOpen ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}
              </Box>
            </Flex>

            {/* Filter pills row on mobile (below search bar) */}
            <Flex
              display={{ base: 'flex', sm: 'none' }}
              gap="5px" mt="8px" overflowX="auto"
              style={{ scrollbarWidth: 'none' }}
            >
              {FILTERS.map((f) => (
                <Box
                  key={f.id} as="button" flexShrink={0}
                  onClick={() => setActiveFilter(f.id)}
                  px="10px" py="5px" borderRadius="20px"
                  fontSize="12px" fontWeight={activeFilter === f.id ? 700 : 500}
                  bg={activeFilter === f.id ? GREEN : WHITE}
                  color={activeFilter === f.id ? WHITE : GRAY600}
                  border={`1px solid ${activeFilter === f.id ? GREEN : GRAY200}`}
                  cursor="pointer" transition="all 0.12s"
                  display="flex" alignItems="center" gap="4px"
                >
                  <Box color={activeFilter === f.id ? WHITE : GRAY400}>{f.icon}</Box>
                  {f.label}
                </Box>
              ))}
            </Flex>
          </Box>

          {/* Map panel */}
          {mapOpen && (
            <Box bg={WHITE} borderBottom={`1px solid ${GRAY200}`} flexShrink={0}>
              <Flex align="center" px={5} py="10px" gap={4}>
                <Text fontSize="12px" fontWeight={600} color={GRAY700}>Map View</Text>
                <HStack gap={3} fontSize="11px" color={GRAY500}>
                  <Flex align="center" gap="5px"><Box w="7px" h="7px" borderRadius="full" bg={GREEN} />Offers</Flex>
                  <Flex align="center" gap="5px"><Box w="7px" h="7px" borderRadius="full" bg={BLUE} />Wants</Flex>
                </HStack>
                {isLoading && services.length > 0 && (
                  <Flex align="center" gap="5px" ml="auto">
                    <Spinner size="xs" color="gray.400" />
                    <Text fontSize="11px" color={GRAY400}>Refreshing</Text>
                  </Flex>
                )}
              </Flex>
              <MapView
                services={displayServices}
                height="280px"
                onServiceClick={(id) => navigate(`/service-detail/${id}`)}
                userLocation={userLocation}
              />
            </Box>
          )}

          {/* Results count */}
          <Box px={{ base: 4, md: 6 }} pt={4} pb={2} flexShrink={0} bgColor={TRANSPARENT}>
            <Text fontSize="12px" color={GRAY400}>
              {isLoading && displayServices.length === 0 ? 'Loading…' : `${displayServices.length} service${displayServices.length !== 1 ? 's' : ''}`}
            </Text>
          </Box>

          {/* Grid */}
          <Box flex={1} overflowY="auto" px={{ base: 3, md: 6 }} pt={2} pb={8}>
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
                {displayServices.map((service) => {
                  const owner    = service.user ?? service.provider
                  const isOwn    = !!user && owner?.id === user.id
                  const hs       = handshakeMap.get(service.id)
                  const isRecurr = service.schedule_type === 'Recurrent'
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
                    />
                  )
                })}
              </Grid>
            )}
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}

export default DashboardPage
