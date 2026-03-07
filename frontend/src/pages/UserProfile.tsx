import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Flex, Text, Input, Textarea, Spinner, Stack } from '@chakra-ui/react'
import {
  FiEdit2, FiCamera, FiSave, FiX, FiAward, FiClock, FiMapPin,
  FiCalendar, FiArrowUpRight, FiPlus, FiCheckCircle, FiStar,
  FiZap, FiLayers, FiRepeat, FiLock, FiSettings, FiMail, FiShield, FiEye, FiEyeOff, FiTag, FiMessageSquare,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { userAPI, dataURLtoBlob } from '@/services/userAPI'
import { serviceAPI } from '@/services/serviceAPI'
import { handshakeAPI, type Handshake as EventHandshake } from '@/services/handshakeAPI'
import { authAPI } from '@/services/authAPI'
import type { Service, BadgeProgress, Tag, ProfileReview } from '@/types'
import type { UserHistoryItem } from '@/services/userAPI'
import WikidataTagAutocomplete from '@/components/WikidataTagAutocomplete'
import { tagAPI } from '@/services/tagAPI'
import { groupHistoryItems, isOwnHistoryItem, type GroupedHistoryEntry } from '@/utils/historyGrouping'
import {
  GREEN, GREEN_LT,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  PURPLE, PURPLE_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE, RED, RED_LT,
} from '@/theme/tokens'
import { getErrorMessage } from '@/services/api'
import ImageCropModal from '@/components/ImageCropModal'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'

const AVATAR_PALETTE = [GREEN, BLUE, PURPLE, AMBER, '#0D9488', '#EA580C']
const avatarBg   = (name: string) => AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length]
const getInitials = (f: string, l: string, e: string) =>
  f && l ? `${f[0]}${l[0]}`.toUpperCase() : (f || l || e || 'U')[0].toUpperCase()
const joinedYear  = (d?: string) => d ? new Date(d).getFullYear() : null
const fmtDate     = (d: string)  => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
        <Box w="32px" h="32px" borderRadius="full" flexShrink={0} style={{ backgroundImage: `url(${review.user_avatar_url})`, backgroundSize: 'cover' }} />
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
const eventTs     = (d?: string | null) => (d ? new Date(d).getTime() : null)

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

// ── Shared primitives ─────────────────────────────────────────────────────────
const SectionCard = ({ children, mb = 5, overflow = 'hidden' }: { children: React.ReactNode; mb?: number; overflow?: string }) => (
  <Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} overflow={overflow} mb={mb}
    style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
    {children}
  </Box>
)
const SectionHead = ({ label, right }: { label: string; right?: React.ReactNode }) => (
  <Flex px={4} py="10px" borderBottom={`1px solid ${GRAY100}`} bg={GRAY50}
    align="center" justify="space-between">
    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em">
      {label}
    </Text>
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
      {/* Type + status badges */}
      <Flex align="center" justify="space-between" mb="8px">
        <Box px="7px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={700}
          style={{ background: typeBg, color: typeColor }}>{service.type}</Box>
        <Box px="7px" py="2px" borderRadius="6px" fontSize="10px" fontWeight={500}
          style={{ background: service.status === 'Active' ? GREEN_LT : GRAY100, color: service.status === 'Active' ? GREEN : GRAY500 }}>{service.status}</Box>
      </Flex>
      {/* Title */}
      <Text fontSize="14px" fontWeight={700} color={GRAY800} mb="5px" lineHeight={1.3}
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {service.title}
      </Text>
      {/* Description */}
      {service.description && (
        <Text fontSize="12px" color={GRAY500} mb="8px" lineHeight={1.5}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {service.description}
        </Text>
      )}
      {/* Meta */}
      <Flex gap="10px" wrap="wrap" mt="auto">
        <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
          <FiClock size={10} />{fmtDur(service.duration)}
        </Flex>
        {service.location_type && (
          <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
            <FiMapPin size={10} />{service.location_area || service.location_type}
          </Flex>
        )}
        {service.schedule_type && (
          <Flex align="center" gap="3px" fontSize="11px" color={GRAY500} fontWeight={500}>
            <FiCalendar size={10} />{service.schedule_type}
          </Flex>
        )}
      </Flex>
    </Box>
  )
}

// ── History row ───────────────────────────────────────────────────────────────
function HistoryRow({
  item,
  onNavigate,
  onOpenDetails,
  contextLabel,
}: {
  item: GroupedHistoryEntry
  onNavigate: () => void
  onOpenDetails: () => void
  contextLabel: string
}) {
  const displayPartner = item.isMultiUse ? `${item.useCount} members` : item.partnerName
  const col = AVATAR_PALETTE[displayPartner.charCodeAt(0) % AVATAR_PALETTE.length]
  const ini = displayPartner.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const handleClick = item.isMultiUse ? onOpenDetails : onNavigate

  return (
    <Flex align="center" gap={3} py="10px" borderBottom={`1px solid ${GRAY100}`} style={{ cursor: 'pointer' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
      onClick={handleClick}>
      {item.partnerAvatarUrl
        ? <Box w="32px" h="32px" borderRadius="full" flexShrink={0} style={{ backgroundImage: `url(${item.partnerAvatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
      {badge.earned
        ? <FiCheckCircle size={11} color={GREEN} />
        : (
          <Box w="36px" h="3px" borderRadius="full" flexShrink={0} style={{ background: GRAY200 }}>
            <Box h="100%" borderRadius="full" style={{ background: GREEN, width: `${Math.min(100, Math.round((badge.current_value / badge.threshold) * 100))}%` }} />
          </Box>
        )}
    </Flex>
  )
}

// ── Pill tab button ───────────────────────────────────────────────────────────
function TabBtn({ active, label, onClick, icon }: { active: boolean; label: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <Box as="button" px="12px" pb="10px" fontSize="12px" fontWeight={active ? 700 : 500}
      onClick={onClick}
      display="inline-flex" alignItems="center" gap="5px"
      style={{
        color: active ? GREEN : GRAY500,
        marginBottom: '-1px',
        cursor: 'pointer', background: 'none', border: 'none',
        borderBottomColor: active ? GREEN : 'transparent',
        borderBottomWidth: '2px', borderBottomStyle: 'solid',
        transition: 'color 0.12s',
        padding: '0 12px 10px 12px',
        whiteSpace: 'nowrap',
      }}>{icon}{label}</Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const UserProfile = () => {
  const navigate = useNavigate()
  const { user, updateUserOptimistically, refreshUser } = useAuthStore()

  // ── Edit state ───────────────────────────────────────────────────────────────
  const [editing, setEditing]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [firstName, setFirstName]       = useState('')
  const [lastName, setLastName]         = useState('')
  const [bio, setBio]                   = useState('')
  const [location, setLocation]         = useState('')
  const [showHistory, setShowHistory]   = useState(false)
  const [editSkills, setEditSkills]     = useState<Tag[]>([])
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  // ── Crop modal state ──────────────────────────────────────────────────────────
  const [cropModal, setCropModal] = useState<{
    open: boolean
    src: string
    type: 'avatar' | 'banner'
  }>({ open: false, src: '', type: 'avatar' })

  // ── Data state ───────────────────────────────────────────────────────────────
  const [services, setServices]           = useState<Service[]>([])
  const [history, setHistory]             = useState<UserHistoryItem[]>([])
  const [badges, setBadges]               = useState<BadgeProgress[]>([])
  const [eventHandshakes, setEventHandshakes] = useState<EventHandshake[]>([])
  const [joinedEventServicesById, setJoinedEventServicesById] = useState<Record<string, Service>>({})
  const [reviewsAsProvider, setReviewsAsProvider] = useState<ProfileReview[]>([])
  const [reviewsAsTaker, setReviewsAsTaker]       = useState<ProfileReview[]>([])
  const [reviewsLoading, setReviewsLoading]       = useState(false)
  const [servicesLoading, setServicesLoading] = useState(true)
  const [historyLoading, setHistoryLoading]   = useState(true)
  const [eventsLoading, setEventsLoading]     = useState(true)
  const [activeTab, setActiveTab]         = useState<ServiceTab>('offers')
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<GroupedHistoryEntry | null>(null)

  // ── Settings / password-change state ─────────────────────────────────────────
  const [pwCurrent, setPwCurrent]       = useState('')
  const [pwNew, setPwNew]               = useState('')
  const [pwConfirm, setPwConfirm]       = useState('')
  const [pwSaving, setPwSaving]         = useState(false)
  const [showPwCurrent, setShowPwCurrent] = useState(false)
  const [showPwNew, setShowPwNew]       = useState(false)
  const [sendingVerification, setSendingVerification] = useState(false)

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '')
      setLastName(user.last_name || '')
      setBio(user.bio || '')
      setLocation(user.location || '')
      setShowHistory(user.show_history ?? false)
    }
  }, [user])

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
    ]).then(([rProvider, rTaker]) => {
      setReviewsAsProvider(rProvider.results)
      setReviewsAsTaker(rTaker.results)
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
          if (result.status === 'fulfilled') {
            next[idsToFetch[index]] = result.value
          }
        })
        if (Object.keys(next).length > 0) {
          setJoinedEventServicesById((prev) => ({ ...prev, ...next }))
        }
      })
      .catch(() => {})

    return () => ac.abort()
  }, [user, eventHandshakes, joinedEventServicesById])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const startEdit = () => {
    if (!user) return
    setFirstName(user.first_name || ''); setLastName(user.last_name || '')
    setBio(user.bio || ''); setLocation(user.location || '')
    setShowHistory(user.show_history ?? false)
    setEditSkills(user.skills ? [...user.skills] : [])
    setAvatarPreview(null); setBannerPreview(null)
    setEditing(true)
  }
  const cancelEdit = () => { setEditing(false); setAvatarPreview(null); setBannerPreview(null); setEditSkills([]) }

  const handleFile = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'avatar' | 'banner',
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onload = () => setCropModal({ open: true, src: r.result as string, type })
    r.readAsDataURL(file)
    e.target.value = ''
  }, [])

  const handleCropConfirm = useCallback((croppedDataUrl: string) => {
    if (cropModal.type === 'avatar') setAvatarPreview(croppedDataUrl)
    else setBannerPreview(croppedDataUrl)
    setCropModal(m => ({ ...m, open: false }))
  }, [cropModal.type])

  const handleCropCancel = useCallback(() => {
    setCropModal(m => ({ ...m, open: false }))
  }, [])

  const ownHistory = history.filter(isOwnHistoryItem)
  const groupedOwnHistory = useMemo(() => groupHistoryItems(ownHistory), [ownHistory])
  const offersTab  = services.filter(s => s.type === 'Offer' && s.status === 'Active')
  const needsTab   = services.filter(s => s.type === 'Need'  && s.status === 'Active')
  const eventServices = services.filter(s => s.type === 'Event' && s.status === 'Active')
  const nowTs = Date.now()
  const createdUpcoming = eventServices.filter((event) => event.status === 'Active' && ((eventTs(event.scheduled_time) ?? nowTs + 1) >= nowTs))
  const joinedUpcoming = eventHandshakes.filter((handshake) => {
    if (!['accepted', 'checked_in', 'attended'].includes(handshake.status)) return false
    const joinedService = joinedEventServicesById[getHandshakeServiceId(handshake)]
    return joinedService ? joinedService.status === 'Active' : true
  })
  const joinedEventCards = joinedUpcoming.map((handshake) => {
    const serviceId = getHandshakeServiceId(handshake)
    return {
      handshake,
      service: joinedEventServicesById[serviceId] ?? handshakeToEventCardService(handshake),
    }
  })

  if (!user) {
    return <Flex h="calc(100vh - 64px)" align="center" justify="center"><Spinner color={GREEN} size="lg" /></Flex>
  }

  const displayName = `${user.first_name} ${user.last_name}`.trim() || user.email
  const ini         = getInitials(user.first_name, user.last_name, user.email)
  const bgColor     = avatarBg(displayName)
  const balance     = user.timebank_balance ?? 0
  const balanceWarn = balance > 10

  const handleSave = async () => {
    setSaving(true)
    try {
      // Resolve all skills to real DB tags (POST /api/tags/ if QID or custom)
      const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      const resolvedSkills = await Promise.all(
        editSkills.map(async (tag) => {
          if (isUuid(tag.id)) return tag          // already a proper DB uuid
          return tagAPI.ensureInDb(tag)      // Wikidata QID → create/find in DB
        })
      )

      // Build a FormData payload so that avatar/banner are sent as real files
      // (multipart), not base64 strings. The backend uploads them to MinIO and
      // stores the resulting public URL in avatar_url / banner_url.
      const fd = new FormData()
      fd.append('first_name', firstName)
      fd.append('last_name', lastName)
      fd.append('bio', bio)
      fd.append('location', location)
      fd.append('show_history', String(showHistory))
      resolvedSkills.forEach(t => fd.append('skill_ids', t.id))
      if (avatarPreview) {
        const blob = dataURLtoBlob(avatarPreview)
        fd.append('avatar', blob, 'avatar.jpg')
      }
      if (bannerPreview) {
        const blob = dataURLtoBlob(bannerPreview)
        fd.append('banner', blob, 'banner.jpg')
      }
      const updated = await userAPI.updateMe(fd)
      updateUserOptimistically(updated)
      await refreshUser()
      setEditing(false); setAvatarPreview(null); setBannerPreview(null)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

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

  const bannerImgSrc = bannerPreview || user.banner_url || null
  const bannerBg = bannerImgSrc
    ? { backgroundImage: `url(${bannerImgSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: `linear-gradient(135deg, ${GREEN} 0%, #1a3a30 60%, ${AMBER}60 100%)` }
  const currentAvatarUrl = avatarPreview || user.avatar_url

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    /* Outer grey background — matches Dashboard outer wrapper */
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto" className="no-scrollbar"
      py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>

      {/* Hidden file inputs */}
      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => handleFile(e, 'avatar')} />
      <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => handleFile(e, 'banner')} />

      {/* ── Dashboard-style inner card ──────────────────────────────────────── */}
      <Box maxW="1440px" mx="auto" bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        overflow="hidden">

        {/* ── Banner ───────────────────────────────────────────────────────── */}
        <Box position="relative" h="180px" style={bannerBg}>
          {editing && (
            <Box position="absolute" inset={0}
              style={{ background: 'rgba(0,0,0,0.38)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => bannerInputRef.current?.click()}>
              <Flex align="center" gap={2} px={4} py="8px" borderRadius="8px"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.45)', color: WHITE }}>
                <FiCamera size={14} />
                <Text fontSize="12px" fontWeight={600}>Change banner</Text>
              </Flex>
            </Box>
          )}
        </Box>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <Box px={{ base: 4, md: 6 }}>

          {/* ── Avatar row — overlaps banner ────────────────────────────────── */}
          <Box mt="-44px" mb={2} position="relative" style={{ zIndex: 2 }}>
            <Box position="relative" display="inline-block">
              <Box w="88px" h="88px" borderRadius="full"
                style={{
                  border: `3px solid ${WHITE}`,
                  overflow: 'hidden',
                  background: currentAvatarUrl ? undefined : bgColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: WHITE, fontSize: '28px', fontWeight: 700,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                }}>
                {currentAvatarUrl
                  ? <img src={currentAvatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : ini}
              </Box>
              {editing && (
                <Box position="absolute" bottom={0} right={0} w="24px" h="24px" borderRadius="full"
                  style={{ background: GREEN, border: `2px solid ${WHITE}`, cursor: 'pointer', color: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => avatarInputRef.current?.click()}>
                  <FiCamera size={11} />
                </Box>
              )}
            </Box>
          </Box>

          {/* ── Name + meta + buttons — fully below banner ──────────────────── */}
          <Flex align="center" justify="space-between" gap={4} mb={5} wrap="wrap">
            <Box minW={0}>
              <Text fontSize="22px" fontWeight={800} color={GRAY800} lineHeight={1.25}
                style={{ wordBreak: 'break-word' }}>
                {displayName}
              </Text>
              <Flex gap={3} mt="4px" wrap="wrap" align="center">
                {user.location && (
                  <Flex align="center" gap="4px" fontSize="12px" color={GRAY500}>
                    <FiMapPin size={11} />{user.location}
                  </Flex>
                )}
                {user.date_joined && (
                  <Flex align="center" gap="4px" fontSize="12px" color={GRAY500}>
                    <FiCalendar size={11} />Joined {joinedYear(user.date_joined)}
                  </Flex>
                )}
                <Flex align="center" gap="4px" fontSize="12px" color={GREEN} fontWeight={600}>
                  <FiStar size={11} />{user.karma_score ?? 0} karma
                </Flex>
              </Flex>
            </Box>
            <Flex gap={2} flexShrink={0} wrap="wrap">
              {editing ? (
                <>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: GRAY100, color: GRAY600, border: `1px solid ${GRAY200}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onClick={cancelEdit}><FiX size={12} />Cancel</Box>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: GREEN, color: WHITE, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.72 : 1, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onClick={saving ? undefined : handleSave}>
                    {saving ? <Spinner size="xs" color="white" /> : <><FiSave size={12} />Save</>}
                  </Box>
                </>
              ) : (
                <>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: WHITE, color: GRAY700, border: `1px solid ${GRAY200}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = WHITE }}
                    onClick={startEdit}><FiEdit2 size={12} />Edit Profile</Box>
                  <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                    style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}40`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    onClick={() => navigate('/achievements')}><FiAward size={12} />Achievements</Box>
                </>
              )}
            </Flex>
          </Flex>

          {/* ── Stats strip ──────────────────────────────────────────────────── */}
          <Flex gap={3} mb={5} wrap="wrap">
            {([
              [offersTab.length,  'Offers',    GREEN,  GREEN_LT,  <FiZap    size={14} />],
              [needsTab.length,   'Needs',     BLUE,   BLUE_LT,   <FiLayers size={14} />],
              [groupedOwnHistory.length, 'Exchanges', AMBER,  AMBER_LT,  <FiRepeat size={14} />],
              [badges.filter(b => b.earned).length, 'Badges', PURPLE, PURPLE_LT, <FiAward size={14} />],
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
                    style={{ background: bg as string, color: color as string }}>
                    {icon}
                  </Flex>
                  <Text fontSize="22px" fontWeight={800} color={color} lineHeight={1}>{val as number}</Text>
                  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.07em">{label}</Text>
                </Flex>
              </Box>
            ))}
          </Flex>

          {/* ── Balance warning ───────────────────────────────────────────────── */}
          {balanceWarn && (
            <Box mb={4} px={4} py={3} borderRadius="10px" fontSize="13px" fontWeight={500}
              style={{ background: RED_LT, border: `1px solid ${RED}40`, color: RED }}>
              Your available time is <strong>{balance}h</strong> — consider sharing it through services in the community.
            </Box>
          )}

          {/* ── Edit form ─────────────────────────────────────────────────────── */}
          {editing && (
            <SectionCard mb={5} overflow="visible">
              <SectionHead label="Edit profile" />
              <Box px={4} py={4}>
                <Flex gap={3} mb={3} direction={{ base: 'column', sm: 'row' }}>
                  <Box flex={1}>
                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">First name</Text>
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)}
                      bg={GRAY50} borderColor={GRAY200} borderRadius="8px" fontSize="13px" />
                  </Box>
                  <Box flex={1}>
                    <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Last name</Text>
                    <Input value={lastName} onChange={e => setLastName(e.target.value)}
                      bg={GRAY50} borderColor={GRAY200} borderRadius="8px" fontSize="13px" />
                  </Box>
                </Flex>
                <Box mb={3}>
                  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Location</Text>
                  <Input value={location} onChange={e => setLocation(e.target.value)}
                    placeholder="City, Country" bg={GRAY50} borderColor={GRAY200} borderRadius="8px" fontSize="13px" />
                </Box>
                <Box mb={3}>
                  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Bio</Text>
                  <Textarea value={bio} onChange={e => setBio(e.target.value)}
                    placeholder="Tell others about yourself…" rows={4}
                    bg={GRAY50} borderColor={GRAY200} borderRadius="8px" fontSize="13px" />
                </Box>
                {/* Skills / Tags */}
                <Box mb={3}>
                  <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Skills &amp; Interests</Text>
                  {/* Tag chips */}
                  {editSkills.length > 0 && (
                    <Flex wrap="wrap" gap="6px" mb="8px">
                      {editSkills.map(tag => (
                        <Flex key={tag.id} align="center" gap="4px" px="9px" py="4px" borderRadius="20px" fontSize="12px" fontWeight={500}
                          style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}40` }}>
                          <FiTag size={10} />
                          {tag.name}
                          <Box as="button" ml="2px" onClick={() => setEditSkills(prev => prev.filter(t => t.id !== tag.id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREEN, padding: 0, display: 'flex', lineHeight: 1 }}>
                            <FiX size={11} />
                          </Box>
                        </Flex>
                      ))}
                    </Flex>
                  )}
                  <WikidataTagAutocomplete
                    selectedTags={editSkills}
                    onAddTag={tag => setEditSkills(prev => prev.some(t => t.id === tag.id) ? prev : [...prev, tag])}
                    disabled={editSkills.length >= 15}
                    accent={GREEN}
                  />
                  <Text fontSize="11px" color={GRAY400} mt="4px">{editSkills.length}/15 tags</Text>
                </Box>

                <Flex align="center" gap={2} style={{ cursor: 'pointer' }} onClick={() => setShowHistory(v => !v)}>
                  <Box w="18px" h="18px" borderRadius="4px" flexShrink={0}
                    style={{ background: showHistory ? GREEN : WHITE, border: `2px solid ${showHistory ? GREEN : GRAY300}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {showHistory && <FiCheckCircle size={10} color={WHITE} />}
                  </Box>
                  <Text fontSize="12px" color={GRAY600}>Show my exchange history on public profile</Text>
                </Flex>
              </Box>
            </SectionCard>
          )}

          {/* ── Bio (read mode) ───────────────────────────────────────────────── */}
          {!editing && (user.bio || (user.skills && user.skills.length > 0)) && (
            <SectionCard>
              {user.bio && (
                <>
                  <SectionHead label="About" />
                  <Box px={4} py={3}>
                    <Text fontSize="13px" color={GRAY600} lineHeight={1.7}>{user.bio}</Text>
                  </Box>
                </>
              )}
              {user.skills && user.skills.length > 0 && (
                <>
                  <SectionHead label="Skills & Interests" />
                  <Box px={4} py={3}>
                    <Flex wrap="wrap" gap="6px">
                      {user.skills.map(tag => (
                        <Flex key={tag.id} align="center" gap="4px" px="9px" py="4px" borderRadius="20px" fontSize="12px" fontWeight={500}
                          style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}40` }}>
                          <FiTag size={10} />{tag.name}
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                </>
              )}
            </SectionCard>
          )}

          {/* ── Main two-column layout ────────────────────────────────────────── */}
          <Flex gap={5} align="flex-start" direction={{ base: 'column', lg: 'row' }} pb={6}>

            {/* Left: Services */}
            <Box flex={1} minW={0}>
              <SectionCard mb={0}>
                {/* Tab bar */}
                <Flex px={4} pt={3} gap={0} borderBottom={`1px solid ${GRAY100}`} style={{ overflowX: 'auto' }}>
                  <TabBtn active={activeTab === 'offers'}   label={`Offers (${offersTab.length})`}  onClick={() => setActiveTab('offers')} />
                  <TabBtn active={activeTab === 'needs'}    label={`Needs (${needsTab.length})`}    onClick={() => setActiveTab('needs')} />
                  <TabBtn active={activeTab === 'events'}   label={`Events (${eventServices.length+joinedUpcoming.length})`} onClick={() => setActiveTab('events')} />
                  <TabBtn active={activeTab === 'history'}  label={`History (${groupedOwnHistory.length})`}   onClick={() => setActiveTab('history')} />
                  <TabBtn active={activeTab === 'reviews'}  label={`Reviews (${reviewsAsProvider.length + reviewsAsTaker.length})`} onClick={() => setActiveTab('reviews')} icon={<FiMessageSquare size={12} />} />
                  <TabBtn active={activeTab === 'settings'} label="Settings"                        onClick={() => setActiveTab('settings')} icon={<FiSettings size={12} />} />
                </Flex>

                {/* ── Offers ── */}
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

                {/* ── Needs ── */}
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

                {/* ── Events ── */}
                {activeTab === 'events' && ((eventsLoading || historyLoading) ? (
                  <Flex py={10} justify="center"><Spinner color={GREEN} /></Flex>
                ) : (createdUpcoming.length === 0 && joinedUpcoming.length === 0) ? (
                  <Flex py={10} direction="column" align="center" gap={3}>
                    <FiCalendar size={22} color={GRAY300} />
                    <Text fontSize="13px" color={GRAY400}>No event activity yet</Text>
                    <Flex gap={2} wrap="wrap">
                      <Box as="button" px="14px" py="7px" borderRadius="8px" fontSize="12px" fontWeight={600}
                        style={{ background: AMBER_LT, color: AMBER, border: `1px solid ${AMBER}40`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        onClick={() => navigate('/post-event')}><FiPlus size={12} />Create Event</Box>
                    </Flex>
                  </Flex>
                ) : (
                  <Box p={3}>
                    {createdUpcoming.length > 0 && (
                      <Box mb={4}>
                        <Text fontSize="11px" fontWeight={700} color={GRAY500} textTransform="uppercase" letterSpacing="0.06em" mb={2}>Upcoming Created</Text>
                        <Box display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
                          {createdUpcoming.map((event) => (
                            <ServiceCard key={event.id} service={event} onNav={() => navigate(`/service-detail/${event.id}`)} />
                          ))}
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

                {/* ── History ── */}
                {activeTab === 'history' && (historyLoading ? (
                  <Flex py={10} justify="center"><Spinner color={GREEN} /></Flex>
                ) : groupedOwnHistory.length === 0 ? (
                  <Flex py={10} direction="column" align="center" gap={2}>
                    <FiRepeat size={22} color={GRAY300} />
                    <Text fontSize="13px" color={GRAY400}>No time activity on your own services yet</Text>
                  </Flex>
                ) : (
                  <Box px={4}>
                    {groupedOwnHistory.map((item) => (
                      <HistoryRow
                        key={item.key}
                        item={item}
                        contextLabel="Own service with"
                        onNavigate={() => navigate(`/public-profile/${item.partnerId}`)}
                        onOpenDetails={() => setSelectedHistoryGroup(item)}
                      />
                    ))}
                  </Box>
                ))}

                {/* ── Reviews ── */}
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
                          <Box mb={4}>
                            {reviewsAsProvider.map((r) => <ProfileReviewRow key={r.id} review={r} />)}
                          </Box>
                        )}
                        <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb={2} mt={4}>As a Taker</Text>
                        {reviewsAsTaker.length === 0 ? (
                          <Text fontSize="12px" color={GRAY400} py={3}>No reviews yet for exchanges where you received the service.</Text>
                        ) : (
                          <Box>
                            {reviewsAsTaker.map((r) => <ProfileReviewRow key={r.id} review={r} />)}
                          </Box>
                        )}
                      </>
                    )}
                  </Box>
                )}

                {/* ── Settings ── */}
                {activeTab === 'settings' && (
                  <Box p={4}>

                    {/* Account info */}
                    <Box mb={5} pb={5} borderBottom={`1px solid ${GRAY100}`}>
                      <Flex align="center" gap={2} mb={3}>
                        <Flex w="26px" h="26px" borderRadius="7px" align="center" justify="center"
                          style={{ background: BLUE_LT, color: BLUE }}><FiMail size={13} /></Flex>
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
                        <Box flex={1} minW="140px" bg={GRAY50} borderRadius="10px" border={`1px solid ${GRAY200}`} px={3} py="10px">
                          <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="3px">TimeBank Balance</Text>
                          <Text fontSize="13px" fontWeight={700} color={balanceWarn ? RED : GREEN}>{balance}h</Text>
                        </Box>
                      </Flex>
                    </Box>

                    {/* Email verification */}
                    <Box mb={5} pb={5} borderBottom={`1px solid ${GRAY100}`}>
                      <Flex align="center" gap={2} mb={3}>
                        <Flex w="26px" h="26px" borderRadius="7px" align="center" justify="center"
                          style={{ background: user.is_verified ? GREEN_LT : AMBER_LT, color: user.is_verified ? GREEN : AMBER }}>
                          <FiShield size={13} />
                        </Flex>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800}>Email Verification</Text>
                      </Flex>
                      {user.is_verified ? (
                        <Flex align="center" gap={2} px={3} py="10px" borderRadius="10px"
                          style={{ background: GREEN_LT, border: `1px solid ${GREEN}40` }}>
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

                    {/* Change password */}
                    <Box>
                      <Flex align="center" gap={2} mb={3}>
                        <Flex w="26px" h="26px" borderRadius="7px" align="center" justify="center"
                          style={{ background: PURPLE_LT, color: PURPLE }}><FiLock size={13} /></Flex>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800}>Change Password</Text>
                      </Flex>
                      <Stack gap={3} maxW="400px">
                        <Box>
                          <Text fontSize="10px" fontWeight={600} color={GRAY400} textTransform="uppercase" letterSpacing="0.06em" mb="5px">Current Password</Text>
                          <Box position="relative">
                            <Input type={showPwCurrent ? 'text' : 'password'} value={pwCurrent}
                              onChange={e => setPwCurrent(e.target.value)}
                              placeholder="Enter current password"
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
                              onChange={e => setPwNew(e.target.value)}
                              placeholder="Min. 8 characters"
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
                            onChange={e => setPwConfirm(e.target.value)}
                            placeholder="Repeat new password"
                            bg={GRAY50} borderRadius="8px" fontSize="13px"
                            borderColor={pwConfirm && pwNew !== pwConfirm ? RED : GRAY200} />
                          {pwConfirm && pwNew !== pwConfirm && (
                            <Text fontSize="11px" color={RED} mt="4px">Passwords do not match</Text>
                          )}
                        </Box>
                        <Box as="button" alignSelf="flex-start" px="16px" py="8px" borderRadius="9px" fontSize="13px" fontWeight={600}
                          style={{ background: PURPLE, color: WHITE, border: 'none', cursor: pwSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: pwSaving ? 0.7 : 1 }}
                          onClick={handleChangePassword}>
                          {pwSaving ? <Spinner size="xs" color="white" /> : <FiLock size={13} />}
                          Update Password
                        </Box>
                      </Stack>
                    </Box>

                  </Box>
                )}
              </SectionCard>
            </Box>

            {/* Right: sidebar cards */}
            <Box w={{ base: '100%', lg: '272px' }} flexShrink={0}>

              {/* Your time */}
              <SectionCard>
                <SectionHead label="Your Time" />
                <Box px={4} py={4} textAlign="center">
                  <Flex align="center" justify="center" gap={2} mb={1}>
                    <FiClock size={22} color={balanceWarn ? RED : GREEN} />
                    <Text fontSize="36px" fontWeight={800} color={balanceWarn ? RED : GREEN} lineHeight={1}>{balance}</Text>
                  </Flex>
                  <Text fontSize="12px" color={GRAY500} mb={3}>hours available</Text>
                  <Flex justify="center" gap={2}>
                    <Box as="button" px="10px" py="6px" borderRadius="7px" fontSize="11px" fontWeight={600}
                      style={{ background: GRAY100, color: GRAY600, cursor: 'pointer' }}
                      onClick={() => navigate('/transaction-history')}>View activity</Box>
                    <Box as="button" px="10px" py="6px" borderRadius="7px" fontSize="11px" fontWeight={600}
                      style={{ background: GREEN_LT, color: GREEN, border: `1px solid ${GREEN}40`, cursor: 'pointer' }}
                      onClick={() => navigate('/post-offer')}>Offer a service</Box>
                  </Flex>
                </Box>
              </SectionCard>

              {/* Quick actions */}
              <SectionCard>
                <SectionHead label="Quick Actions" />
                <Stack gap={0}>
                  {([
                    ['Post an Offer',       '/post-offer',            GREEN,  GREEN_LT],
                    ['Post a Need',         '/post-need',             BLUE,   BLUE_LT],
                    ['Create an Event',     '/post-event',            AMBER,  AMBER_LT],
                    ['View Achievements',   '/achievements',          AMBER,  AMBER_LT],
                    ['Time Activity', '/transaction-history',   PURPLE, PURPLE_LT],
                  ] as [string, string, string, string][]).map(([label, path, color]) => (
                    <Flex key={path} as="button" px={4} py="10px" align="center" justify="space-between"
                      borderBottom={`1px solid ${GRAY100}`} fontSize="12px" fontWeight={500} color={GRAY700}
                      style={{ cursor: 'pointer', background: 'none', border: 'none', borderBottom: `1px solid ${GRAY100}`, textAlign: 'left', width: '100%' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = GRAY50 }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                      onClick={() => navigate(path)}>
                      <Flex align="center" gap={2}>
                        <Box w="6px" h="6px" borderRadius="full" flexShrink={0} style={{ background: color }} />
                        {label}
                      </Flex>
                      <FiArrowUpRight size={12} color={GRAY400} />
                    </Flex>
                  ))}
                </Stack>
              </SectionCard>

              {/* Achievements */}
              {badges.length > 0 && (
                <SectionCard mb={0}>
                  <SectionHead label="Achievements"
                    right={
                      <Box as="button" fontSize="11px" fontWeight={600}
                        style={{ background: 'none', border: 'none', color: GREEN, cursor: 'pointer' }}
                        onClick={() => navigate('/achievements')}>View all</Box>
                    } />
                  <Stack gap={2} p={3}>
                    {badges.slice(0, 5).map(b => <BadgeChip key={b.badge_type} badge={b} />)}
                  </Stack>
                </SectionCard>
              )}
            </Box>
          </Flex>
        </Box>
      </Box>

      {/* ── Crop Modal ──────────────────────────────────────────────────────── */}
      <ImageCropModal
        isOpen={cropModal.open}
        imageSrc={cropModal.src}
        aspect={cropModal.type === 'avatar' ? 1 : 16 / 3}
        cropShape={cropModal.type === 'avatar' ? 'round' : 'rect'}
        title={cropModal.type === 'avatar' ? 'Crop Profile Photo' : 'Crop Banner Image'}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
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
    </Box>
  )
}

export default UserProfile
