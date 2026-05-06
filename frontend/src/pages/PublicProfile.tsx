import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Flex, Text, Spinner, Stack } from '@chakra-ui/react'
import {
  FiArrowLeft, FiClock,
  FiStar, FiCheckCircle, FiThumbsUp, FiUser, FiAlertCircle,
  FiUserPlus, FiMessageSquare,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { userAPI } from '@/services/userAPI'
import { getErrorMessage } from '@/services/api'
import { serviceAPI } from '@/services/serviceAPI'
import type { User, Service, BadgeProgress, ProfileReview } from '@/types'
import type { UserHistoryItem } from '@/services/userAPI'
import { groupHistoryItems, isOwnHistoryItem, type GroupedHistoryEntry } from '@/utils/historyGrouping'
import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT, TEAL, ORANGE,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'
import FollowListModal from '@/components/FollowListModal'
import SectionCard from '@/components/ui/SectionCard'
import ProfileHero from '@/components/profile/ProfileHero'
import { TabBtn } from '@/components/ui/TabBtn'
import { ServiceCard } from '@/components/profile/ServiceCard'
import { ProfileReviewRow } from '@/components/profile/ProfileReviewRow'

type PublicProfileTab = 'services' | 'history' | 'reviews'

const AVATAR_PALETTE = [GREEN, BLUE, TEAL, AMBER, '#0D9488', ORANGE]
const AVATAR_IMAGE_BG = `linear-gradient(180deg, ${WHITE} 0%, ${GRAY100} 100%)`
const fmtDate     = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDur      = (d: number | string) => `${Number(d)}h`


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
  const currentUser = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

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
  const [followActionLoading, setFollowActionLoading] = useState(false)
  const [followListModal, setFollowListModal] = useState<'followers' | 'following' | null>(null)
  const [, setReportModalOpen] = useState(false)
  const [activePublicTab, setActivePublicTab] = useState<PublicProfileTab>('services')

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

  const showFollowButton = isAuthenticated && currentUser && userId && currentUser.id !== userId

  const handleFollowToggle = async () => {
    if (!userId || !profileUser || followActionLoading) return
    setFollowActionLoading(true)
    try {
      if (profileUser.is_following) {
        await userAPI.unfollowUser(userId)
        toast.success('You unfollowed this user.')
      } else {
        await userAPI.followUser(userId)
        toast.success('You are now following this user.')
      }
      const refreshed = await userAPI.getUser(userId)
      setProfileUser(refreshed)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update follow status.'))
    } finally {
      setFollowActionLoading(false)
    }
  }

  if (loading || (!notFound && !profileUser)) {
    return <Flex h="calc(100vh - 64px)" align="center" justify="center"><Spinner color={GREEN} size="lg" /></Flex>
  }
  if (notFound || !profileUser) return <NotFoundState onBack={() => navigate(-1)} />

  const earnedBadges  = badges.filter(b => b.earned)
  const punctual      = profileUser.punctual_count ?? 0
  const helpful       = profileUser.helpful_count  ?? 0
  const kind          = profileUser.kind_count     ?? 0
  const hasRep        = punctual + helpful + kind > 0

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto" className="no-scrollbar"
      py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>

      <Box maxW="1440px" mx="auto" bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        overflow="hidden"
        p={{ base: 4, md: 6 }}>

        {/* Back button */}
        <Box
          as="button"
          onClick={() => navigate(-1)}
          mb={4}
          px="10px"
          py="6px"
          borderRadius="999px"
          fontSize="12px"
          fontWeight={600}
          style={{ background: GRAY100, color: GRAY700, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          <FiArrowLeft size={13} /> Back
        </Box>

        {/* ── ProfileHero ───────────────────────────────────────────────────── */}
        <ProfileHero
          user={profileUser}
          mode="public"
          featuredBadges={profileUser.featured_badges_detail ?? []}
          onMessageClick={() => {
            if (!isAuthenticated) {
              toast.info('Sign in to message this user.')
              return
            }
            toast.info('Messaging coming soon.')
          }}
          onReportClick={() => setReportModalOpen(true)}
          onFollowersClick={() => {
            if (!isAuthenticated) { toast.info('Sign in to see followers.'); return }
            setFollowListModal('followers')
          }}
          onFollowingClick={() => {
            if (!isAuthenticated) { toast.info('Sign in to see following.'); return }
            setFollowListModal('following')
          }}
          completedExchanges={groupedOwnHistory.length}
          reputationScore={hasRep ? Math.round(((punctual + helpful + kind) / 3) * 10) / 10 : undefined}
        />

        {/* Follow button (separate from hero action row) */}
        {showFollowButton && (
          <Flex mb={4}>
            {profileUser.is_following ? (
              <Button
                size="sm"
                variant="outline"
                borderRadius="10px"
                borderColor={GRAY300}
                color={GRAY700}
                loading={followActionLoading}
                disabled={followActionLoading}
                onClick={handleFollowToggle}
              >
                <Flex as="span" align="center" gap={2}>
                  <FiCheckCircle size={14} />
                  Unfollow
                </Flex>
              </Button>
            ) : (
              <Button
                size="sm"
                bg={GREEN}
                color={WHITE}
                borderRadius="10px"
                loading={followActionLoading}
                disabled={followActionLoading}
                onClick={handleFollowToggle}
              >
                <Flex as="span" align="center" gap={2}>
                  <FiUserPlus size={14} />
                  Follow
                </Flex>
              </Button>
            )}
          </Flex>
        )}

        {/* ── About (identity-level, above tabs) ───────────────────────────── */}
        {profileUser.bio && (
          <SectionCard label="About" mb={4}>
            <Text fontSize="13px" color={GRAY600} lineHeight={1.7}>{profileUser.bio}</Text>
          </SectionCard>
        )}

        {/* ── Segmented tab control (spec §7) ───────────────────────────────── */}
        <Box
          role="tablist"
          aria-label="Profile sections"
          mb={4}
          px="4px"
          py="4px"
          borderRadius="999px"
          display="inline-flex"
          overflowX="auto"
          style={{ background: GREEN_LT, gap: '2px' }}
        >
          <TabBtn
            tabKey="services"
            active={activePublicTab === 'services'}
            label="Services"
            count={services.length}
            onClick={() => setActivePublicTab('services')}
          />
          {profileUser.show_history && (
            <TabBtn
              tabKey="history"
              active={activePublicTab === 'history'}
              label="History"
              count={groupedOwnHistory.length}
              onClick={() => setActivePublicTab('history')}
            />
          )}
          <TabBtn
            tabKey="reviews"
            active={activePublicTab === 'reviews'}
            label="Reviews"
            count={reviewsAsProvider.length + reviewsAsTaker.length}
            onClick={() => setActivePublicTab('reviews')}
            icon={<FiMessageSquare size={12} />}
          />
        </Box>

        {/* ── Tab content + right sidebar ───────────────────────────────────── */}
        <Flex gap={5} align="flex-start" direction={{ base: 'column', lg: 'row' }} pb={6}>

          {/* Left column — tab-switched content */}
          <Box flex={1} minW={0}>

            {/* services tab */}
            <Box role="tabpanel" id="panel-services" aria-labelledby="tab-services" hidden={activePublicTab !== 'services'}>
            {activePublicTab === 'services' && (
              <>
                {services.length > 0 ? (
                  <SectionCard label={`Active Services (${services.length})`} mb={4}>
                    <Box display="grid"
                      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                      {services.map(s => <ServiceCard key={s.id} service={s} onNav={() => navigate(`/service-detail/${s.id}`)} showStatus={false} />)}
                    </Box>
                  </SectionCard>
                ) : (
                  <Flex py={8} direction="column" align="center" gap={2}>
                    <FiCheckCircle size={18} color={GRAY300} />
                    <Text fontSize="13px" color={GRAY400}>No active services yet.</Text>
                  </Flex>
                )}
              </>
            )}
            </Box>

            {/* history tab */}
            <Box role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={activePublicTab !== 'history'}>
            {activePublicTab === 'history' && profileUser.show_history && (
              <SectionCard label={`Time Activity (${groupedOwnHistory.length})`} mb={4}>
                {groupedOwnHistory.length === 0 ? (
                  <Flex py={8} direction="column" align="center" gap={2}>
                    <FiCheckCircle size={18} color={GRAY300} />
                    <Text fontSize="13px" color={GRAY400}>No time activity on this user&apos;s own services yet</Text>
                  </Flex>
                ) : (
                  <Box>
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
            </Box>

            {/* reviews tab */}
            <Box role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" hidden={activePublicTab !== 'reviews'}>
            {activePublicTab === 'reviews' && (
              <SectionCard label="Reviews" mb={0}>
                {reviewsLoading ? (
                  <Flex py={8} justify="center"><Spinner color={GREEN} size="sm" /></Flex>
                ) : (
                  <Box>
                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2}>As a Provider</Text>
                    {reviewsAsProvider.length === 0 ? (
                      <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where they provided the service.</Text>
                    ) : (
                      <Box mb={4}>{reviewsAsProvider.map((r) => <ProfileReviewRow key={r.id} review={r} showMedia={false} />)}</Box>
                    )}
                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2} mt={4}>As a Taker</Text>
                    {reviewsAsTaker.length === 0 ? (
                      <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where they received the service.</Text>
                    ) : (
                      <Box>{reviewsAsTaker.map((r) => <ProfileReviewRow key={r.id} review={r} showMedia={false} />)}</Box>
                    )}
                  </Box>
                )}
              </SectionCard>
            )}
            </Box>
          </Box>

          {/* Right column */}
          <Box w={{ base: '100%', lg: '260px' }} flexShrink={0}>
            {hasRep && (
              <SectionCard label="Community Reputation" mb={4}>
                <Box>
                  <RepRow icon={<FiClock size={13} />}      label="Punctual" count={punctual} color={GREEN} bg={GREEN_LT} />
                  <RepRow icon={<FiThumbsUp size={13} />}   label="Helpful"  count={helpful}  color={BLUE}  bg={BLUE_LT} />
                  <RepRow icon={<FiAlertCircle size={13} />} label="Kind"    count={kind}     color={AMBER} bg={AMBER_LT} />
                </Box>
              </SectionCard>
            )}

            {earnedBadges.length > 0 && (
              <SectionCard label="Badges" mb={0}>
                <Stack gap={2}>
                  {earnedBadges.slice(0, 6).map(b => <BadgeChip key={b.badge_type} badge={b} />)}
                </Stack>
              </SectionCard>
            )}

            {!hasRep && earnedBadges.length === 0 && (
              <SectionCard mb={0}>
                <Flex direction="column" align="center" py={4} gap={2}>
                  <FiUser size={24} color={GRAY300} />
                  <Text fontSize="12px" color={GRAY400} textAlign="center">
                    Reputation and badges will appear here as this user completes exchanges.
                  </Text>
                </Flex>
              </SectionCard>
            )}
          </Box>
        </Flex>
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

      <FollowListModal
        isOpen={followListModal !== null}
        listKind={followListModal}
        userId={userId ?? null}
        onClose={() => setFollowListModal(null)}
      />
    </Box>
  )
}

export default PublicProfile
