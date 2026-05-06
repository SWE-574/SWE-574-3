import { useEffect, useMemo, useRef, useState } from 'react'
import UpcomingSchedule from '@/components/profile/UpcomingSchedule'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Grid, Text, Input, Spinner, Stack } from '@chakra-ui/react'
import {
  FiCalendar, FiCheckCircle, FiChevronDown, FiChevronUp,
  FiLayers, FiLock, FiMail, FiMessageSquare, FiPlus,
  FiRepeat, FiSettings, FiShield, FiStar, FiZap, FiEye, FiEyeOff,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { userAPI } from '@/services/userAPI'
import { serviceAPI } from '@/services/serviceAPI'
import { handshakeAPI, type Handshake as EventHandshake } from '@/services/handshakeAPI'
import { authAPI } from '@/services/authAPI'
import type { Service, BadgeProgress, ProfileReview } from '@/types'
import type { UserHistoryItem } from '@/services/userAPI'
import { groupHistoryItems, isOwnHistoryItem, type GroupedHistoryEntry } from '@/utils/historyGrouping'
import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  TEAL,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY800,
  WHITE, RED, RED_LT,
} from '@/theme/tokens'
import { getErrorMessage } from '@/services/api'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'
import FollowListModal from '@/components/FollowListModal'
import SectionCard from '@/components/ui/SectionCard'
import ProfileHero from '@/components/profile/ProfileHero'
import ProfileEditDrawer from '@/components/profile/ProfileEditDrawer'
import { TabBtn } from '@/components/ui/TabBtn'
import { ServiceCard } from '@/components/profile/ServiceCard'
import { ProfileReviewRow } from '@/components/profile/ProfileReviewRow'

// ── Shared helpers (still used by tab content) ─────────────────────────────────
const AVATAR_PALETTE = [GREEN, BLUE, TEAL, AMBER, '#0D9488', '#EA580C']
const AVATAR_IMAGE_BG = `linear-gradient(180deg, ${WHITE} 0%, ${GRAY100} 100%)`
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDur = (d: number | string) => `${Number(d)}h`
const eventTs = (d?: string | null) => (d ? new Date(d).getTime() : null)

function getHandshakeServiceId(handshake: EventHandshake): string {
  if (handshake.service_id) return handshake.service_id
  if (typeof handshake.service === 'string') return handshake.service
  return handshake.service.id
}

function handshakeToEventCardService(handshake: EventHandshake): Service {
  return {
    id: handshake.service_id ?? String(handshake.service),
    title: handshake.service_title,
    description: `${handshake.status.replace('_', ' ').toUpperCase()}`,
    type: 'Event',
    duration: Number(handshake.exact_duration ?? handshake.provisioned_hours ?? 1),
    status: 'Active',
    location_type: 'In-Person',
    location_area: handshake.exact_location ?? undefined,
    max_participants: handshake.max_participants ?? 1,
    participant_count: 0,
    schedule_type: handshake.schedule_type ?? 'One-Time',
    scheduled_time: handshake.scheduled_time ?? null,
    tags: [],
    created_at: handshake.created_at,
    updated_at: handshake.updated_at,
  }
}

type ServiceTab = 'offers' | 'needs' | 'events' | 'history' | 'reviews' | 'settings'

// ── History row ────────────────────────────────────────────────────────────────
function HistoryRow({ item, onNavigate, onOpenDetails, contextLabel }: {
  item: GroupedHistoryEntry
  onNavigate: () => void
  onOpenDetails: () => void
  contextLabel: string
}) {
  const displayPartner = item.isMultiUse ? `${item.useCount} members` : item.partnerName
  const col = AVATAR_PALETTE[displayPartner.charCodeAt(0) % AVATAR_PALETTE.length]
  const ini = displayPartner.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const handleClick = item.serviceType === 'Event' ? onNavigate : (item.isMultiUse ? onOpenDetails : onNavigate)

  return (
    <Flex align="center" gap={3} py="10px" borderBottom={`1px solid ${GRAY100}`} style={{ cursor: 'pointer' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
      onClick={handleClick}>
      {item.partnerAvatarUrl
        ? (
          <Box w="32px" h="32px" borderRadius="full" flexShrink={0} overflow="hidden" style={{ background: AVATAR_IMAGE_BG }}>
            <img src={item.partnerAvatarUrl} alt={displayPartner} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </Box>
        )
        : <Flex w="32px" h="32px" borderRadius="full" flexShrink={0} align="center" justify="center" style={{ background: col, color: WHITE, fontSize: '11px', fontWeight: 700 }}>{ini}</Flex>
      }
      <Box flex={1} minW={0}>
        <Text fontSize="13px" fontWeight={600} color={GRAY800} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.serviceTitle}</Text>
        <Text fontSize="11px" color={GRAY500}>
          {item.serviceType === 'Event'
            ? contextLabel
            : item.isMultiUse
              ? `${item.useCount} participants in this one-time session`
              : `${contextLabel} ${item.partnerName}`}
        </Text>
      </Box>
      <Box textAlign="right" flexShrink={0}>
        {item.serviceType === 'Event' ? (
          <>
            <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700} style={{ background: BLUE_LT, color: BLUE, display: 'inline-block', marginBottom: 2 }}>Event</Box>
            {item.evaluationPending && <Text fontSize="10px" color={AMBER} fontWeight={600}>Evaluation Pending</Text>}
          </>
        ) : (
          <Text fontSize="12px" fontWeight={600} color={GREEN}>{fmtDur(item.duration)}</Text>
        )}
        <Text fontSize="10px" color={GRAY400}>{fmtDate(item.completedDate)}</Text>
      </Box>
    </Flex>
  )
}

// ── Badge chip (sidebar) ───────────────────────────────────────────────────────
function BadgeChip({ badge }: { badge: BadgeProgress }) {
  return (
    <Flex gap={2} align="center" px={3} py={2} borderRadius="8px"
      style={{ background: badge.earned ? GREEN_LT : GRAY50, border: `1px solid ${badge.earned ? GREEN + '40' : GRAY200}` }}>
      <FiStar size={12} color={badge.earned ? GREEN : GRAY400} />
      <Text fontSize="11px" fontWeight={600} color={badge.earned ? GREEN : GRAY600} flex={1}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.name}</Text>
      {badge.earned ? <FiCheckCircle size={11} color={GREEN} /> : (
        <Box w="36px" h="3px" borderRadius="full" flexShrink={0} style={{ background: GRAY200 }}>
          <Box h="100%" borderRadius="full" style={{ background: GREEN, width: `${Math.min(100, Math.round((badge.current_value / badge.threshold) * 100))}%` }} />
        </Box>
      )}
    </Flex>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
const UserProfile = () => {
  const navigate = useNavigate()
  const { user, updateUserOptimistically, refreshUser } = useAuthStore()

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  // ── Profile edit modal state ─────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editInitialTab, setEditInitialTab] = useState<'identity' | 'media' | 'skills' | 'showcase' | 'privacy'>('identity')

  // ── Data state ───────────────────────────────────────────────────────────────
  const [services, setServices]           = useState<Service[]>([])
  const [history, setHistory]             = useState<UserHistoryItem[]>([])
  const [badges, setBadges]               = useState<BadgeProgress[]>([])
  const [reviewsAsProvider, setReviewsAsProvider]   = useState<ProfileReview[]>([])
  const [reviewsAsTaker, setReviewsAsTaker]         = useState<ProfileReview[]>([])
  const [reviewsAsOrganizer, setReviewsAsOrganizer] = useState<ProfileReview[]>([])
  const [expandedEventIds, setExpandedEventIds]     = useState<Set<string>>(new Set())
  const [reviewsLoading, setReviewsLoading]         = useState(false)
  const [eventHandshakes, setEventHandshakes] = useState<EventHandshake[]>([])
  const [joinedEventServicesById, setJoinedEventServicesById] = useState<Record<string, Service>>({})
  const [servicesLoading, setServicesLoading] = useState(true)
  const [historyLoading, setHistoryLoading]   = useState(true)
  const [eventsLoading, setEventsLoading]     = useState(true)
  const [activeTab, setActiveTab]         = useState<ServiceTab>('offers')
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<GroupedHistoryEntry | null>(null)
  const [followListModal, setFollowListModal] = useState<'followers' | 'following' | null>(null)
  const heroCardRef = useRef<HTMLDivElement | null>(null)
  const [heroCardHeight, setHeroCardHeight] = useState<number | null>(null)

  // ── Settings / password-change state ─────────────────────────────────────────
  const [pwCurrent, setPwCurrent]       = useState('')
  const [pwNew, setPwNew]               = useState('')
  const [pwConfirm, setPwConfirm]       = useState('')
  const [pwSaving, setPwSaving]         = useState(false)
  const [showPwCurrent, setShowPwCurrent] = useState(false)
  const [showPwNew, setShowPwNew]       = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)

  useEffect(() => {
    if (!user) return
    const ac = new AbortController()
    setServicesLoading(true)
    serviceAPI.list({ user_id: user.id, page_size: 50 }, ac.signal)
      .then(setServices).catch(() => {}).finally(() => setServicesLoading(false))
    setHistoryLoading(true)
    userAPI.getHistory(user.id, ac.signal)
      .then(setHistory).catch(() => {}).finally(() => setHistoryLoading(false))
    userAPI.getBadgeProgress(user.id, ac.signal).then(setBadges).catch(() => {})
    setEventsLoading(true)
    handshakeAPI.list(ac.signal)
      .then((list) => setEventHandshakes(list.filter((h) => h.service_type === 'Event')))
      .catch(() => {})
      .finally(() => setEventsLoading(false))
    setReviewsLoading(true)
    Promise.all([
      userAPI.getVerifiedReviews(user.id, { role: 'provider', signal: ac.signal }),
      userAPI.getVerifiedReviews(user.id, { role: 'receiver', signal: ac.signal }),
      userAPI.getVerifiedReviews(user.id, { role: 'organizer', signal: ac.signal }),
    ]).then(([rProvider, rTaker, rOrganizer]) => {
      setReviewsAsProvider(rProvider.results)
      setReviewsAsTaker(rTaker.results)
      setReviewsAsOrganizer(rOrganizer.results)
    }).catch(() => {}).finally(() => setReviewsLoading(false))
    return () => ac.abort()
  }, [user])

  useEffect(() => {
    if (!user) return
    const relevant = eventHandshakes.filter((h) => ['accepted', 'checked_in', 'attended'].includes(h.status))
    const idsToFetch = Array.from(new Set(relevant.map(getHandshakeServiceId).filter(Boolean))).filter(
      (id) => !(id in joinedEventServicesById),
    )
    if (idsToFetch.length === 0) return
    const ac = new AbortController()
    Promise.allSettled(idsToFetch.map((id) => serviceAPI.get(id, ac.signal)))
      .then((results) => {
        const next: Record<string, Service> = {}
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') next[idsToFetch[index]] = result.value
        })
        if (Object.keys(next).length > 0) setJoinedEventServicesById((prev) => ({ ...prev, ...next }))
      }).catch(() => {})
    return () => ac.abort()
  }, [user, eventHandshakes, joinedEventServicesById])

  const handleChangePassword = async () => {
    if (!pwNew || !pwCurrent) { toast.error('Please fill in all password fields.'); return }
    if (pwNew !== pwConfirm) { toast.error('New passwords do not match.'); return }
    if (pwNew.length < 8) { toast.error('New password must be at least 8 characters.'); return }
    setPwSaving(true)
    try {
      await authAPI.changePassword(pwCurrent, pwNew)
      toast.success('Password changed successfully.')
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPwSaving(false)
    }
  }

  const handleSendVerification = async () => {
    setSendingVerification(true)
    try {
      await authAPI.sendVerification()
      toast.success('Verification email sent. Check your inbox.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSendingVerification(false)
    }
  }

  const ownHistory = history.filter(isOwnHistoryItem)
  const groupedOwnHistory = useMemo(() => groupHistoryItems(ownHistory), [ownHistory])
  const offersTab  = services.filter(s => s.type === 'Offer' && s.status === 'Active')
  const needsTab   = services.filter(s => s.type === 'Need'  && s.status === 'Active')
  const eventServices = services.filter(s => s.type === 'Event' && s.status === 'Active')

  useEffect(() => {
    const node = heroCardRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      setHeroCardHeight(entry.contentRect.height)
    })
    observer.observe(node)
    setHeroCardHeight(node.getBoundingClientRect().height)

    return () => observer.disconnect()
  }, [user, badges.length, groupedOwnHistory.length, offersTab.length, needsTab.length])

  const createdEventIds = new Set(eventServices.map((event) => String(event.id)))
  const nowTs = Date.now()
  const createdUpcoming = eventServices.filter((event) => event.status === 'Active' && ((eventTs(event.scheduled_time) ?? nowTs + 1) >= nowTs))
  const joinedUpcoming = eventHandshakes.filter((handshake) => {
    if (!['accepted', 'checked_in', 'attended'].includes(handshake.status)) return false
    if (createdEventIds.has(getHandshakeServiceId(handshake))) return false
    const joinedService = joinedEventServicesById[getHandshakeServiceId(handshake)]
    return joinedService ? joinedService.status === 'Active' : true
  })
  const joinedEventCards = joinedUpcoming.map((handshake) => {
    const serviceId = getHandshakeServiceId(handshake)
    return { handshake, service: joinedEventServicesById[serviceId] ?? handshakeToEventCardService(handshake) }
  })

  if (!user) {
    return <Flex h="calc(100vh - 64px)" align="center" justify="center"><Spinner color={GREEN} size="lg" /></Flex>
  }

  const balance     = user.timebank_balance ?? 0
  const balanceWarn = balance > 10

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto" className="no-scrollbar"
      py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>

      <Box maxW="1440px" mx="auto" bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        overflow="hidden"
        p={{ base: 4, md: 6 }}>

        {/* ── Profile hero + schedule ───────────────────────────────────────── */}
        <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 0.95fr) minmax(360px, 0.8fr)' }} gap={4} alignItems="stretch" mb={4}>
          <Box ref={heroCardRef} h="100%">
            <ProfileHero
              user={user}
              mode="own"
              compact
              featuredBadges={user.featured_badges_detail ?? []}
              onEditClick={() => { setEditInitialTab('identity'); setDrawerOpen(true) }}
              onAvatarClick={() => { setEditInitialTab('media'); setDrawerOpen(true) }}
              onBadgePickerOpen={() => { setEditInitialTab('showcase'); setDrawerOpen(true) }}
              onFollowersClick={() => setFollowListModal('followers')}
              onFollowingClick={() => setFollowListModal('following')}
              completedExchanges={groupedOwnHistory.length}
              activeServicesCount={offersTab.length + needsTab.length}
            />
          </Box>
          <Box
            h={{ base: 'auto', xl: heroCardHeight ? `${heroCardHeight}px` : 'auto' }}
            minH={0}
            overflow="hidden"
          >
            <UpcomingSchedule />
          </Box>
        </Grid>

        {/* ── Balance warning ───────────────────────────────────────────────── */}
        {balanceWarn && (
          <Box mb={4} px={4} py={3} borderRadius="10px" fontSize="13px" fontWeight={500}
            style={{ background: RED_LT, border: `1px solid ${RED}40`, color: RED }}>
            Your available time is <strong>{balance}h</strong> — consider sharing it through services in the community.
          </Box>
        )}

        {/* ── Main activity layout ──────────────────────────────────────────── */}
        <Flex gap={5} align="flex-start" direction={{ base: 'column', lg: 'row' }} pb={6}>

          {/* Left: Services + Tabs */}
          <Box flex={1} minW={0}>
            <SectionCard mb={0} overflow="visible">
              {/* ── Segmented tab track ─────────────────────────────────────── */}
              <Box
                role="tablist"
                aria-label="Profile sections"
                px={3}
                py={2}
                borderRadius="999px"
                bg={GRAY100}
                mb={0}
                style={{ overflowX: 'auto', scrollbarWidth: 'none' }}
              >
                <Flex gap={1} style={{ width: 'max-content', minWidth: '100%' }}>
                  <TabBtn tabKey="offers"   active={activeTab === 'offers'}   label="Offers"   count={offersTab.length}  onClick={() => setActiveTab('offers')} />
                  <TabBtn tabKey="needs"    active={activeTab === 'needs'}    label="Needs"    count={needsTab.length}    onClick={() => setActiveTab('needs')} />
                  <TabBtn tabKey="events"   active={activeTab === 'events'}   label="Events"   count={eventServices.length + joinedUpcoming.length} onClick={() => setActiveTab('events')} />
                  <TabBtn tabKey="history"  active={activeTab === 'history'}  label="History"  count={groupedOwnHistory.length} onClick={() => setActiveTab('history')} />
                  <TabBtn tabKey="reviews"  active={activeTab === 'reviews'}  label="Reviews"  count={reviewsAsProvider.length + reviewsAsTaker.length + reviewsAsOrganizer.length} onClick={() => setActiveTab('reviews')} icon={<FiMessageSquare size={12} />} />
                  <TabBtn tabKey="settings" active={activeTab === 'settings'} label="Settings" onClick={() => setActiveTab('settings')} icon={<FiSettings size={12} />} />
                </Flex>
              </Box>

              {/* ── Offers ── */}
              <Box role="tabpanel" id="panel-offers" aria-labelledby="tab-offers" hidden={activeTab !== 'offers'}>
              {activeTab === 'offers' && (servicesLoading ? (
                <Flex py={10} justify="center"><Spinner color={GREEN} /></Flex>
              ) : offersTab.length === 0 ? (
                <Flex py={10} direction="column" align="center" gap={3}>
                  <FiZap size={22} color={GRAY300} />
                  <Text fontSize="13px" color={GRAY400}>No active offers yet</Text>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}40`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => navigate('/post-offer')}><FiPlus size={12} />Post an Offer</Box>
                </Flex>
              ) : (
                <Box p={3} display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                  {offersTab.map(s => <ServiceCard key={s.id} service={s} onNav={() => navigate(`/service-detail/${s.id}`)} />)}
                </Box>
              ))}
              </Box>

              {/* ── Needs ── */}
              <Box role="tabpanel" id="panel-needs" aria-labelledby="tab-needs" hidden={activeTab !== 'needs'}>
              {activeTab === 'needs' && (servicesLoading ? (
                <Flex py={10} justify="center"><Spinner color={GREEN} /></Flex>
              ) : needsTab.length === 0 ? (
                <Flex py={10} direction="column" align="center" gap={3}>
                  <FiLayers size={22} color={GRAY300} />
                  <Text fontSize="13px" color={GRAY400}>No active needs yet</Text>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: BLUE_LT, color: BLUE, border: `1px solid ${BLUE}40`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => navigate('/post-need')}><FiPlus size={12} />Post a Need</Box>
                </Flex>
              ) : (
                <Box p={3} display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                  {needsTab.map(s => <ServiceCard key={s.id} service={s} onNav={() => navigate(`/service-detail/${s.id}`)} />)}
                </Box>
              ))}
              </Box>

              {/* ── Events ── */}
              <Box role="tabpanel" id="panel-events" aria-labelledby="tab-events" hidden={activeTab !== 'events'}>
              {activeTab === 'events' && ((eventsLoading || historyLoading) ? (
                <Flex py={10} justify="center"><Spinner color={GREEN} /></Flex>
              ) : (createdUpcoming.length === 0 && joinedUpcoming.length === 0) ? (
                <Flex py={10} direction="column" align="center" gap={3}>
                  <FiCalendar size={22} color={GRAY300} />
                  <Text fontSize="13px" color={GRAY400}>No event activity yet</Text>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: AMBER_LT, color: AMBER, border: `1px solid ${AMBER}40`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => navigate('/post-event')}><FiPlus size={12} />Create Event</Box>
                </Flex>
              ) : (
                <Box p={3}>
                  {createdUpcoming.length > 0 && (
                    <Box mb={4}>
                      <Text fontSize="11px" fontWeight={700} color={GRAY500} textTransform="uppercase" letterSpacing="0.06em" mb={2}>Upcoming Created</Text>
                      <Box display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                        {createdUpcoming.map((event) => <ServiceCard key={event.id} service={event} onNav={() => navigate(`/service-detail/${event.id}`)} />)}
                      </Box>
                    </Box>
                  )}
                  {joinedEventCards.length > 0 && (
                    <Box mb={4}>
                      <Text fontSize="11px" fontWeight={700} color={GRAY500} textTransform="uppercase" letterSpacing="0.06em" mb={2}>Upcoming Joined</Text>
                      <Box display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                        {joinedEventCards.map(({ handshake, service }) => (
                          <ServiceCard key={handshake.id} service={service} onNav={() => navigate(`/service-detail/${service.id}`)} />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              ))}
              </Box>

              {/* ── History ── */}
              <Box role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={activeTab !== 'history'}>
              {activeTab === 'history' && (historyLoading ? (
                <Flex py={10} justify="center"><Spinner color={GREEN} /></Flex>
              ) : groupedOwnHistory.length === 0 ? (
                <Flex py={10} direction="column" align="center" gap={2}>
                  <FiRepeat size={22} color={GRAY300} />
                  <Text fontSize="13px" color={GRAY400}>No activity yet</Text>
                </Flex>
              ) : (
                <Box px={4}>
                  {groupedOwnHistory.map((item) => (
                    <HistoryRow
                      key={item.key}
                      item={item}
                      contextLabel={item.serviceType === 'Event' ? 'Attended' : 'Own service with'}
                      onNavigate={() => navigate(item.serviceType === 'Event' ? `/service-detail/${item.serviceId}` : `/public-profile/${item.partnerId}`)}
                      onOpenDetails={() => setSelectedHistoryGroup(item)}
                    />
                  ))}
                </Box>
              ))}
              </Box>

              {/* ── Reviews ── */}
              <Box role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" hidden={activeTab !== 'reviews'}>
              {activeTab === 'reviews' && (
                <Box px={4} py={3}>
                  {reviewsLoading ? (
                    <Flex py={10} justify="center"><Spinner color={GREEN} size="sm" /></Flex>
                  ) : (
                    <>
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2}>As a Provider</Text>
                      {reviewsAsProvider.length === 0 ? (
                        <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where you provided the service.</Text>
                      ) : (
                        <Box mb={4}>{reviewsAsProvider.map((r) => <ProfileReviewRow key={r.id} review={r} />)}</Box>
                      )}
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2} mt={4}>As a Taker</Text>
                      {reviewsAsTaker.length === 0 ? (
                        <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where you received the service.</Text>
                      ) : (
                        <Box>{reviewsAsTaker.map((r) => <ProfileReviewRow key={r.id} review={r} />)}</Box>
                      )}
                      <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2} mt={4}>As an Organizer</Text>
                      {reviewsAsOrganizer.length === 0 ? (
                        <Text fontSize="12px" color={GRAY400} py={3}>No event reviews yet.</Text>
                      ) : (() => {
                        const grouped = new Map<string, { title: string; reviews: ProfileReview[] }>()
                        reviewsAsOrganizer.forEach((r) => {
                          const key = r.service
                          if (!grouped.has(key)) grouped.set(key, { title: r.service_title ?? 'Event', reviews: [] })
                          grouped.get(key)!.reviews.push(r)
                        })
                        return (
                          <Box>
                            {Array.from(grouped.entries()).map(([eventId, { title, reviews }]) => {
                              const isExpanded = expandedEventIds.has(eventId)
                              const toggle = () => setExpandedEventIds((prev) => {
                                const next = new Set(prev)
                                if (isExpanded) { next.delete(eventId) } else { next.add(eventId) }
                                return next
                              })
                              return (
                                <Box key={eventId} mb={2} borderRadius="12px" border={`1px solid ${GRAY100}`} overflow="hidden">
                                  <Flex as="button" w="100%" align="center" justify="space-between" px={3} py="10px" bg={GRAY50} onClick={toggle}
                                    style={{ cursor: 'pointer', border: 'none', textAlign: 'left' }}>
                                    <Flex align="center" gap={2} minW={0}>
                                      <FiCalendar size={13} color={GREEN} />
                                      <Text fontSize="13px" fontWeight={600} color={GRAY800} overflow="hidden" style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Text>
                                      <Box px="6px" py="1px" borderRadius="full" fontSize="10px" fontWeight={700} bg={GREEN_LT} color={GREEN} flexShrink={0}>
                                        {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
                                      </Box>
                                    </Flex>
                                    {isExpanded ? <FiChevronUp size={14} color={GRAY400} /> : <FiChevronDown size={14} color={GRAY400} />}
                                  </Flex>
                                  {isExpanded && <Box px={3}>{reviews.map((r) => <ProfileReviewRow key={r.id} review={r} />)}</Box>}
                                </Box>
                              )
                            })}
                          </Box>
                        )
                      })()}
                    </>
                  )}
                </Box>
              )}
              </Box>

              {/* ── Settings ── */}
              <Box role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={activeTab !== 'settings'}>
              {activeTab === 'settings' && (
                <Box p={4}>
                  <Box mb={5} pb={5} borderBottom={`1px solid ${GRAY100}`}>
                    <Flex align="center" gap={2} mb={3}>
                      <Flex w="26px" h="26px" borderRadius="7px" align="center" justify="center" style={{ background: BLUE_LT, color: BLUE }}><FiMail size={13} /></Flex>
                      <Text fontSize="13px" fontWeight={700} color={GRAY800}>Account Information</Text>
                    </Flex>
                    <Flex gap={3} direction={{ base: 'column', sm: 'row' }} wrap="wrap">
                      <Box flex={1} minW="180px" bg={GRAY50} borderRadius="10px" border={`1px solid ${GRAY200}`} px={3} py="10px">
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="3px">Email</Text>
                        <Text fontSize="13px" fontWeight={500} color={GRAY800}>{user.email}</Text>
                      </Box>
                      <Box flex={1} minW="140px" bg={GRAY50} borderRadius="10px" border={`1px solid ${GRAY200}`} px={3} py="10px">
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="3px">Member Since</Text>
                        <Text fontSize="13px" fontWeight={500} color={GRAY800}>{user.date_joined ? new Date(user.date_joined).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Text>
                      </Box>
                    </Flex>
                  </Box>

                  <Box mb={5} pb={5} borderBottom={`1px solid ${GRAY100}`}>
                    <Flex align="center" gap={2} mb={3}>
                      <Flex w="26px" h="26px" borderRadius="7px" align="center" justify="center" style={{ background: user.is_verified ? GREEN_LT : AMBER_LT, color: user.is_verified ? GREEN : AMBER }}>
                        <FiShield size={13} />
                      </Flex>
                      <Text fontSize="13px" fontWeight={700} color={GRAY800}>Email Verification</Text>
                    </Flex>
                    {user.is_verified ? (
                      <Flex align="center" gap={2} px={3} py="10px" borderRadius="10px" style={{ background: GREEN_LT, border: `1px solid ${GREEN}40` }}>
                        <FiCheckCircle size={14} color={GREEN} />
                        <Text fontSize="13px" fontWeight={500} color={GREEN}>Your email is verified</Text>
                      </Flex>
                    ) : (
                      <Box px={3} py={3} borderRadius="10px" style={{ background: AMBER_LT, border: `1px solid ${AMBER}40` }}>
                        <Text fontSize="13px" color="#92400E" mb={2}>Your email is not verified. Verify it to unlock all features.</Text>
                        <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                          style={{ background: AMBER, color: WHITE, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', opacity: sendingVerification ? 0.7 : 1 }}
                          onClick={handleSendVerification}>
                          {sendingVerification ? <Spinner size="xs" color="white" /> : <FiMail size={12} />}
                          Send Verification Email
                        </Box>
                      </Box>
                    )}
                  </Box>

                  <Box>
                    <Flex align="center" gap={2} mb={3}>
                      <Flex w="26px" h="26px" borderRadius="7px" align="center" justify="center" style={{ background: GREEN_LT, color: GREEN }}><FiLock size={13} /></Flex>
                      <Text fontSize="13px" fontWeight={700} color={GRAY800}>Change Password</Text>
                    </Flex>
                    <Stack gap={3} maxW="400px">
                      <Box>
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Current Password</Text>
                        <Box position="relative">
                          <Input type={showPwCurrent ? 'text' : 'password'} value={pwCurrent}
                            onChange={e => setPwCurrent(e.target.value)} placeholder="Enter current password"
                            bg={GRAY50} borderColor={GRAY200} borderRadius="8px" fontSize="13px" pr="40px" />
                          <Box as="button" position="absolute" right="10px" top="50%" transform="translateY(-50%)"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY400, display: 'flex', padding: 0 }}
                            onClick={() => setShowPwCurrent(v => !v)}>
                            {showPwCurrent ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                          </Box>
                        </Box>
                      </Box>
                      <Box>
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">New Password</Text>
                        <Box position="relative">
                          <Input type={showPwNew ? 'text' : 'password'} value={pwNew}
                            onChange={e => setPwNew(e.target.value)} placeholder="Min. 8 characters"
                            bg={GRAY50} borderColor={GRAY200} borderRadius="8px" fontSize="13px" pr="40px" />
                          <Box as="button" position="absolute" right="10px" top="50%" transform="translateY(-50%)"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: GRAY400, display: 'flex', padding: 0 }}
                            onClick={() => setShowPwNew(v => !v)}>
                            {showPwNew ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                          </Box>
                        </Box>
                      </Box>
                      <Box>
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Confirm New Password</Text>
                        <Input type="password" value={pwConfirm}
                          onChange={e => setPwConfirm(e.target.value)} placeholder="Repeat new password"
                          bg={GRAY50} borderRadius="8px" fontSize="13px"
                          borderColor={pwConfirm && pwNew !== pwConfirm ? RED : GRAY200} />
                        {pwConfirm && pwNew !== pwConfirm && <Text fontSize="11px" color={RED} mt="4px">Passwords do not match</Text>}
                      </Box>
                      <Box as="button" alignSelf="flex-start" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
                        style={{ background: GREEN, color: WHITE, border: 'none', cursor: pwSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: pwSaving ? 0.7 : 1 }}
                        onClick={handleChangePassword}>
                        {pwSaving ? <Spinner size="xs" color="white" /> : <FiLock size={13} />}
                        Update Password
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              )}
              </Box>
            </SectionCard>
          </Box>

          {badges.length > 0 && (
            <Box w={{ base: '100%', lg: '272px' }} flexShrink={0}>
              <SectionCard mb={0} label="Achievements" right={
                <Box as="button" fontSize="11px" fontWeight={700}
                  px="10px" py="4px" borderRadius="999px"
                  style={{ background: GREEN_LT, border: `1px solid ${GREEN}30`, color: GREEN, cursor: 'pointer' }}
                  onClick={() => navigate('/achievements')}>View all</Box>
              }>
                <Stack gap={2}>
                  {badges.slice(0, 5).map(b => <BadgeChip key={b.badge_type} badge={b} />)}
                </Stack>
              </SectionCard>
            </Box>
          )}
        </Flex>
      </Box>

      {/* ── ProfileEditDrawer ─────────────────────────────────────────────────── */}
      <ProfileEditDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        badgeProgress={badges}
        initialTab={editInitialTab}
        onSaved={(updated) => {
          updateUserOptimistically(updated)
        }}
      />

      <MultiUseDetailsModal
        isOpen={!!selectedHistoryGroup}
        title={selectedHistoryGroup?.serviceTitle ?? 'Session details'}
        subtitle={selectedHistoryGroup
          ? `${selectedHistoryGroup.useCount} participants completed this one-time session.`
          : undefined}
        onClose={() => setSelectedHistoryGroup(null)}
        items={(selectedHistoryGroup?.items ?? []).map((item) => ({
          id: `${item.service_id}:${item.partner_id}:${item.completed_date}`,
          title: item.partner_name,
          subtitle: 'Joined this session',
          meta: fmtDate(item.completed_date),
          value: fmtDur(item.duration),
          avatarUrl: item.partner_avatar_url,
          onClick: () => {
            setSelectedHistoryGroup(null)
            navigate(`/public-profile/${item.partner_id}`)
          },
        }))}
      />

      <FollowListModal
        isOpen={followListModal !== null}
        listKind={followListModal}
        userId={user.id}
        onClose={() => setFollowListModal(null)}
      />
    </Box>
  )
}

export default UserProfile
