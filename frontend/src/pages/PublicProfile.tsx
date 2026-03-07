import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Flex, Text, Spinner, Stack } from '@chakra-ui/react'
import {
  FiArrowLeft, FiClock, FiMapPin, FiCalendar,
  FiStar, FiCheckCircle, FiThumbsUp, FiUser, FiAlertCircle,
  FiZap, FiLayers, FiRepeat, FiAward,
} from 'react-icons/fi'
import { useAuthStore } from '@/store/useAuthStore'
import { userAPI } from '@/services/userAPI'
import { serviceAPI } from '@/services/serviceAPI'
import type { User, Service, BadgeProgress, ProfileReview } from '@/types'
import type { UserHistoryItem } from '@/services/userAPI'
import { groupHistoryItems, isOwnHistoryItem, type GroupedHistoryEntry } from '@/utils/historyGrouping'
import {
  GREEN, GREEN_LT, GREEN_DARK,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT, TEAL, ORANGE,
  PURPLE, PURPLE_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'

const AVATAR_PALETTE = [GREEN, BLUE, PURPLE, AMBER, TEAL, ORANGE]
const avatarBg    = (name: string) => AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]
const AVATAR_IMAGE_BG = `linear-gradient(180deg, ${WHITE} 0%, ${GRAY100} 100%)`
const getInitials = (f: string, l: string, e: string) =>
  f && l ? `${f[0]}${l[0]}`.toUpperCase() : (f || l || e || 'U')[0].toUpperCase()
const joinedYear  = (d?: string) => d ? new Date(d).getFullYear() : null
const fmtDate     = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDur      = (d: number | string) => `${Number(d)}h`
const timeAgo    = (d: string) => {
  const sec = (Date.now() - new Date(d).getTime()) / 1000
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`
  return fmtDate(d)
}

// ── Profile review row ───────────────────────────────────────────────────────
function ProfileReviewRow({ review }: { review: ProfileReview }) {
  const col = AVATAR_PALETTE[review.user_name.charCodeAt(0) % AVATAR_PALETTE.length]
  const ini = review.user_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <Flex gap={3} py="10px" borderBottom={`1px solid ${GRAY100}`}>
      {review.user_avatar_url ? (
        <Box w="32px" h="32px" borderRadius="full" flexShrink={0} overflow="hidden"
          style={{ background: AVATAR_IMAGE_BG }}>
          <img
            src={review.user_avatar_url}
            alt={review.user_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </Box>
      ) : (
        <Flex w="32px" h="32px" borderRadius="full" flexShrink={0} align="center" justify="center" style={{ background: col, color: WHITE, fontSize: '11px', fontWeight: 700 }}>{ini}</Flex>
      )}
      <Box flex={1} minW={0}>
        <Flex align="center" gap={2} flexWrap="wrap" mb="4px">
          <Text fontSize="13px" fontWeight={600} color={GRAY800}>{review.user_name}</Text>
          <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700} style={{ background: GREEN_LT, color: GREEN }}><FiCheckCircle size={9} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />Verified</Box>
          {review.handshake_hours != null && (
            <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={600} style={{ background: AMBER_LT, color: AMBER }}>{fmtDur(review.handshake_hours)} exchange</Box>
          )}
          <Text fontSize="11px" color={GRAY400}>{timeAgo(review.created_at)}</Text>
        </Flex>
        {review.service_title && <Text fontSize="11px" color={GRAY500} mb="4px">{review.service_title}</Text>}
        <Text fontSize="13px" color={GRAY700} lineHeight={1.55}>{review.body}</Text>
      </Box>
    </Flex>
  )
}

// ── Shared primitives ─────────────────────────────────────────────────────────
const SectionCard = ({ children, mb = 5 }: { children: React.ReactNode; mb?: number }) => (
  <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow="hidden" mb={mb}
    style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
    {children}
  </Box>
)
const SectionHead = ({ label, right }: { label: string; right?: React.ReactNode }) => (
  <Flex px={4} py="10px" borderBottom={`1px solid ${GRAY100}`} bg={GRAY50}
    align="center" justify="space-between">
    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">{label}</Text>
    {right}
  </Flex>
)

// ── Service mini card ─────────────────────────────────────────────────────────
function ServiceCard({ service, onNav }: { service: Service; onNav: () => void }) {
  const isOffer = service.type === 'Offer'
  const isNeed  = service.type === 'Need'
  const typeColor = isOffer ? GREEN : isNeed ? BLUE : AMBER
  const typeBg    = isOffer ? GREEN_LT : isNeed ? BLUE_LT : AMBER_LT
  const cardBg    = isOffer ? `${GREEN}08` : isNeed ? `${BLUE}08` : `${AMBER}08`
  const borderCol = isOffer ? `${GREEN}30` : isNeed ? `${BLUE}30` : `${AMBER}30`
  return (
    <Box border={`1px solid ${borderCol}`} borderRadius="12px" p="12px 14px" bg={cardBg}
      onClick={onNav} style={{ cursor: 'pointer', transition: 'background 0.12s, box-shadow 0.12s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isOffer ? `${GREEN}14` : isNeed ? `${BLUE}14` : `${AMBER}14`; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.07)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = cardBg; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
      <Flex align="center" mb="8px">
        <Box px="7px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={700}
          style={{ background: typeBg, color: typeColor }}>{service.type}</Box>
      </Flex>
      <Text fontSize="14px" fontWeight={700} color={GRAY800} mb="5px" lineHeight={1.3}
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {service.title}
      </Text>
      {service.description && (
        <Text fontSize="12px" color={GRAY500} mb="8px" lineHeight={1.5}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {service.description}
        </Text>
      )}
      <Flex gap="10px" wrap="wrap">
        <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
          <FiClock size={10} />{fmtDur(service.duration)}
        </Flex>
        {service.location_type && (
          <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
            <FiMapPin size={10} />{service.location_area || service.location_type}
          </Flex>
        )}
      </Flex>
    </Box>
  )
}

// ── History row ───────────────────────────────────────────────────────────────
function HistoryRow({
  item,
  canClick,
  onClick,
  onOpenDetails,
  contextLabel,
}: {
  item: GroupedHistoryEntry
  canClick: boolean
  onClick: () => void
  onOpenDetails: () => void
  contextLabel: string
}) {
  const displayPartner = item.isMultiUse ? `${item.useCount} members` : item.partnerName
  const col = AVATAR_PALETTE[displayPartner.charCodeAt(0) % AVATAR_PALETTE.length]
  const ini = displayPartner.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const handleClick = item.isMultiUse ? onOpenDetails : onClick
  return (
    <Flex align="center" gap={3} py="10px" borderBottom={`1px solid ${GRAY100}`}
      style={{ cursor: canClick ? 'pointer' : 'default' }}
      onMouseEnter={e => { if (canClick) (e.currentTarget as HTMLElement).style.background = GRAY50 }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
      onClick={canClick ? handleClick : undefined}>
      {item.partnerAvatarUrl
        ? (
          <Box w="32px" h="32px" borderRadius="full" flexShrink={0} overflow="hidden"
            style={{ background: AVATAR_IMAGE_BG }}>
            <img
              src={item.partnerAvatarUrl}
              alt={displayPartner}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </Box>
        )
        : <Flex w="32px" h="32px" borderRadius="full" flexShrink={0} align="center" justify="center" style={{ background: col, color: WHITE, fontSize: '11px', fontWeight: 700 }}>{ini}</Flex>
      }
      <Box flex={1} minW={0}>
        <Text fontSize="13px" fontWeight={600} color={GRAY800} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.serviceTitle}</Text>
        <Text fontSize="11px" color={GRAY500}>
          {item.isMultiUse ? `${item.useCount} participants in this one-time session` : `${contextLabel} ${item.partnerName}`}
        </Text>
      </Box>
      <Box textAlign="right" flexShrink={0}>
        <Text fontSize="12px" fontWeight={600} color={GREEN}>{fmtDur(item.duration)}</Text>
        <Text fontSize="10px" color={GRAY400}>{fmtDate(item.completedDate)}</Text>
      </Box>
    </Flex>
  )
}

// ── Badge chip ────────────────────────────────────────────────────────────────
function BadgeChip({ badge }: { badge: BadgeProgress }) {
  return (
    <Flex gap={2} align="center" px={3} py={2} borderRadius="8px"
      style={{ background: badge.earned ? GREEN_LT : GRAY50, border: `1px solid ${badge.earned ? GREEN + '40' : GRAY200}` }}>
      <FiStar size={12} color={badge.earned ? GREEN : GRAY400} />
      <Text fontSize="11px" fontWeight={600} color={badge.earned ? GREEN : GRAY600} flex={1}
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.name}</Text>
      {badge.earned && <FiCheckCircle size={11} color={GREEN} />}
    </Flex>
  )
}

// ── Reputation row ────────────────────────────────────────────────────────────
function RepRow({ icon, label, count, color, bg }: { icon: React.ReactNode; label: string; count: number; color: string; bg: string }) {
  return (
    <Flex align="center" gap={3} py="8px" borderBottom={`1px solid ${GRAY100}`}>
      <Flex w="28px" h="28px" borderRadius="7px" align="center" justify="center" flexShrink={0}
        style={{ background: bg, color }}>{icon}</Flex>
      <Text fontSize="12px" color={GRAY600} flex={1}>{label}</Text>
      <Text fontSize="14px" fontWeight={700} color={count > 0 ? color : GRAY400}>{count}</Text>
    </Flex>
  )
}

// ── 404 state ─────────────────────────────────────────────────────────────────
function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <Flex h="calc(100vh - 64px)" direction="column" align="center" justify="center" gap={3}>
      <FiUser size={40} color={GRAY300} />
      <Text fontSize="18px" fontWeight={700} color={GRAY700}>User not found</Text>
      <Text fontSize="13px" color={GRAY400}>This profile doesn't exist or has been removed.</Text>
      <Box as="button" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
        style={{ background: GRAY100, color: GRAY600, border: `1px solid ${GRAY200}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        onClick={onBack}><FiArrowLeft size={13} />Go back</Box>
    </Flex>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>()
  const navigate   = useNavigate()
  const { user: currentUser } = useAuthStore()

  const [profileUser, setProfileUser] = useState<User | null>(null)
  const [services, setServices]       = useState<Service[]>([])
  const [history, setHistory]         = useState<UserHistoryItem[]>([])
  const [badges, setBadges]           = useState<BadgeProgress[]>([])
  const [reviewsAsProvider, setReviewsAsProvider] = useState<ProfileReview[]>([])
  const [reviewsAsTaker, setReviewsAsTaker]       = useState<ProfileReview[]>([])
  const [reviewsLoading, setReviewsLoading]       = useState(false)
  const [loading, setLoading]         = useState(true)
  const [notFound, setNotFound]       = useState(false)
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<GroupedHistoryEntry | null>(null)

  useEffect(() => {
    if (!userId) return
    if (currentUser && currentUser.id === userId) {
      navigate('/profile', { replace: true })
      return
    }
    const ac = new AbortController()

    const loadProfile = async () => {
      setLoading(true)
      setNotFound(false)

      try {
        const u = await userAPI.getUser(userId, ac.signal)
        setProfileUser(u)
        serviceAPI.list({ user_id: userId, status: 'Active', page_size: 50 }, ac.signal)
          .then(setServices).catch(() => {})
        if (u.show_history) {
          userAPI.getHistory(userId, ac.signal).then(setHistory).catch(() => {})
        }
        userAPI.getBadgeProgress(userId, ac.signal).then(setBadges).catch(() => {})
        setReviewsLoading(true)
        Promise.all([
          userAPI.getVerifiedReviews(userId, { role: 'provider', signal: ac.signal }),
          userAPI.getVerifiedReviews(userId, { role: 'receiver', signal: ac.signal }),
        ]).then(([rProvider, rTaker]) => {
          setReviewsAsProvider(rProvider.results)
          setReviewsAsTaker(rTaker.results)
        }).catch(() => {}).finally(() => setReviewsLoading(false))
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 404) setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()

    return () => ac.abort()
  }, [userId, currentUser, navigate])

  const ownHistory = history.filter(isOwnHistoryItem)
  const groupedOwnHistory = useMemo(() => groupHistoryItems(ownHistory), [ownHistory])

  if (loading || (!notFound && !profileUser)) {
    return <Flex h="calc(100vh - 64px)" align="center" justify="center"><Spinner color={GREEN} size="lg" /></Flex>
  }
  if (notFound || !profileUser) return <NotFoundState onBack={() => navigate(-1)} />

  const displayName = `${profileUser.first_name} ${profileUser.last_name}`.trim() || profileUser.email
  const ini         = getInitials(profileUser.first_name, profileUser.last_name, profileUser.email)
  const bgColor     = avatarBg(displayName)
  const bannerBg = profileUser.banner_url
    ? { backgroundImage: `url(${profileUser.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DARK} 60%, ${AMBER}60 100%)` }

  const offersCount = services.filter(s => s.type === 'Offer').length
  const needsCount  = services.filter(s => s.type === 'Need').length
  const earnedBadges = badges.filter(b => b.earned)
  const punctual    = profileUser.punctual_count ?? 0
  const helpful     = profileUser.helpful_count  ?? 0
  const kind        = profileUser.kind_count     ?? 0
  const hasRep      = punctual + helpful + kind > 0

  return (
    /* Outer grey wrapper — matches Dashboard */
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto" className="no-scrollbar"
      py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>

      {/* ── Dashboard-style card ──────────────────────────────────────────── */}
      <Box maxW="1440px" mx="auto" bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        overflow="hidden">

        {/* ── Banner — Back button floated inside ──────────────────────────── */}
        <Box position="relative" h="180px"
          style={bannerBg}>
          <Box as="button" position="absolute" top="12px" left="20px"
            px="10px" py="6px" borderRadius="8px" fontSize="12px" fontWeight={500}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.28)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: WHITE,
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => navigate(-1)}>
            <FiArrowLeft size={13} />Back
          </Box>
        </Box>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <Box px={{ base: 4, md: 6 }}>

          {/* ── Avatar row — overlaps banner ────────────────────────────────── */}
          <Box mt="-44px" mb={2} position="relative" style={{ zIndex: 2 }}>
            <Box w="88px" h="88px" borderRadius="full" display="inline-flex"
              style={{
                border: `3px solid ${WHITE}`,
                overflow: 'hidden',
                background: profileUser.avatar_url ? AVATAR_IMAGE_BG : bgColor,
                alignItems: 'center', justifyContent: 'center',
                color: WHITE, fontSize: '28px', fontWeight: 700,
                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
              }}>
              {profileUser.avatar_url
                ? <img src={profileUser.avatar_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : ini}
            </Box>
          </Box>

          {/* ── Name + meta — fully below banner ────────────────────────────── */}
          <Flex align="center" justify="space-between" gap={4} mb={5} wrap="wrap">
            <Box minW={0}>
              <Text fontSize="22px" fontWeight={800} color={GRAY800} lineHeight={1.25}
                style={{ wordBreak: 'break-word' }}>
                {displayName}
              </Text>
              <Flex gap={3} mt="4px" wrap="wrap" align="center">
                {profileUser.location && (
                  <Flex align="center" gap="4px" fontSize="12px" color={GRAY500}><FiMapPin size={11} />{profileUser.location}</Flex>
                )}
                {profileUser.date_joined && (
                  <Flex align="center" gap="4px" fontSize="12px" color={GRAY500}><FiCalendar size={11} />Member since {joinedYear(profileUser.date_joined)}</Flex>
                )}
                <Flex align="center" gap="4px" fontSize="12px" color={GREEN} fontWeight={600}><FiStar size={11} />{profileUser.karma_score ?? 0} karma</Flex>
              </Flex>
            </Box>
          </Flex>

          {/* ── Stats strip ──────────────────────────────────────────────────── */}
          <Flex gap={3} mb={6} wrap="wrap">
            {([
              [offersCount,         'Offers',    GREEN,  GREEN_LT,  <FiZap    size={14} />],
              [needsCount,          'Needs',     BLUE,   BLUE_LT,   <FiLayers size={14} />],
              [groupedOwnHistory.length,   'Exchanges', AMBER,  AMBER_LT,  <FiRepeat size={14} />],
              [earnedBadges.length, 'Badges',    PURPLE, PURPLE_LT, <FiAward  size={14} />],
            ] as [number, string, string, string, React.ReactNode][]).map(([val, label, color, bg, icon]) => (
              <Box key={label} bg={WHITE}
                borderRadius="14px"
                border={`1px solid ${GRAY200}`}
                boxShadow="0 1px 6px rgba(0,0,0,0.06)"
                overflow="hidden"
                style={{ flex: '1 0 80px' }}
              >
                <Box h="3px" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
                <Flex direction="column" align="center" px={4} py={3} gap="6px">
                  <Flex w="30px" h="30px" borderRadius="9px" align="center" justify="center"
                    style={{ background: bg, color }}>
                    {icon}
                  </Flex>
                  <Text fontSize="22px" fontWeight={800} color={color} lineHeight={1}>{val}</Text>
                  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.07em">{label}</Text>
                </Flex>
              </Box>
            ))}
          </Flex>

          {/* ── Two-column layout ─────────────────────────────────────────────── */}
          <Flex gap={5} align="flex-start" direction={{ base: 'column', lg: 'row' }} pb={6}>

            {/* Left column */}
            <Box flex={1} minW={0}>
              {profileUser.bio && (
                <SectionCard>
                  <SectionHead label="About" />
                  <Box px={4} py={3}>
                    <Text fontSize="13px" color={GRAY600} lineHeight={1.7}>{profileUser.bio}</Text>
                  </Box>
                </SectionCard>
              )}

              {services.length > 0 && (
                <SectionCard>
                  <SectionHead label={`Active Services (${services.length})`} />
                  <Box p={3} display="grid"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                    {services.map(s => <ServiceCard key={s.id} service={s} onNav={() => navigate(`/service-detail/${s.id}`)} />)}
                  </Box>
                </SectionCard>
              )}

              {profileUser.show_history && (
                <SectionCard>
                  <SectionHead label={`Time Activity (${groupedOwnHistory.length})`} />
                  {groupedOwnHistory.length === 0 ? (
                    <Flex py={8} direction="column" align="center" gap={2}>
                      <FiCheckCircle size={18} color={GRAY300} />
                      <Text fontSize="13px" color={GRAY400}>No time activity on this user&apos;s own services yet</Text>
                    </Flex>
                  ) : (
                    <Box px={4}>
                      {groupedOwnHistory.map((item) => (
                        <HistoryRow
                          key={item.key}
                          item={item}
                          canClick={!!currentUser}
                          contextLabel="Own service with"
                          onClick={() => navigate(`/public-profile/${item.partnerId}`)}
                          onOpenDetails={() => setSelectedHistoryGroup(item)}
                        />
                      ))}
                    </Box>
                  )}
                </SectionCard>
              )}

              <SectionCard mb={0}>
                <SectionHead label="Reviews" />
                {reviewsLoading ? (
                  <Flex py={8} justify="center"><Spinner color={GREEN} size="sm" /></Flex>
                ) : (
                  <Box px={4} py={3}>
                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2}>As a Provider</Text>
                    {reviewsAsProvider.length === 0 ? (
                      <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where they provided the service.</Text>
                    ) : (
                      <Box mb={4}>
                        {reviewsAsProvider.map((r) => <ProfileReviewRow key={r.id} review={r} />)}
                      </Box>
                    )}
                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2} mt={4}>As a Taker</Text>
                    {reviewsAsTaker.length === 0 ? (
                      <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where they received the service.</Text>
                    ) : (
                      <Box>
                        {reviewsAsTaker.map((r) => <ProfileReviewRow key={r.id} review={r} />)}
                      </Box>
                    )}
                  </Box>
                )}
              </SectionCard>
            </Box>

            {/* Right column */}
            <Box w={{ base: '100%', lg: '260px' }} flexShrink={0}>
              {hasRep && (
                <SectionCard>
                  <SectionHead label="Community Reputation" />
                  <Box px={4} pb={2} pt={1}>
                    <RepRow icon={<FiClock size={13} />}     label="Punctual" count={punctual} color={GREEN} bg={GREEN_LT} />
                    <RepRow icon={<FiThumbsUp size={13} />}  label="Helpful"  count={helpful}  color={BLUE}  bg={BLUE_LT} />
                    <RepRow icon={<FiAlertCircle size={13} />} label="Kind"   count={kind}     color={AMBER} bg={AMBER_LT} />
                  </Box>
                </SectionCard>
              )}

              {earnedBadges.length > 0 && (
                <SectionCard mb={0}>
                  <SectionHead label="Badges" />
                  <Stack gap={2} p={3}>
                    {earnedBadges.slice(0, 6).map(b => <BadgeChip key={b.badge_type} badge={b} />)}
                  </Stack>
                </SectionCard>
              )}

              {!hasRep && earnedBadges.length === 0 && (
                <SectionCard mb={0}>
                  <Box px={4} py={6} textAlign="center">
                    <FiUser size={24} color={GRAY300} style={{ margin: '0 auto 8px' }} />
                    <Text fontSize="12px" color={GRAY400}>
                      Reputation and badges will appear here as this user completes exchanges.
                    </Text>
                  </Box>
                </SectionCard>
              )}
            </Box>
          </Flex>
        </Box>
      </Box>

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
          onClick: currentUser ? () => {
            setSelectedHistoryGroup(null)
            navigate(`/public-profile/${item.partner_id}`)
          } : undefined,
        }))}
      />
    </Box>
  )
}

export default PublicProfile
