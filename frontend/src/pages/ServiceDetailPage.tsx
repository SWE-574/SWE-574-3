import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react'
import {
  FiArrowLeft, FiClock, FiCalendar, FiMapPin, FiMonitor,
  FiUsers, FiStar, FiFlag, FiMessageSquare, FiSend,
  FiAlertTriangle, FiRefreshCw, FiCheckCircle, FiExternalLink,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { serviceAPI } from '@/services/serviceAPI'
import { commentAPI } from '@/services/commentAPI'
import { handshakeAPI } from '@/services/handshakeAPI'
import { MapView } from '@/components/MapView'
import EventRosterModal from '@/components/EventRosterModal'
import EventChatModal from '@/components/EventChatModal'
import ServiceEvaluationModal from '@/components/ServiceEvaluationModal'
import {
  isWithinLockdownWindow, isFutureEvent, isEventFull, isNearlyFull,
  spotsLeft, formatEventDateTime, timeUntilEvent, isEventBanned, formatBanExpiry,
} from '@/utils/eventUtils'
import type { Service } from '@/types'
import type { Comment } from '@/services/commentAPI'
import type { Handshake } from '@/services/handshakeAPI'

import {
  GREEN, GREEN_LT,
  BLUE, BLUE_LT,
  AMBER, AMBER_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

// ─── Handshake badge config ───────────────────────────────────────────────────

const HS_BADGE: Record<Handshake['status'], { label: string; bg: string; color: string }> = {
  pending:    { label: 'Pending',    bg: '#fef9c3', color: '#854d0e' },
  accepted:   { label: 'Accepted',   bg: '#dcfce7', color: '#166534' },
  completed:  { label: 'Completed',  bg: '#d1fae5', color: '#065f46' },
  denied:     { label: 'Declined',   bg: '#fee2e2', color: '#991b1b' },
  cancelled:  { label: 'Cancelled',  bg: '#f3f4f6', color: '#6b7280' },
  reported:   { label: 'Reported',   bg: '#fee2e2', color: '#991b1b' },
  paused:     { label: 'Paused',     bg: '#e0f2fe', color: '#0369a1' },
  checked_in: { label: 'Checked In', bg: '#d1fae5', color: '#065f46' },
  attended:   { label: 'Attended',   bg: '#d1fae5', color: '#065f46' },
  no_show:    { label: 'No-Show',    bg: '#fee2e2', color: '#991b1b' },
}

// ─── Report options ───────────────────────────────────────────────────────────

type ReportType = 'inappropriate_content' | 'spam' | 'service_issue' | 'scam' | 'harassment' | 'other'

const REPORT_OPTIONS: { value: ReportType; label: string; desc: string }[] = [
  { value: 'inappropriate_content', label: 'Inappropriate content', desc: 'Offensive or violates guidelines' },
  { value: 'spam',                  label: 'Spam',                  desc: 'Misleading or fake content' },
  { value: 'scam',                  label: 'Scam or fraud',         desc: 'Attempting to deceive users' },
  { value: 'harassment',            label: 'Harassment',            desc: 'Abusive or threatening behavior' },
  { value: 'service_issue',         label: 'Service issue',         desc: 'Problem with quality or description' },
  { value: 'other',                 label: 'Other',                 desc: 'Something else not listed above' },
]

// ─── Gradient picker (same logic as DashboardPage) ───────────────────────────

const CARD_GRADIENTS: Record<string, [string, string]> = {
  music:     ['#7C3AED', '#4F46E5'],
  art:       ['#DB2777', '#BE185D'],
  tech:      ['#0369A1', '#1D4ED8'],
  cook:      ['#D97706', '#B45309'],
  sport:     ['#16A34A', '#15803D'],
  lang:      ['#DC2626', '#B91C1C'],
  teach:     ['#2D5C4E', '#1a3d35'],
  need:      ['#1D4ED8', '#1e3a8a'],
  default_o: ['#2D5C4E', '#1a4a3a'],
}

function pickGradient(service: Service): [string, string] {
  if (service.type === 'Event') return ['#D97706', '#B45309']
  if (service.type === 'Need') return CARD_GRADIENTS.need
  const txt = (service.title + ' ' + service.tags?.map((t) => t.name).join(' ')).toLowerCase()
  if (/music|guitar|piano|drum|sing/.test(txt))   return CARD_GRADIENTS.music
  if (/art|paint|draw|design|photo/.test(txt))    return CARD_GRADIENTS.art
  if (/tech|code|program|dev|web|soft/.test(txt)) return CARD_GRADIENTS.tech
  if (/cook|food|bak|chef|recipe/.test(txt))      return CARD_GRADIENTS.cook
  if (/sport|yoga|fitness|run|gym/.test(txt))     return CARD_GRADIENTS.sport
  if (/lang|english|spanish|french/.test(txt))    return CARD_GRADIENTS.lang
  if (/teach|tutor|lesson|class/.test(txt))       return CARD_GRADIENTS.teach
  return CARD_GRADIENTS.default_o
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userInitials(name: string) {
  return name.split(' ').map((n) => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago`
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDuration(d: string | number) {
  const n = Number(d)
  if (isNaN(n)) return String(d)
  return n === 1 ? '1 hour' : `${n} hours`
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  return (
    <Box
      w={`${size}px`} h={`${size}px`} borderRadius="full" flexShrink={0}
      bg={GREEN} color={WHITE} overflow="hidden"
      display="flex" alignItems="center" justifyContent="center"
      fontSize={`${Math.round(size * 0.35)}px`} fontWeight={700}
    >
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : userInitials(name)
      }
    </Box>
  )
}

// ─── Info tile ────────────────────────────────────────────────────────────────

function InfoTile({ icon, label, value, accentBg, accentColor }: {
  icon: React.ReactNode; label: string; value: string
  accentBg?: string; accentColor?: string
}) {
  return (
    <Flex align="center" gap={3} p="12px" borderRadius="12px" bg={GRAY50} border={`1px solid ${GRAY200}`}>
      <Flex
        w="34px" h="34px" borderRadius="9px" flexShrink={0}
        bg={accentBg ?? GREEN_LT} color={accentColor ?? GREEN}
        align="center" justify="center"
      >
        {icon}
      </Flex>
      <Box minW={0}>
        <Text fontSize="10px" color={GRAY400} fontWeight={600} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </Text>
        <Text fontSize="13px" fontWeight={700} color={GRAY800}
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {value}
        </Text>
      </Box>
    </Flex>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skel({ h = '16px', w = '100%' }: { h?: string; w?: string }) {
  return <Box h={h} w={w} borderRadius="6px" bg={GRAY100} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
}

function LoadingSkeleton() {
  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={5} px={5}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <Box maxW="1260px" mx="auto">
        <Skel h="20px" w="100px" />
        <Grid templateColumns={{ base: '1fr', lg: '1fr 360px' }} gap={5} mt={5}>
          <Stack gap={5}>
            <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} overflow="hidden">
              <Box h="140px" bg={GRAY200} />
              <Box p={6}><Skel h="24px" w="60%" /><Box mt={4} /><Skel /><Box mt={2} /><Skel w="80%" /></Box>
            </Box>
          </Stack>
          <Stack gap={4}>
            <Box bg={WHITE} borderRadius="16px" border={`1px solid ${GRAY200}`} p={5} h="180px"><Skel w="60%" /></Box>
          </Stack>
        </Grid>
      </Box>
    </Box>
  )
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ onClose, onSubmit, loading }: {
  onClose: () => void; onSubmit: (t: ReportType) => void; loading: boolean
}) {
  const [selected, setSelected] = useState<ReportType>('inappropriate_content')
  return (
    <Box
      position="fixed" inset={0} zIndex={200}
      bg="rgba(0,0,0,0.55)"
      display="flex" alignItems="center" justifyContent="center"
      p={4} onClick={onClose}
    >
      <Box
        bg={WHITE} borderRadius="20px" w="100%" maxW="440px" p={6}
        boxShadow="0 20px 60px rgba(0,0,0,0.2)"
        onClick={(e) => e.stopPropagation()}
      >
        <Text fontWeight={800} fontSize="18px" color={GRAY800} mb="4px">Report this listing</Text>
        <Text fontSize="13px" color={GRAY500} mb={5}>Select a reason. Moderators will review your report.</Text>
        <Stack gap={2} mb={5}>
          {REPORT_OPTIONS.map((opt) => (
            <Box
              key={opt.value}
              as="label"
              display="flex" alignItems="flex-start" gap={3} p={3}
              borderRadius="10px" border="1px solid"
              borderColor={selected === opt.value ? '#FCA5A5' : GRAY200}
              bg={selected === opt.value ? RED_LT : WHITE}
              cursor="pointer" transition="all 0.15s"
            >
              <input type="radio" name="reportType" value={opt.value}
                checked={selected === opt.value} onChange={() => setSelected(opt.value)}
                style={{ marginTop: '3px', accentColor: RED }} />
              <Box>
                <Text fontSize="14px" fontWeight={600} color={GRAY800}>{opt.label}</Text>
                <Text fontSize="12px" color={GRAY500}>{opt.desc}</Text>
              </Box>
            </Box>
          ))}
        </Stack>
        <Flex gap={2}>
          <Box as="button" flex={1} py="10px" borderRadius="10px"
            bg={RED} color={WHITE} fontSize="14px" fontWeight={700}
            display="flex" alignItems="center" justifyContent="center" gap="6px"
            onClick={() => !loading && onSubmit(selected)}
            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer', border: 'none' }}
          >
            <FiSend size={14} /> {loading ? 'Submitting…' : 'Submit Report'}
          </Box>
          <Box as="button" flex={1} py="10px" borderRadius="10px"
            bg={GRAY100} color={GRAY700} fontSize="14px" fontWeight={600}
            onClick={onClose}
            style={{ border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1 }}
          >
            Cancel
          </Box>
        </Flex>
      </Box>
    </Box>
  )
}

// ─── Comment Section ──────────────────────────────────────────────────────────

function CommentSection({ serviceId }: { serviceId: string }) {
  const [comments, setComments]   = useState<Comment[]>([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    try { const r = await commentAPI.list(serviceId); setComments(r.results) }
    catch { /* silent */ }
    finally { setLoading(false) }
  }, [serviceId])

  useEffect(() => { load() }, [load])

  return (
    <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} overflow="hidden"
      boxShadow="0 2px 8px rgba(0,0,0,0.04)"
    >
      <Box px={6} py={5} borderBottom={`1px solid ${GRAY100}`}>
        <Flex align="center" gap={2}>
          <FiMessageSquare size={16} color={GREEN} />
          <Text fontWeight={700} fontSize="16px" color={GRAY800}>
            Reviews {comments.length > 0 && `(${comments.length})`}
          </Text>
        </Flex>
        <Text fontSize="12px" color={GRAY400} mt="3px">
          Reviews are left automatically after a completed exchange.
        </Text>
      </Box>

      <Box px={6} py={5}>
        {loading ? (
          <Stack gap={4}>
            {[1, 2].map((i) => (
              <Flex key={i} gap={3}><Skel h="32px" w="32px" /><Box flex={1}><Skel w="40%" /><Box mt={2} /><Skel /></Box></Flex>
            ))}
          </Stack>
        ) : comments.length === 0 ? (
          <Flex direction="column" align="center" py={6} gap={2}>
            <Text fontSize="2xl">💬</Text>
            <Text fontSize="13px" color={GRAY400}>No reviews yet — be the first to exchange!</Text>
          </Flex>
        ) : (
          <Stack gap={5}>
            {comments.map((c) => (
              <Box key={c.id}>
                <Flex gap={3}>
                  <Avatar name={c.user_name} url={c.user_avatar_url} size={34} />
                  <Box flex={1}>
                    <Flex align="center" gap={2} flexWrap="wrap" mb="5px">
                      <Text fontSize="13px" fontWeight={700} color={GRAY800}>{c.user_name}</Text>
                      {c.is_verified_review && (
                        <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700}
                          bg={GREEN_LT} color={GREEN} display="flex" alignItems="center" gap="3px"
                        >
                          <FiCheckCircle size={9} /> Verified
                        </Box>
                      )}
                      {c.handshake_hours && (
                        <Box px="6px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700}
                          bg={AMBER_LT} color={AMBER} display="flex" alignItems="center" gap="3px"
                        >
                          <FiClock size={9} /> {c.handshake_hours}h exchange
                        </Box>
                      )}
                      <Text fontSize="11px" color={GRAY400}>{timeAgo(c.created_at)}</Text>
                    </Flex>
                    <Text fontSize="14px" color={GRAY700} lineHeight={1.6}>
                      {c.is_deleted ? <em style={{ color: GRAY400 }}>Review deleted</em> : c.body}
                    </Text>
                  </Box>
                </Flex>
                {c.replies?.length > 0 && (
                  <Stack mt={3} ml="46px" pl={4} borderLeft={`2px solid ${GRAY100}`} gap={3}>
                    {c.replies.map((r) => (
                      <Flex key={r.id} gap={3}>
                        <Avatar name={r.user_name} url={r.user_avatar_url} size={26} />
                        <Box flex={1}>
                          <Flex align="center" gap={2} mb="3px">
                            <Text fontSize="12px" fontWeight={700} color={GRAY800}>{r.user_name}</Text>
                            <Text fontSize="11px" color={GRAY400}>{timeAgo(r.created_at)}</Text>
                          </Flex>
                          <Text fontSize="13px" color={GRAY700}>
                            {r.is_deleted ? <em style={{ color: GRAY400 }}>Deleted</em> : r.body}
                          </Text>
                        </Box>
                      </Flex>
                    ))}
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ServiceDetailPage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const [service, setService]           = useState<Service | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [handshakes, setHandshakes]     = useState<Handshake[]>([])
  const [interestLoading, setInterestLoading] = useState(false)
  const [showReport, setShowReport]     = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [alreadyReported, setAlreadyReported] = useState(false)
  const [imgIdx, setImgIdx]             = useState(0)

  // ─── Event-specific state ────────────────────────────────────────────────────────────
  const [joinLoading, setJoinLoading]       = useState(false)
  const [leaveLoading, setLeaveLoading]     = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [cancelLoading, setCancelLoading]   = useState(false)
  const [showRoster, setShowRoster]         = useState(false)
  const [showEventChat, setShowEventChat]   = useState(false)
  const [completing, setCompleting]         = useState(false)
  const [markingAttendedId, setMarkingAttendedId] = useState<string | null>(null)
  const [showEvaluationModal, setShowEvaluationModal] = useState(false)

  useEffect(() => {
    if (!id) return
    const ctrl = new AbortController()
    setLoading(true)
    serviceAPI.get(id, ctrl.signal)
      .then(setService)
      .catch((e) => { if (!ctrl.signal.aborted) setError(e.message ?? 'Failed to load') })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [id])

  useEffect(() => {
    if (!isAuthenticated) return
    handshakeAPI.list().then(setHandshakes).catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    if (!user?.id || !service?.id) return
    setAlreadyReported(localStorage.getItem(`reported:${user.id}:${service.id}`) === '1')
  }, [user?.id, service?.id])

  // ── Derived ───────────────────────────────────────────────────────────────
  const provider   = service?.user ?? null
  const provId     = provider && typeof provider === 'object' ? provider.id : null
  const provName   = provider && typeof provider === 'object'
    ? `${provider.first_name ?? ''} ${provider.last_name ?? ''}`.trim() || (provider.email ?? 'User')
    : 'Unknown'

  const isOwn      = !!user?.id && provId === user.id
  const isRecurr   = service?.schedule_type === 'Recurrent'
  const isFull     = service != null && service.max_participants > 0
    && (service.participant_count ?? 0) >= service.max_participants
  const isOffer    = service?.type === 'Offer'
  const isEvent    = service?.type === 'Event'

  const exId = (val: unknown): string | undefined => {
    if (!val) return undefined
    if (typeof val === 'string') return val
    if (typeof val === 'object' && 'id' in (val as Record<string, unknown>)) return (val as { id: string }).id
  }

  const myHandshake = handshakes.find((h) => exId(h.service) === service?.id && exId(h.requester) === user?.id)
  const hasInterest = !!myHandshake && ['pending', 'accepted'].includes(myHandshake.status)
  const incoming    = handshakes.filter((h) => exId(h.service) === service?.id && exId(h.requester) !== user?.id)
  const currentUserId = user?.id ?? null
  const completedHandshakes = !isEvent && !!currentUserId
    ? handshakes.filter((h) =>
      exId(h.service) === service?.id
      && h.status === 'completed'
      && (isOwn ? exId(h.requester) !== currentUserId : exId(h.requester) === currentUserId)
    )
    : []
  const evaluationHandshake = completedHandshakes[0]
  const evaluationCounterpartName = evaluationHandshake
    ? (isOwn ? evaluationHandshake.requester_name : evaluationHandshake.provider_name)
    : 'counterpart'

  // Event-specific derived value — must come after exId / isEvent
  const myEventHandshake = isEvent
    ? handshakes.find((h) =>
        exId(h.service) === service?.id &&
        exId(h.requester) === user?.id &&
        ['accepted', 'checked_in', 'attended', 'no_show'].includes(h.status)
      )
    : undefined

  const handleExpressInterest = async () => {
    if (!service) return
    if (!isAuthenticated) { navigate('/login'); return }
    setInterestLoading(true)
    try {
      await serviceAPI.expressInterest(service.id)
      toast.success('Interest expressed! Head to Messages to chat.')
      setHandshakes(await handshakeAPI.list())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string; code?: string } } }
      const code = err.response?.data?.code
      const detail = err.response?.data?.detail
      if (code === 'ALREADY_EXISTS') { toast.info('You already have an active request.'); handshakeAPI.list().then(setHandshakes).catch(() => {}) }
      else if (code === 'INSUFFICIENT_BALANCE') toast.error(detail ?? 'Insufficient TimeBank balance.')
      else toast.error(detail ?? 'Could not express interest. Please try again.')
    } finally { setInterestLoading(false) }
  }

  const handleReport = async (type: ReportType) => {
    if (!service) return
    setReportLoading(true)
    try {
      await serviceAPI.report(service.id, type, '')
      toast.success('Report submitted. Thank you for keeping the community safe.')
      if (user?.id) localStorage.setItem(`reported:${user.id}:${service.id}`, '1')
      setAlreadyReported(true); setShowReport(false)
    } catch { toast.error('Failed to submit report.') }
    finally { setReportLoading(false) }
  }

  // ─── Event Handlers ─────────────────────────────────────────────────────────────────

  const handleJoinEvent = async () => {
    if (!service || !isAuthenticated) { navigate('/login'); return }
    setJoinLoading(true)
    try {
      await handshakeAPI.joinEvent(service.id)
      toast.success('You\'ve joined the event!')
      setHandshakes(await handshakeAPI.list())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Could not join event.')
    } finally { setJoinLoading(false) }
  }

  const handleLeaveEvent = async () => {
    if (!myEventHandshake) return
    setLeaveLoading(true)
    try {
      await handshakeAPI.leaveEvent(myEventHandshake.id)
      toast.success('You have left the event.')
      setHandshakes(await handshakeAPI.list())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Could not leave event.')
    } finally { setLeaveLoading(false) }
  }

  const handleCheckin = async () => {
    if (!myEventHandshake) return
    setCheckinLoading(true)
    try {
      await handshakeAPI.checkin(myEventHandshake.id)
      toast.success('Checked in! See you there.')
      setHandshakes(await handshakeAPI.list())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Could not check in.')
    } finally { setCheckinLoading(false) }
  }

  const handleCompleteEvent = async () => {
    if (!service) return
    setCompleting(true)
    try {
      await serviceAPI.completeEvent(service.id)
      toast.success('Event marked complete!')
      setShowRoster(false)
      const updated = await serviceAPI.get(service.id)
      setService(updated)
      setHandshakes(await handshakeAPI.list())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Could not complete event.')
    } finally { setCompleting(false) }
  }

  const handleMarkAttended = async (handshakeId: string) => {
    setMarkingAttendedId(handshakeId)
    try {
      await handshakeAPI.markAttended(handshakeId)
      toast.success('Attendance marked.')
      setHandshakes(await handshakeAPI.list())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Could not mark attendance.')
    } finally {
      setMarkingAttendedId(null)
    }
  }

  const handleEvaluationSubmitted = async () => {
    if (!service) return
    try {
      const [freshService, freshHandshakes] = await Promise.all([
        serviceAPI.get(service.id),
        handshakeAPI.list(),
      ])
      setService(freshService)
      setHandshakes(freshHandshakes)
    } catch {
      // Keep current UI state; submission success is already acknowledged in modal.
    }
  }

  const handleCancelEvent = async () => {
    if (!service) return
    const inLockdown = isWithinLockdownWindow(service.scheduled_time)
    const hasParticipants = (service.participant_count ?? 0) > 0
    const confirmMsg = inLockdown && hasParticipants
      ? 'You are in the 24h lockdown window. Cancelling now will apply a 30-day event creation ban. Continue?'
      : 'Are you sure you want to cancel this event? All participants will be notified.'
    if (!window.confirm(confirmMsg)) return
    setCancelLoading(true)
    try {
      await serviceAPI.cancelEvent(service.id)
      toast.success('Event cancelled.')
      navigate('/dashboard')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail ?? 'Could not cancel event.')
    } finally { setCancelLoading(false) }
  }

  if (loading) return <LoadingSkeleton />

  if (error || !service) {
    return (
      <Box bg={GRAY50} minH="calc(100vh - 64px)" display="flex" alignItems="center" justifyContent="center">
        <Box textAlign="center" p={8}>
          <Text fontSize="3xl" mb={3}><FiAlertTriangle /></Text>
          <Text fontSize="18px" fontWeight={700} color={GRAY700} mb={4}>{error ?? 'Service not found'}</Text>
          <Box as="button" px={5} py="10px" borderRadius="10px" bg={GREEN} color={WHITE}
            fontSize="14px" fontWeight={600} onClick={() => navigate('/dashboard')}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            Back to Browse
          </Box>
        </Box>
      </Box>
    )
  }

  const gradient      = pickGradient(service)

  const images        = service.media?.filter((m) => (m.media_type ?? 'image') === 'image') ?? []
  const fillPct       = service.max_participants > 1
    ? Math.min(100, ((service.participant_count ?? 0) / service.max_participants) * 100) : 0

  return (
    <Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 3, md: 5 }} px={{ base: 3, md: 5 }}>
      <Box maxW="1260px" mx="auto">

        {/* Back */}
        <Box
          as="button" onClick={() => navigate(-1)}
          display="flex" alignItems="center" gap="6px"
          fontSize="13px" fontWeight={600} color={GRAY500}
          mb={4} pb={0}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = GRAY800 }}
          onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = GRAY500 }}
        >
          <FiArrowLeft size={15} /> Back to Browse
        </Box>

        <Grid templateColumns={{ base: '1fr', lg: '1fr 360px' }} gap={5} alignItems="start">

          {/* ── LEFT ──────────────────────────────────────────────────────── */}
          <Stack gap={5}>

            {/* Hero card */}
            <Box bg={WHITE} borderRadius="20px" border={`1px solid ${GRAY200}`} overflow="hidden"
              boxShadow="0 2px 12px rgba(0,0,0,0.06)"
            >
              {/* Gradient header */}
              <Box
                h="148px" position="relative" overflow="hidden"
                style={{ background: `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 100%)` }}
              >
                {/* Hero image overlay */}
                {images.length > 0 && (
                  <>
                    <img src={images[imgIdx]?.file_url} alt=""
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <Box style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.1) 60%)' }} />
                  </>
                )}
                {/* Decorative circles when no image */}
                {images.length === 0 && (
                  <>
                    <Box style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
                    <Box style={{ position: 'absolute', bottom: '-40px', left: '40%', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                  </>
                )}
                {/* Title + type */}
                <Box position="absolute" bottom={0} left={0} right={0} px={6} pb={5}>
                  <Flex align="center" gap="8px" mb="6px" flexWrap="wrap">
                    <Box px="8px" py="3px" borderRadius="full" fontSize="11px" fontWeight={700}
                      bg="rgba(255,255,255,0.2)" color={WHITE}
                      style={{ backdropFilter: 'blur(8px)' }}
                    >
                      {isOffer ? 'Offer' : isEvent ? 'Event' : 'Want'}
                    </Box>
                    {isRecurr && !isEvent && (
                      <Box px="8px" py="3px" borderRadius="full" fontSize="11px" fontWeight={700}
                        bg="rgba(255,255,255,0.15)" color={WHITE}
                        display="flex" alignItems="center" gap="4px"
                        style={{ backdropFilter: 'blur(8px)' }}
                      >
                        <FiRefreshCw size={10} /> Recurring
                      </Box>
                    )}
                  </Flex>
                  <Text fontSize="22px" fontWeight={800} color={WHITE} lineHeight={1.2}
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}
                  >
                    {service.title}
                  </Text>
                </Box>
                {/* Image thumb strip */}
                {images.length > 1 && (
                  <Flex position="absolute" top={3} right={3} gap={1}>
                    {images.slice(0, 5).map((_, i) => (
                      <Box key={i} as="button" w="6px" h="6px" borderRadius="full"
                        bg={i === imgIdx ? WHITE : 'rgba(255,255,255,0.45)'}
                        onClick={() => setImgIdx(i)}
                        style={{ border: 'none', cursor: 'pointer', padding: 0 }}
                      />
                    ))}
                  </Flex>
                )}
              </Box>

              <Box px={6} py={5}>
                {/* Provider strip */}
                <Flex align="center" justify="space-between" mb={5} pb={5}
                  borderBottom={`1px solid ${GRAY100}`}
                >
                  <Flex align="center" gap={3}>
                    <Avatar
                      name={provName}
                      url={provider && typeof provider === 'object' ? provider.avatar_url : null}
                      size={40}
                    />
                    <Box>
                      <Text fontSize="14px" fontWeight={700} color={GRAY800}>{provName}</Text>
                      <Text fontSize="12px" color={GRAY400}>Posted {timeAgo(service.created_at)}</Text>
                    </Box>
                  </Flex>
                  {provId && (
                    <Box
                      as="button" px="12px" py="6px" borderRadius="9px"
                      bg={GRAY50} color={GRAY600} fontSize="12px" fontWeight={600}
                      border={`1px solid ${GRAY200}`}
                      display="flex" alignItems="center" gap="5px"
                      onClick={() => navigate(`/public-profile/${provId}`)}
                      _hover={{ bg: GRAY100 }} transition="background 0.15s"
                      style={{ cursor: 'pointer' }}
                    >
                      <FiExternalLink size={12} /> View Profile
                    </Box>
                  )}
                </Flex>

                {/* Info tiles */}
                <Grid templateColumns={{ base: '1fr 1fr', md: 'repeat(4, 1fr)' }} gap={3} mb={6}>
                  {isEvent ? (
                    <>
                      <InfoTile
                        icon={<FiCalendar size={15} />} label="Date & Time"
                        value={formatEventDateTime(service.scheduled_time)}
                        accentBg={AMBER_LT} accentColor={AMBER}
                      />
                      <InfoTile
                        icon={<FiClock size={15} />} label="Time Until"
                        value={isFutureEvent(service.scheduled_time) ? timeUntilEvent(service.scheduled_time) : 'Event started'}
                        accentBg={AMBER_LT} accentColor={AMBER}
                      />
                    </>
                  ) : (
                    <>
                      <InfoTile icon={<FiClock size={15} />} label="Duration" value={fmtDuration(service.duration)} />
                      <InfoTile
                        icon={<FiCalendar size={15} />} label="Schedule"
                        value={`${service.schedule_type}${service.schedule_details ? ` · ${service.schedule_details}` : ''}`}
                        accentBg={AMBER_LT} accentColor={AMBER}
                      />
                    </>
                  )}
                  <InfoTile
                    icon={service.location_type === 'Online' ? <FiMonitor size={15} /> : <FiMapPin size={15} />}
                    label="Location"
                    value={service.location_type === 'Online' ? 'Online' : service.location_area ?? 'In-Person'}
                    accentBg={BLUE_LT} accentColor={BLUE}
                  />
                  <InfoTile
                    icon={<FiUsers size={15} />}
                    label={isEvent ? 'Spots' : service.max_participants > 1 ? 'Slots' : 'Participants'}
                    value={service.max_participants > 1
                      ? isEvent
                        ? `${spotsLeft(service.max_participants, service.participant_count ?? 0)} left of ${service.max_participants}`
                        : `${service.participant_count ?? 0}/${service.max_participants} filled`
                      : String(service.max_participants)
                    }
                    accentBg="#F3E8FF" accentColor="#7C3AED"
                  />
                </Grid>

                {/* Slot progress bar */}
                {service.max_participants > 1 && (
                  <Box mb={6} border={isEvent && isNearlyFull(service.max_participants, service.participant_count ?? 0) ? `1px solid ${AMBER}60` : 'none'}
                    borderRadius={isEvent && isNearlyFull(service.max_participants, service.participant_count ?? 0) ? '12px' : 'none'}
                    p={isEvent && isNearlyFull(service.max_participants, service.participant_count ?? 0) ? 3 : 0}
                    bg={isEvent && isNearlyFull(service.max_participants, service.participant_count ?? 0) ? AMBER_LT : 'transparent'}
                  >
                    {isEvent && isNearlyFull(service.max_participants, service.participant_count ?? 0) && (
                      <Text fontSize="11px" fontWeight={700} color={AMBER} mb={2}>⚡ Last spots — hurry!</Text>
                    )}
                    <Flex justify="space-between" mb={2}>
                      <Text fontSize="12px" color={GRAY500} fontWeight={500}>
                        {service.participant_count ?? 0} of {service.max_participants} slots filled
                      </Text>
                      <Text fontSize="12px" color={fillPct >= 100 ? '#16A34A' : GRAY400} fontWeight={600}>
                        {fillPct >= 100 ? 'Full' : `${Math.round(fillPct)}%`}
                      </Text>
                    </Flex>
                    <Box bg={GRAY100} borderRadius="full" h="7px" overflow="hidden">
                      <Box h="full" borderRadius="full"
                        bg={fillPct >= 100 ? '#16A34A' : isEvent ? AMBER : isOffer ? GREEN : BLUE}
                        style={{ width: `${fillPct}%`, transition: 'width 0.4s ease' }}
                      />
                    </Box>
                  </Box>
                )}

                {/* Description */}
                <Box mb={6}>
                  <Text fontSize="12px" fontWeight={700} color={GRAY400} mb={2}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}
                  >
                    Description
                  </Text>
                  <Text fontSize="14px" color={GRAY700} lineHeight={1.75} whiteSpace="pre-line">
                    {service.description}
                  </Text>
                </Box>

                {/* Image gallery */}
                {images.length > 0 && (
                  <Box mb={6}>
                    <Text fontSize="12px" fontWeight={700} color={GRAY400} mb={3}
                      style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}
                    >
                      Photos ({images.length})
                    </Text>
                    <Grid templateColumns={`repeat(${Math.min(images.length, 3)}, 1fr)`} gap={3}>
                      {images.slice(0, 6).map((m, i) => (
                        <Box key={m.id} borderRadius="12px" overflow="hidden"
                          border={`1px solid ${GRAY200}`} style={{ aspectRatio: '1' }}
                          cursor="pointer" onClick={() => setImgIdx(i)}
                          outline={imgIdx === i ? `2px solid ${isOffer ? GREEN : BLUE}` : 'none'}
                          outlineOffset="2px"
                        >
                          <img src={m.file_url} alt={`Photo ${i + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </Box>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* Location map — In-Person only */}
                {service.location_type === 'In-Person' && (service.location_lat || service.location_lng) && (
                  <Box mb={6}>
                    <Flex align="center" gap={2} mb={3}>
                      <FiMapPin size={13} color={GRAY400} />
                      <Text fontSize="12px" fontWeight={700} color={GRAY400}
                        style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}
                      >
                        Approximate Location
                      </Text>
                    </Flex>
                    <Box borderRadius="14px" overflow="hidden" border={`1px solid ${GRAY200}`}>
                      <MapView services={[service]} height="220px" />
                    </Box>
                    <Text fontSize="11px" color={GRAY400} mt="6px">
                      Exact address is hidden — shown within a 2 km privacy zone.
                    </Text>
                  </Box>
                )}

                {/* Tags */}
                {service.tags && service.tags.length > 0 && (
                  <Box>
                    <Text fontSize="12px" fontWeight={700} color={GRAY400} mb={3}
                      style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}
                    >
                      Tags
                    </Text>
                    <Flex flexWrap="wrap" gap={2}>
                      {service.tags.map((t) => (
                        <Box key={t.id} px={3} py={1} borderRadius="full"
                          bg={GRAY100} color={GRAY600} fontSize="13px" fontWeight={500}
                          border={`1px solid ${GRAY200}`}
                        >
                          #{t.name}
                        </Box>
                      ))}
                    </Flex>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Comments */}
            <CommentSection serviceId={service.id} />
          </Stack>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <Stack gap={4} position={{ lg: 'sticky' }} top="80px">

            {/* Provider card */}
            <Box
              bg={WHITE} borderRadius="16px" border={`1px solid ${GRAY200}`} overflow="hidden"
              boxShadow="0 2px 8px rgba(0,0,0,0.04)"
              cursor={provId ? 'pointer' : 'default'}
              transition="all 0.15s"
              onClick={() => { if (provId) navigate(`/public-profile/${provId}`) }}
              _hover={provId ? { borderColor: GRAY300, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' } : {}}
            >
              {/* Thin colored top strip */}
              <Box h="4px" bg={isEvent ? AMBER : isOffer ? GREEN : BLUE} />
              <Box p={5}>
                <Flex justify="space-between" align="center" mb={4}>
                  <Text fontSize="12px" fontWeight={700} color={GRAY400}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}
                  >
                    {isOffer ? 'Service Provider' : isEvent ? 'Event Organizer' : 'Posted by'}
                  </Text>
                  {provId && (
                    <Text fontSize="12px" color={isEvent ? AMBER : isOffer ? GREEN : BLUE} fontWeight={600}>
                      View Profile →
                    </Text>
                  )}
                </Flex>
                <Flex align="center" gap={3} mb={4}>
                  <Avatar
                    name={provName}
                    url={provider && typeof provider === 'object' ? provider.avatar_url : null}
                    size={48}
                  />
                  <Box>
                    <Text fontWeight={700} fontSize="15px" color={GRAY800}>{provName}</Text>
                    {provider && typeof provider === 'object' && provider.bio && (
                      <Text fontSize="12px" color={GRAY500} mt="2px"
                        style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                      >
                        {provider.bio}
                      </Text>
                    )}
                  </Box>
                </Flex>
                {provider && typeof provider === 'object' && (
                  <Flex gap={3}>
                    <Flex direction="column" align="center" flex={1} py={2} borderRadius="10px" bg={GRAY50} border={`1px solid ${GRAY100}`}>
                      <Flex align="center" gap={1}>
                        <FiStar size={12} fill="#F8C84A" color="#F8C84A" />
                        <Text fontSize="16px" fontWeight={800} color={GRAY800}>{provider.karma_score ?? 0}</Text>
                      </Flex>
                      <Text fontSize="10px" color={GRAY400} fontWeight={600}>Karma</Text>
                    </Flex>
                    <Flex direction="column" align="center" flex={1} py={2} borderRadius="10px" bg={GRAY50} border={`1px solid ${GRAY100}`}>
                      <Text fontSize="13px" fontWeight={700} color={GRAY700}>
                        {provider.date_joined
                          ? new Date(provider.date_joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                          : 'Member'}
                      </Text>
                      <Text fontSize="10px" color={GRAY400} fontWeight={600}>Joined</Text>
                    </Flex>
                  </Flex>
                )}
              </Box>
            </Box>

            {/* Action card */}
            <Box bg={WHITE} borderRadius="16px" border={`1px solid ${GRAY200}`} p={5}
              boxShadow="0 2px 8px rgba(0,0,0,0.04)"
            >
              {isEvent ? (
                /* ── EVENT ACTIONS ─────────────────────────────────────── */
                isOwn ? (
                  /* Organizer view */
                  <Stack gap={4}>
                    <Flex align="center" justify="space-between">
                      <Text fontSize="13px" fontWeight={700} color={GRAY800}>Participants</Text>
                      <Box px="8px" py="3px" borderRadius="full" fontSize="11px" fontWeight={700}
                        bg={AMBER_LT} color={AMBER}
                      >
                        {service.participant_count ?? 0} / {service.max_participants}
                      </Box>
                    </Flex>

                    {service.max_participants > 1 && (
                      <Box bg={GRAY100} borderRadius="full" h="5px" overflow="hidden">
                        <Box h="full" borderRadius="full" bg={AMBER}
                          style={{ width: `${fillPct}%`, transition: 'width 0.3s' }} />
                      </Box>
                    )}

                    {incoming.length === 0 ? (
                      <Text fontSize="13px" color={GRAY400} textAlign="center" py={3}>No participants yet.</Text>
                    ) : (
                      <Stack gap={2} maxH="200px" overflowY="auto">
                        {incoming.map((h) => {
                          const cfg = HS_BADGE[h.status] ?? { label: h.status, bg: GRAY100, color: GRAY500 }
                          return (
                            <Flex key={h.id} align="center" justify="space-between"
                              p="10px" bg={GRAY50} borderRadius="9px" gap={2}
                            >
                              <Text fontSize="13px" fontWeight={600} color={GRAY800}
                                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {h.requester_name}
                              </Text>
                              <Box px="7px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700}
                                style={{ background: cfg.bg, color: cfg.color, flexShrink: 0 }}
                              >
                                {cfg.label}
                              </Box>
                            </Flex>
                          )
                        })}
                      </Stack>
                    )}

                    <Box as="button" w="full" py="11px" borderRadius="10px"
                      bg={AMBER} color={WHITE} fontSize="14px" fontWeight={700}
                      display="flex" alignItems="center" justifyContent="center" gap="7px"
                      onClick={() => setShowEventChat(true)}
                      style={{ border: 'none', cursor: 'pointer' }}
                      _hover={{ opacity: 0.9 }}
                    >
                      <FiMessageSquare size={14} /> Event Chat
                    </Box>

                    <Box as="button" w="full" py="11px" borderRadius="10px"
                      bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
                      display="flex" alignItems="center" justifyContent="center" gap="7px"
                      onClick={() => setShowRoster(true)}
                      style={{ border: 'none', cursor: 'pointer' }}
                    >
                      <FiCheckCircle size={14} /> Complete Event
                    </Box>

                    {isWithinLockdownWindow(service.scheduled_time) && (
                      <Box bg={AMBER_LT} border={`1px solid ${AMBER}40`} borderRadius="10px" p={3}>
                        <Text fontSize="12px" color="#92400E" fontWeight={600}>⚠ Lockdown window active</Text>
                        <Text fontSize="11px" color="#92400E" mt="2px">
                          Cancelling now will apply a 30-day event creation ban.
                        </Text>
                      </Box>
                    )}

                    <Box as="button" w="full" py="10px" borderRadius="10px"
                      bg={RED_LT} color={RED} fontSize="13px" fontWeight={700}
                      display="flex" alignItems="center" justifyContent="center" gap="6px"
                      onClick={handleCancelEvent}
                      style={{ border: `1px solid ${RED}30`, cursor: cancelLoading ? 'not-allowed' : 'pointer', opacity: cancelLoading ? 0.65 : 1 }}
                    >
                      {cancelLoading ? 'Cancelling…' : 'Cancel Event'}
                    </Box>
                  </Stack>
                ) : isAuthenticated ? (
                  isEventBanned(user?.is_event_banned_until) ? (
                    /* Banned participant */
                    <Stack gap={3}>
                      <Box bg={RED_LT} borderRadius="12px" p={4} border={`1px solid ${RED}30`}>
                        <Text fontSize="13px" fontWeight={700} color={RED}>Participation Suspended</Text>
                        <Text fontSize="12px" color="#991B1B" mt="3px">
                          You have 3 no-shows. You can join events again after{' '}
                          <strong>{formatBanExpiry(user?.is_event_banned_until)}</strong>.
                        </Text>
                      </Box>
                    </Stack>
                  ) : myEventHandshake?.status === 'checked_in' ? (
                    /* Already checked in */
                    <Stack gap={3}>
                      <Box bg={GREEN_LT} borderRadius="12px" p={4} border={`1px solid ${GREEN}30`}
                        display="flex" alignItems="center" gap={3}
                      >
                        <FiCheckCircle size={20} color={GREEN} />
                        <Box>
                          <Text fontSize="13px" fontWeight={700} color={GREEN}>You're checked in!</Text>
                          <Text fontSize="12px" color="#166534" mt="2px">
                            Attendance confirmed. See you at the event!
                          </Text>
                        </Box>
                      </Box>
                      <Box as="button" w="full" py="11px" borderRadius="10px"
                        bg={AMBER} color={WHITE} fontSize="14px" fontWeight={700}
                        display="flex" alignItems="center" justifyContent="center" gap="7px"
                        onClick={() => setShowEventChat(true)}
                        style={{ border: 'none', cursor: 'pointer' }}
                        _hover={{ opacity: 0.9 }}
                      >
                        <FiMessageSquare size={14} /> Event Chat
                      </Box>
                    </Stack>
                  ) : myEventHandshake?.status === 'attended' ? (
                    <Stack gap={3}>
                      <Box bg={GREEN_LT} borderRadius="12px" p={4} border={`1px solid ${GREEN}30`}
                        display="flex" alignItems="center" gap={3}
                      >
                        <FiCheckCircle size={20} color={GREEN} />
                        <Box>
                          <Text fontSize="13px" fontWeight={700} color={GREEN}>Attendance confirmed!</Text>
                          <Text fontSize="12px" color="#166534" mt="2px">
                            The organizer marked you as attended.
                          </Text>
                        </Box>
                      </Box>
                      <Box as="button" w="full" py="11px" borderRadius="10px"
                        bg={AMBER} color={WHITE} fontSize="14px" fontWeight={700}
                        display="flex" alignItems="center" justifyContent="center" gap="7px"
                        onClick={() => setShowEventChat(true)}
                        style={{ border: 'none', cursor: 'pointer' }}
                        _hover={{ opacity: 0.9 }}
                      >
                        <FiMessageSquare size={14} /> Event Chat
                      </Box>
                    </Stack>
                  ) : myEventHandshake?.status === 'accepted' && isFutureEvent(service.scheduled_time) ? (
                    /* Joined — show leave or check-in based on lockdown */
                    <Stack gap={3}>
                      <Box bg={GRAY50} borderRadius="12px" p={4} border={`1px solid ${GRAY200}`}>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800}>You're registered ✓</Text>
                        <Text fontSize="12px" color={GRAY500} mt="2px">
                          {isWithinLockdownWindow(service.scheduled_time)
                            ? 'Check-in is now open!'
                            : 'Check-in opens 24 h before the event.'}
                        </Text>
                      </Box>
                      {isWithinLockdownWindow(service.scheduled_time) ? (
                        <Box as="button" w="full" py="12px" borderRadius="11px"
                          bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
                          display="flex" alignItems="center" justifyContent="center" gap="7px"
                          onClick={handleCheckin}
                          style={{ border: 'none', cursor: checkinLoading ? 'not-allowed' : 'pointer', opacity: checkinLoading ? 0.7 : 1, transition: 'opacity 0.15s' }}
                        >
                          <FiCheckCircle size={15} />
                          {checkinLoading ? 'Checking in…' : 'Check In'}
                        </Box>
                      ) : (
                        <Box as="button" w="full" py="12px" borderRadius="11px"
                          bg={RED_LT} color={RED} fontSize="14px" fontWeight={700}
                          display="flex" alignItems="center" justifyContent="center" gap="6px"
                          onClick={handleLeaveEvent}
                          style={{ border: `1px solid ${RED}30`, cursor: leaveLoading ? 'not-allowed' : 'pointer', opacity: leaveLoading ? 0.7 : 1, transition: 'opacity 0.15s' }}
                        >
                          {leaveLoading ? 'Leaving…' : 'Leave Event'}
                        </Box>
                      )}
                      <Box as="button" w="full" py="11px" borderRadius="10px"
                        bg={AMBER} color={WHITE} fontSize="14px" fontWeight={700}
                        display="flex" alignItems="center" justifyContent="center" gap="7px"
                        onClick={() => setShowEventChat(true)}
                        style={{ border: 'none', cursor: 'pointer' }}
                        _hover={{ opacity: 0.9 }}
                      >
                        <FiMessageSquare size={14} /> Event Chat
                      </Box>
                    </Stack>
                  ) : !isFutureEvent(service.scheduled_time) ? (
                    /* Past event */
                    <Stack gap={2}>
                      <Box w="full" py="12px" borderRadius="11px"
                        bg={GRAY100} color={GRAY400} fontSize="14px" fontWeight={700} textAlign="center"
                      >
                        Event Ended
                      </Box>
                      <Text fontSize="12px" color={GRAY400} textAlign="center">This event has already passed.</Text>
                    </Stack>
                  ) : isEventFull(service.max_participants, service.participant_count ?? 0) ? (
                    /* Full event */
                    <Stack gap={2}>
                      <Box w="full" py="12px" borderRadius="11px"
                        bg={GRAY100} color={GRAY400} fontSize="14px" fontWeight={700} textAlign="center"
                      >
                        Event Full
                      </Box>
                      <Text fontSize="12px" color={GRAY400} textAlign="center">
                        All {service.max_participants} spots are taken.
                      </Text>
                    </Stack>
                  ) : (
                    /* Join button */
                    <Box as="button" w="full" py="13px" borderRadius="11px"
                      bg={AMBER} color={WHITE}
                      fontSize="15px" fontWeight={700}
                      display="flex" alignItems="center" justifyContent="center" gap="7px"
                      onClick={handleJoinEvent}
                      style={{
                        border: 'none', cursor: joinLoading ? 'not-allowed' : 'pointer',
                        opacity: joinLoading ? 0.7 : 1, transition: 'opacity 0.15s',
                      }}
                    >
                      {joinLoading
                        ? 'Joining…'
                        : `Join Event — ${spotsLeft(service.max_participants, service.participant_count ?? 0)} spot${spotsLeft(service.max_participants, service.participant_count ?? 0) !== 1 ? 's' : ''} left`}
                    </Box>
                  )
                ) : (
                  /* Not authenticated */
                  <Stack gap={3}>
                    <Text fontSize="13px" color={GRAY600} textAlign="center">
                      Log in to join this event.
                    </Text>
                    <Box as="button" w="full" py="11px" borderRadius="11px"
                      bg={AMBER} color={WHITE} fontSize="14px" fontWeight={700}
                      style={{ border: 'none', cursor: 'pointer' }}
                      onClick={() => navigate('/login')}
                    >
                      Log In to Join
                    </Box>
                  </Stack>
                )
              ) : (
                /* ── OFFER / NEED ACTIONS (unchanged) ──────────────────── */
                <>
                  {isOwn ? (
                    <Stack gap={4}>
                      <Flex align="center" justify="space-between">
                        <Text fontSize="13px" fontWeight={700} color={GRAY800}>
                          {service.max_participants > 1 ? 'Participants' : 'Incoming Requests'}
                        </Text>
                        {incoming.filter((h) => ['pending', 'accepted'].includes(h.status)).length > 0 && (
                          <Box px="8px" py="3px" borderRadius="full" fontSize="11px" fontWeight={700}
                            bg={incoming.some((h) => h.status === 'pending') ? '#f97316' : '#10B981'}
                            color={WHITE}
                          >
                            {incoming.filter((h) => ['pending', 'accepted'].includes(h.status)).length} active
                          </Box>
                        )}
                      </Flex>

                      {service.max_participants > 1 && (
                        <Box>
                          <Flex justify="space-between" mb={2}>
                            <Text fontSize="11px" color={GRAY500}>{service.participant_count ?? 0}/{service.max_participants} slots</Text>
                            {isRecurr && (
                              <Flex align="center" gap={1} fontSize="11px" color="#7C3AED">
                                <FiRefreshCw size={9} /><Text>Recurrent</Text>
                              </Flex>
                            )}
                          </Flex>
                          <Box bg={GRAY100} borderRadius="full" h="5px" overflow="hidden">
                            <Box h="full" borderRadius="full" bg={fillPct >= 100 ? '#10B981' : '#f97316'}
                              style={{ width: `${fillPct}%`, transition: 'width 0.3s' }} />
                          </Box>
                        </Box>
                      )}

                      {incoming.length === 0 ? (
                        <Text fontSize="13px" color={GRAY400} textAlign="center" py={3}>No requests yet.</Text>
                      ) : (
                        <Stack gap={2}>
                          {incoming.map((h) => {
                            const cfg    = HS_BADGE[h.status] ?? { label: h.status, bg: GRAY100, color: GRAY500 }
                            const active = ['pending', 'accepted'].includes(h.status)
                            return (
                              <Flex key={h.id} align="center" justify="space-between"
                                p={3} bg={GRAY50} borderRadius="10px" gap={2}
                                opacity={active ? 1 : 0.6}
                              >
                                <Box flex={1} minW={0}>
                                  <Text fontSize="13px" fontWeight={600} color={GRAY800}
                                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  >
                                    {h.requester_name}
                                  </Text>
                                  <Text fontSize="11px" color={GRAY400}>
                                    {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </Text>
                                </Box>
                                <Flex align="center" gap={2} flexShrink={0}>
                                  <Box px="7px" py="2px" borderRadius="full" fontSize="10px" fontWeight={700}
                                    style={{ background: cfg.bg, color: cfg.color }}
                                  >
                                    {cfg.label}
                                  </Box>
                                  {active && (
                                    <Box as="button" px="10px" py="5px" borderRadius="7px"
                                      bg={GREEN} color={WHITE} fontSize="11px" fontWeight={700}
                                      style={{ border: 'none', cursor: 'pointer' }}
                                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); navigate(`/messages/${h.id}`) }}
                                    >
                                      Chat
                                    </Box>
                                  )}
                                </Flex>
                              </Flex>
                            )
                          })}
                        </Stack>
                      )}
                    </Stack>
                  ) : isAuthenticated ? (
                    hasInterest ? (
                      <Stack gap={3}>
                        <Box as="button" w="full" py="12px" borderRadius="11px"
                          bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
                          display="flex" alignItems="center" justifyContent="center" gap="6px"
                          onClick={() => navigate(myHandshake ? `/messages/${myHandshake.id}` : '/messages')}
                          style={{ border: 'none', cursor: 'pointer' }}
                          onMouseEnter={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.opacity = '0.88' }}
                          onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.opacity = '1' }}
                        >
                          <FiMessageSquare size={15} />
                          {myHandshake?.status === 'accepted' ? 'Open Chat' : 'View Chat (Pending)'}
                        </Box>
                        <Text fontSize="12px" color={GRAY500} textAlign="center">
                          {myHandshake?.status === 'accepted'
                            ? 'Interest accepted — you can chat now.'
                            : 'Waiting for provider to respond.'}
                        </Text>
                      </Stack>
                    ) : (service.schedule_type === 'One-Time' && service.status !== 'Active') ? (
                      <Stack gap={2}>
                        <Box w="full" py="12px" borderRadius="11px"
                          bg={GRAY100} color={GRAY400} fontSize="14px" fontWeight={700}
                          textAlign="center"
                        >
                          Service {service.status}
                        </Box>
                        <Text fontSize="12px" color={GRAY400} textAlign="center">No longer accepting new requests.</Text>
                      </Stack>
                    ) : isFull ? (
                      <Stack gap={2}>
                        <Box w="full" py="12px" borderRadius="11px"
                          bg={GRAY100} color={GRAY400} fontSize="14px" fontWeight={700}
                          textAlign="center"
                        >
                          {isRecurr ? 'All Slots Taken' : 'Service Full'}
                        </Box>
                        <Text fontSize="12px" color={GRAY400} textAlign="center">
                          {isRecurr
                            ? 'Check back once an active session ends.'
                            : `Max ${service.max_participants} participant${service.max_participants !== 1 ? 's' : ''}.`}
                        </Text>
                      </Stack>
                    ) : (
                      <Box as="button" w="full" py="13px" borderRadius="11px"
                        bg={isOffer ? GREEN : BLUE} color={WHITE}
                        fontSize="15px" fontWeight={700}
                        display="flex" alignItems="center" justifyContent="center" gap="7px"
                        onClick={handleExpressInterest}
                        style={{
                          border: 'none', cursor: interestLoading ? 'not-allowed' : 'pointer',
                          opacity: interestLoading ? 0.7 : 1, transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => { if (!interestLoading) (e.currentTarget as unknown as HTMLButtonElement).style.opacity = '0.88' }}
                        onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.opacity = interestLoading ? '0.7' : '1' }}
                      >
                        {interestLoading ? 'Processing…' : (isOffer ? 'Request this Service' : 'Offer to Help')}
                      </Box>
                    )
                  ) : (
                    <Stack gap={3}>
                      <Text fontSize="13px" color={GRAY600} textAlign="center">
                        Log in to express interest in this service.
                      </Text>
                      <Box as="button" w="full" py="11px" borderRadius="11px"
                        bg={GREEN} color={WHITE} fontSize="14px" fontWeight={700}
                        style={{ border: 'none', cursor: 'pointer' }}
                        onClick={() => navigate('/login')}
                      >
                        Log In to Request
                      </Box>
                    </Stack>
                  )}

                  {isAuthenticated && evaluationHandshake && (
                    <Box mt={4}>
                      <Box as="button" w="full" py="12px" borderRadius="11px"
                        bg={GREEN_LT} color={GREEN} fontSize="14px" fontWeight={700}
                        display="flex" alignItems="center" justifyContent="center" gap="7px"
                        onClick={() => setShowEvaluationModal(true)}
                        style={{ border: `1px solid ${BLUE}40`, cursor: 'pointer' }}
                      >
                        <FiStar size={14} /> Leave Evaluation
                      </Box>
                    </Box>
                  )}

                  {/* Report */}
                  {isAuthenticated && !isOwn && (
                    <Box textAlign="center" mt={4} pt={4} borderTop={`1px solid ${GRAY100}`}>
                      <Box
                        as="button"
                        display="inline-flex" alignItems="center" gap={2}
                        fontSize="12px"
                        color={alreadyReported ? GRAY300 : GRAY400}
                        style={{ background: 'none', border: 'none', cursor: alreadyReported ? 'not-allowed' : 'pointer', transition: 'color 0.15s' }}
                        onClick={() => { if (!alreadyReported) setShowReport(true) }}
                        onMouseEnter={(e) => { if (!alreadyReported) (e.currentTarget as unknown as HTMLButtonElement).style.color = RED }}
                        onMouseLeave={(e) => { (e.currentTarget as unknown as HTMLButtonElement).style.color = alreadyReported ? GRAY300 : GRAY400 }}
                      >
                        <FiFlag size={12} />
                        {alreadyReported ? 'Already Reported' : 'Report this listing'}
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </Box>

            {/* Meta */}
            <Box bg={WHITE} borderRadius="16px" border={`1px solid ${GRAY200}`} p={4}>
              <Stack gap={3} fontSize="12px" color={GRAY500}>
                {service.comment_count !== undefined && (
                  <Flex align="center" gap={2}>
                    <FiMessageSquare size={12} color={GRAY400} />
                    <Text>{service.comment_count} review{service.comment_count !== 1 ? 's' : ''}</Text>
                  </Flex>
                )}
                <Flex align="center" gap={2}>
                  <FiCalendar size={12} color={GRAY400} />
                  <Text>
                    Posted {new Date(service.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </Text>
                </Flex>
                {service.hot_score !== undefined && service.hot_score > 0 && (
                  <Flex align="center" gap={2}>
                    <FiStar size={12} color="#F59E0B" />
                    <Text color="#B45309" fontWeight={600}>Trending</Text>
                  </Flex>
                )}
              </Stack>
            </Box>
          </Stack>
        </Grid>
      </Box>

      {showReport && (
        <ReportModal onClose={() => setShowReport(false)} onSubmit={handleReport} loading={reportLoading} />
      )}

      {showRoster && service && (
        <EventRosterModal
          isOpen={showRoster}
          onClose={() => setShowRoster(false)}
          service={service}
          handshakes={incoming}
          onComplete={handleCompleteEvent}
          onMarkAttended={handleMarkAttended}
          markingHandshakeId={markingAttendedId}
          completing={completing}
        />
      )}
      {evaluationHandshake && (
        <ServiceEvaluationModal
          isOpen={showEvaluationModal}
          onClose={() => setShowEvaluationModal(false)}
          handshakeId={evaluationHandshake.id}
          counterpartName={evaluationCounterpartName}
          onSubmitted={handleEvaluationSubmitted}
        />
      )}

      {showEventChat && service && (
        <EventChatModal
          isOpen={showEventChat}
          onClose={() => setShowEventChat(false)}
          service={service}
        />
      )}

    </Box>
  )
}
