import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Badge, Button, Container, Flex, Grid,
  Stack, Text,
} from '@chakra-ui/react'
import {
  FiArrowLeft, FiClock, FiCalendar, FiMapPin, FiMonitor,
  FiUsers, FiTag, FiStar, FiFlag, FiMessageSquare, FiSend,
  FiCheckCircle, FiAlertTriangle, FiRefreshCw,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { serviceAPI } from '@/services/serviceAPI'
import { commentAPI } from '@/services/commentAPI'
import { handshakeAPI } from '@/services/handshakeAPI'
import type { Service } from '@/types'
import type { Comment } from '@/services/commentAPI'
import type { Handshake } from '@/services/handshakeAPI'

// ── Constants ─────────────────────────────────────────────────────────────────
const YELLOW = '#F8C84A'
const GREEN = '#2D5C4E'

const HS_BADGE: Record<Handshake['status'], { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',    bg: '#fef9c3', color: '#854d0e' },
  accepted:  { label: 'Accepted',   bg: '#dcfce7', color: '#166534' },
  completed: { label: 'Completed',  bg: '#d1fae5', color: '#065f46' },
  denied:    { label: 'Declined',   bg: '#fee2e2', color: '#991b1b' },
  cancelled: { label: 'Cancelled',  bg: '#f3f4f6', color: '#6b7280' },
  reported:  { label: 'Reported',   bg: '#fee2e2', color: '#991b1b' },
  paused:    { label: 'Paused',     bg: '#e0f2fe', color: '#0369a1' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days = Math.floor(ms / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(d: string | number) {
  const n = Number(d)
  if (isNaN(n)) return String(d)
  return n === 1 ? '1 hour' : `${n} hours`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Flex
      align="center"
      gap={3}
      p={3}
      bg="#fffbeb"
      borderRadius="10px"
      border="1px solid #fde68a"
    >
      <Flex
        w="36px"
        h="36px"
        borderRadius="8px"
        bg={YELLOW}
        align="center"
        justify="center"
        color={GREEN}
        flexShrink={0}
      >
        {icon}
      </Flex>
      <Box>
        <Text fontSize="11px" color="gray.500" fontWeight={500}>{label}</Text>
        <Text fontSize="14px" fontWeight={600} color="gray.800">{value}</Text>
      </Box>
    </Flex>
  )
}

function Avatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string | null; size?: number }) {
  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      borderRadius="full"
      bg={YELLOW}
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontWeight={700}
      fontSize={`${Math.floor(size * 0.35)}px`}
      color={GREEN}
      overflow="hidden"
      flexShrink={0}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials(name)
      )}
    </Box>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ h = '16px', w = '100%', borderRadius = '6px' }: { h?: string; w?: string; borderRadius?: string }) {
  return (
    <Box
      h={h}
      w={w}
      borderRadius={borderRadius}
      bg="gray.100"
      style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
    />
  )
}

function LoadingSkeleton() {
  return (
    <Container maxW="1200px" py={8}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      <Skeleton h="20px" w="120px" />
      <Box mt={6}>
        <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={8}>
          <Stack gap={4}>
            <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.100" p={6}>
              <Skeleton h="32px" w="70%" />
              <Box mt={4} />
              <Skeleton h="14px" />
              <Box mt={2} />
              <Skeleton h="14px" w="80%" />
              <Box mt={6} />
              <Grid templateColumns="1fr 1fr" gap={3}>
                {[1,2,3,4].map(i => <Skeleton key={i} h="60px" borderRadius="10px" />)}
              </Grid>
            </Box>
          </Stack>
          <Stack gap={4}>
            <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.100" p={6} h="200px">
              <Skeleton h="16px" w="60%" />
            </Box>
          </Stack>
        </Grid>
      </Box>
    </Container>
  )
}

// ── Report Modal ──────────────────────────────────────────────────────────────
type ReportType = 'inappropriate_content' | 'spam' | 'service_issue' | 'scam' | 'harassment' | 'other'

const REPORT_OPTIONS: { value: ReportType; label: string; desc: string }[] = [
  { value: 'inappropriate_content', label: 'Inappropriate content', desc: 'Offensive or violates guidelines' },
  { value: 'spam', label: 'Spam', desc: 'Misleading or fake content' },
  { value: 'scam', label: 'Scam or fraud', desc: 'Attempting to deceive users' },
  { value: 'harassment', label: 'Harassment', desc: 'Abusive or threatening behavior' },
  { value: 'service_issue', label: 'Service issue', desc: 'Problem with quality or description' },
  { value: 'other', label: 'Other', desc: 'Something else not listed above' },
]

function ReportModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void
  onSubmit: (type: ReportType) => void
  loading: boolean
}) {
  const [selected, setSelected] = useState<ReportType>('inappropriate_content')
  return (
    <Box
      position="fixed"
      inset={0}
      bg="blackAlpha.600"
      zIndex={200}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
      onClick={onClose}
    >
      <Box
        bg="white"
        borderRadius="16px"
        w="100%"
        maxW="440px"
        p={6}
        boxShadow="xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Text fontWeight={700} fontSize="18px" mb={1}>Report this listing</Text>
        <Text fontSize="13px" color="gray.500" mb={4}>Select a reason. Moderators will review your report.</Text>
        <Stack gap={2} mb={5}>
          {REPORT_OPTIONS.map((opt) => (
            <Box
              key={opt.value}
              as="label"
              display="flex"
              alignItems="flex-start"
              gap={3}
              p={3}
              borderRadius="8px"
              border="1px solid"
              borderColor={selected === opt.value ? 'orange.300' : 'gray.200'}
              bg={selected === opt.value ? 'orange.50' : 'white'}
              cursor="pointer"
              style={{ transition: 'all 0.15s' }}
            >
              <input
                type="radio"
                name="reportType"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                style={{ marginTop: '2px' }}
              />
              <Box>
                <Text fontSize="14px" fontWeight={600} color="gray.800">{opt.label}</Text>
                <Text fontSize="12px" color="gray.500">{opt.desc}</Text>
              </Box>
            </Box>
          ))}
        </Stack>
        <Stack gap={2}>
          <Button
            w="full"
            bg="red.500"
            color="white"
            _hover={{ bg: 'red.600' }}
            loading={loading}
            loadingText="Submitting…"
            onClick={() => onSubmit(selected)}
          >
            <FiSend /> Submit Report
          </Button>
          <Button variant="outline" w="full" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}

// ── Comment Section ───────────────────────────────────────────────────────────
function CommentSection({ serviceId }: { serviceId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  const loadComments = useCallback(async () => {
    try {
      const res = await commentAPI.list(serviceId)
      setComments(res.results)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [serviceId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  return (
    <Box mt={6} bg="white" borderRadius="12px" border="1px solid" borderColor="gray.100" p={6}>
      <Flex align="center" gap={2} mb={2}>
        <FiMessageSquare color={GREEN} />
        <Text fontWeight={700} fontSize="16px" color="gray.800">
          Reviews {comments.length > 0 && `(${comments.length})`}
        </Text>
      </Flex>
      <Text fontSize="13px" color="gray.400" mb={5}>
        Reviews are left automatically after a completed exchange.
      </Text>

      {loading ? (
        <Stack gap={4}>
          {[1, 2].map((i) => (
            <Flex key={i} gap={3}>
              <Skeleton h="32px" w="32px" borderRadius="full" />
              <Box flex={1}><Skeleton h="12px" w="40%" /><Box mt={2} /><Skeleton h="12px" /></Box>
            </Flex>
          ))}
        </Stack>
      ) : comments.length === 0 ? (
        <Text fontSize="14px" color="gray.400" textAlign="center" py={4}>
          No reviews yet.
        </Text>
      ) : (
        <Stack gap={5}>
          {comments.map((c) => (
            <Box key={c.id}>
              <Flex gap={3}>
                <Avatar name={c.user_name} avatarUrl={c.user_avatar_url} size={32} />
                <Box flex={1}>
                  <Flex align="center" gap={2} flexWrap="wrap" mb={1}>
                    <Text fontSize="13px" fontWeight={700} color="gray.800">{c.user_name}</Text>
                    {c.is_verified_review && (
                      <Badge colorPalette="green" size="sm">
                        <FiCheckCircle size={10} /> Verified
                      </Badge>
                    )}
                    {c.handshake_hours && (
                      <Badge colorPalette="orange" size="sm">
                        <FiClock size={10} /> {c.handshake_hours}h exchange
                      </Badge>
                    )}
                    <Text fontSize="12px" color="gray.400">{formatRelative(c.created_at)}</Text>
                  </Flex>
                  <Text fontSize="14px" color="gray.700" lineHeight={1.6}>
                    {c.is_deleted ? <em style={{ color: '#9ca3af' }}>Review deleted</em> : c.body}
                  </Text>
                </Box>
              </Flex>

              {/* Replies */}
              {c.replies?.length > 0 && (
                <Stack mt={3} ml={10} pl={4} borderLeft="2px solid" borderColor="gray.100" gap={3}>
                  {c.replies.map((r) => (
                    <Flex key={r.id} gap={3}>
                      <Avatar name={r.user_name} avatarUrl={r.user_avatar_url} size={26} />
                      <Box flex={1}>
                        <Flex align="center" gap={2} mb={1}>
                          <Text fontSize="13px" fontWeight={700} color="gray.800">{r.user_name}</Text>
                          <Text fontSize="12px" color="gray.400">{formatRelative(r.created_at)}</Text>
                        </Flex>
                        <Text fontSize="13px" color="gray.700">
                          {r.is_deleted ? <em style={{ color: '#9ca3af' }}>Review deleted</em> : r.body}
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
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()

  const [service, setService] = useState<Service | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [handshakes, setHandshakes] = useState<Handshake[]>([])
  const [interestLoading, setInterestLoading] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [alreadyReported, setAlreadyReported] = useState(false)

  // ── Fetch service ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true)
    serviceAPI
      .get(id, controller.signal)
      .then(setService)
      .catch((e) => { if (!controller.signal.aborted) setError(e.message ?? 'Failed to load') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])

  // ── Fetch handshakes for current user to check existing interest ──────────
  useEffect(() => {
    if (!isAuthenticated) return
    handshakeAPI.list().then(setHandshakes).catch(() => {})
  }, [isAuthenticated])

  // ── Persist reported state per user+service ──────────────────────────────
  useEffect(() => {
    if (!user?.id || !service?.id) return
    setAlreadyReported(localStorage.getItem(`reported:${user.id}:${service.id}`) === '1')
  }, [user?.id, service?.id])

  // ── Derived state ────────────────────────────────────────────────────────
  const provider = service?.user ?? null
  const providerId = provider && typeof provider === 'object' ? provider.id : null
  const providerName = provider && typeof provider === 'object'
    ? `${provider.first_name ?? ''} ${provider.last_name ?? ''}`.trim() || provider.email
    : 'Unknown'
  const isOwnService = !!user?.id && providerId === user.id
  const isRecurrentService = service?.schedule_type === 'Recurrent'
  const isFull =
    service != null &&
    service.max_participants > 0 &&
    (service.participant_count ?? 0) >= service.max_participants

  // Normalise IDs regardless of whether backend returns string or nested object
  const extractId = (val: unknown): string | undefined => {
    if (!val) return undefined
    if (typeof val === 'string') return val
    if (typeof val === 'object' && 'id' in (val as Record<string, unknown>))
      return (val as { id: string }).id
    return undefined
  }

  // For visitors: the handshake I initiated for this service
  const existingHandshake = handshakes.find((h) => {
    const sid = extractId(h.service)
    const rid = extractId(h.requester)
    return sid === service?.id && rid === user?.id
  })
  const hasInterest = !!existingHandshake && ['pending', 'accepted'].includes(existingHandshake.status)

  // For owners: incoming requests on this service
  const incomingHandshakes = handshakes.filter((h) => {
    const sid = extractId(h.service)
    const rid = extractId(h.requester)
    return sid === service?.id && rid !== user?.id
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleExpressInterest = async () => {
    if (!service) return
    if (!isAuthenticated) { navigate('/login'); return }
    setInterestLoading(true)
    try {
      await serviceAPI.expressInterest(service.id)
      toast.success('Interest expressed! Head to Messages to chat.')
      const updated = await handshakeAPI.list()
      setHandshakes(updated)
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string; code?: string } } }
      const code = err.response?.data?.code
      const detail = err.response?.data?.detail

      if (code === 'ALREADY_EXISTS') {
        // Handshake exists but frontend didn't detect it — refresh and show info
        toast.info('You already have an active request for this service.')
        handshakeAPI.list().then(setHandshakes).catch(() => {})
      } else if (code === 'INSUFFICIENT_BALANCE') {
        toast.error(detail ?? 'Insufficient TimeBank balance for this service.')
      } else if (detail) {
        toast.error(detail)
      } else {
        toast.error('Could not express interest. Please try again.')
      }
    } finally {
      setInterestLoading(false)
    }
  }

  const handleReport = async (type: ReportType) => {
    if (!service) return
    setReportLoading(true)
    try {
      await serviceAPI.report(service.id, type, '')
      toast.success('Report submitted. Thank you for keeping the community safe.')
      if (user?.id) localStorage.setItem(`reported:${user.id}:${service.id}`, '1')
      setAlreadyReported(true)
      setShowReport(false)
    } catch {
      toast.error('Failed to submit report.')
    } finally {
      setReportLoading(false)
    }
  }

  type ReportType = 'inappropriate_content' | 'spam' | 'service_issue' | 'scam' | 'harassment' | 'other'

  // ── Render states ────────────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton />

  if (error || !service) {
    return (
      <Container maxW="1200px" py={16} textAlign="center">
        <Box fontSize="48px" mb={4}><FiAlertTriangle /></Box>
        <Text fontSize="20px" fontWeight={700} color="gray.700" mb={2}>
          {error ?? 'Service not found'}
        </Text>
        <Button onClick={() => navigate('/dashboard')} mt={4}>Back to Browse</Button>
      </Container>
    )
  }

  const typeBadgeColor = service.type === 'Offer' ? 'green' : 'blue'

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <Container maxW="1200px" py={8}>
      {/* Back button */}
      <Box
        as="button"
        onClick={() => navigate(-1)}
        display="flex"
        alignItems="center"
        gap={2}
        fontSize="14px"
        color="gray.500"
        _hover={{ color: 'gray.800' }}
        mb={6}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <FiArrowLeft /> Back to Browse
      </Box>

      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={8} alignItems="start">
        {/* ── Left: Main content ── */}
        <Stack gap={6}>
          <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.100" p={6}>
            {/* Header */}
            <Flex align="flex-start" justify="space-between" mb={4} gap={4}>
              <Box flex={1}>
                <Flex align="center" gap={3} mb={2} flexWrap="wrap">
                  <Text fontSize="24px" fontWeight={800} color="gray.900" lineHeight={1.2}>
                    {service.title}
                  </Text>
                  <Badge colorPalette={typeBadgeColor} variant="subtle" fontSize="12px" px={3} py={1}>
                    {service.type === 'Need' ? 'Want' : service.type}
                  </Badge>
                </Flex>
                <Text fontSize="13px" color="gray.400">
                  Posted {formatRelative(service.created_at)}
                </Text>
              </Box>
            </Flex>

            {/* Info tiles */}
            <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap={3} mb={6}>
              <InfoTile icon={<FiClock size={16} />} label="Duration" value={formatDuration(service.duration)} />
              <InfoTile
                icon={<FiCalendar size={16} />}
                label="Schedule"
                value={`${service.schedule_type}${service.schedule_details ? ` · ${service.schedule_details}` : ''}`}
              />
              <InfoTile
                icon={service.location_type === 'Online' ? <FiMonitor size={16} /> : <FiMapPin size={16} />}
                label="Location"
                value={service.location_type === 'Online' ? 'Online' : service.location_area ?? 'In-Person'}
              />
              <InfoTile
                icon={<FiUsers size={16} />}
                label={service.max_participants > 1 ? 'Slots' : 'Participants'}
                value={
                  service.max_participants > 1
                    ? `${service.participant_count ?? 0} / ${service.max_participants} filled`
                    : String(service.max_participants)
                }
              />
            </Grid>

            {/* Description */}
            <Box mb={6}>
              <Text fontWeight={700} fontSize="15px" color="gray.800" mb={2}>Description</Text>
              <Text fontSize="14px" color="gray.700" lineHeight={1.7} whiteSpace="pre-line">
                {service.description}
              </Text>
            </Box>

            {/* Media gallery */}
            {service.media && service.media.length > 0 && (
              <Box mb={6}>
                <Text fontWeight={700} fontSize="15px" color="gray.800" mb={3}>Photos</Text>
                <Grid templateColumns="repeat(3, 1fr)" gap={3}>
                  {service.media
                    .filter((m) => (m.media_type ?? 'image') === 'image')
                    .map((m) => {
                      const url = m.file_url ?? ''
                      if (!url) return null
                      return (
                        <Box
                          key={m.id}
                          borderRadius="10px"
                          overflow="hidden"
                          border="1px solid"
                          borderColor="gray.100"
                          style={{ aspectRatio: '1' }}
                        >
                          <img
                            src={url}
                            alt="Service photo"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </Box>
                      )
                    })}
                </Grid>
              </Box>
            )}

            {/* Tags */}
            {service.tags && service.tags.length > 0 && (
              <Box>
                <Flex align="center" gap={2} mb={3}>
                  <FiTag size={14} color={GREEN} />
                  <Text fontWeight={700} fontSize="15px" color="gray.800">Tags</Text>
                </Flex>
                <Flex flexWrap="wrap" gap={2}>
                  {service.tags.map((tag) => (
                    <Box
                      key={tag.id}
                      px={3}
                      py={1}
                      borderRadius="9999px"
                      bg="gray.100"
                      fontSize="13px"
                      color="gray.700"
                      fontWeight={500}
                    >
                      #{tag.name}
                    </Box>
                  ))}
                </Flex>
              </Box>
            )}
          </Box>

          {/* Comment section */}
          <CommentSection serviceId={service.id} />
        </Stack>

        {/* ── Right: Sidebar ── */}
        <Stack gap={4} position={{ lg: 'sticky' }} top="80px">
          {/* Provider card */}
          <Box
            bg="white"
            borderRadius="12px"
            border="1px solid"
            borderColor="gray.100"
            p={6}
            cursor={providerId ? 'pointer' : 'default'}
            _hover={providerId ? { borderColor: 'orange.300', boxShadow: 'md' } : {}}
            style={{ transition: 'all 0.2s' }}
            onClick={() => { if (providerId) navigate(`/public-profile/${providerId}`) }}
          >
            <Flex justify="space-between" align="center" mb={4}>
              <Text fontWeight={700} fontSize="15px" color="gray.800">
                {service.type === 'Offer' ? 'Service Provider' : 'Posted by'}
              </Text>
              {providerId && (
                <Text fontSize="12px" color="orange.500" fontWeight={600}>View Profile →</Text>
              )}
            </Flex>

            <Flex align="center" gap={3} mb={4}>
              <Avatar
                name={providerName}
                avatarUrl={provider && typeof provider === 'object' ? provider.avatar_url : null}
                size={52}
              />
              <Box>
                <Text fontWeight={700} fontSize="15px" color="gray.800">{providerName}</Text>
                {provider && typeof provider === 'object' && provider.bio && (
                  <Text fontSize="13px" color="gray.500" mt={0.5} lineClamp={2}>
                    {provider.bio}
                  </Text>
                )}
              </Box>
            </Flex>

            {provider && typeof provider === 'object' && (
              <Grid templateColumns="1fr 1fr" gap={3}>
                <Box textAlign="center" p={2} bg="gray.50" borderRadius="8px">
                  <Flex align="center" justify="center" gap={1} color={YELLOW}>
                    <FiStar size={13} fill={YELLOW} />
                    <Text fontSize="15px" fontWeight={700} color="gray.800">
                      {provider.karma_score ?? 0}
                    </Text>
                  </Flex>
                  <Text fontSize="11px" color="gray.500">Karma</Text>
                </Box>
                <Box textAlign="center" p={2} bg="gray.50" borderRadius="8px">
                  <Text fontSize="13px" fontWeight={600} color="gray.700">
                    {provider.date_joined
                      ? new Date(provider.date_joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      : 'Member'}
                  </Text>
                  <Text fontSize="11px" color="gray.500">Joined</Text>
                </Box>
              </Grid>
            )}
          </Box>

          {/* Action card */}
          <Box
            bg="white"
            borderRadius="12px"
            border="1px solid"
            borderColor="gray.100"
            p={6}
          >
            {isOwnService ? (
              <Stack gap={4}>
                {/* Header with slot summary */}
                <Box>
                  <Flex align="center" justify="space-between" mb={1}>
                    <Text fontWeight={700} fontSize="14px" color="gray.800">
                      {service.max_participants > 1 ? 'Participants' : 'Incoming Requests'}
                    </Text>
                    {incomingHandshakes.filter(h => ['pending','accepted'].includes(h.status)).length > 0 && (
                      <Box
                        px={2} py={0.5} borderRadius="full" fontSize="11px" fontWeight={700}
                        bg={incomingHandshakes.some(h => h.status === 'pending') ? 'orange.500' : 'green.500'}
                        color="white"
                      >
                        {incomingHandshakes.filter(h => ['pending','accepted'].includes(h.status)).length} active
                      </Box>
                    )}
                  </Flex>
                  {/* Slot progress bar for group offers */}
                  {service.max_participants > 1 && (
                    <Box>
                      <Flex justify="space-between" mb={1}>
                        <Text fontSize="11px" color="gray.500">
                          {service.participant_count ?? 0} / {service.max_participants} slots filled
                        </Text>
                        {isRecurrentService && (
                          <Flex align="center" gap={1} fontSize="11px" color="purple.500">
                            <FiRefreshCw size={10} />
                            <Text>Recurrent</Text>
                          </Flex>
                        )}
                      </Flex>
                      <Box bg="gray.100" borderRadius="full" h="6px" overflow="hidden">
                        <Box
                          h="full"
                          borderRadius="full"
                          bg={
                            (service.participant_count ?? 0) >= service.max_participants
                              ? 'green.400'
                              : 'orange.400'
                          }
                          style={{
                            width: `${Math.min(100, ((service.participant_count ?? 0) / service.max_participants) * 100)}%`,
                            transition: 'width 0.3s',
                          }}
                        />
                      </Box>
                    </Box>
                  )}
                </Box>

                {incomingHandshakes.length === 0 ? (
                  <Text fontSize="13px" color="gray.400" textAlign="center" py={3}>
                    No requests yet.
                  </Text>
                ) : (
                  <Stack gap={2}>
                    {incomingHandshakes.map((h) => {
                      const cfg = HS_BADGE[h.status] ?? { label: h.status, bg: '#f3f4f6', color: '#6b7280' }
                      const isActive = ['pending', 'accepted'].includes(h.status)
                      return (
                        <Flex
                          key={h.id}
                          align="center"
                          justify="space-between"
                          p={3}
                          bg="gray.50"
                          borderRadius="8px"
                          opacity={isActive ? 1 : 0.6}
                          gap={2}
                        >
                          <Box flex={1} minW={0}>
                            <Text fontSize="13px" fontWeight={600} color="gray.800" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {h.requester_name}
                            </Text>
                            <Text fontSize="11px" color="gray.400">
                              {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          </Box>
                          <Flex align="center" gap={2} flexShrink={0}>
                            <Box
                              px={2} py={0.5} borderRadius="full" fontSize="11px" fontWeight={600}
                              style={{ background: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </Box>
                            {isActive && (
                              <Box
                                as="button"
                                px={2} py={1} borderRadius="6px"
                                bg={GREEN} color="white"
                                fontSize="11px" fontWeight={600}
                                style={{ border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); navigate('/messages') }}
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
                  <Button
                    w="full"
                    bg="green.500"
                    color="white"
                    _hover={{ bg: 'green.600' }}
                    onClick={() => navigate('/messages')}
                  >
                    {existingHandshake?.status === 'accepted' ? 'Open Chat' : 'View Chat (Pending)'}
                  </Button>
                  <Text fontSize="13px" color="gray.500" textAlign="center">
                    {existingHandshake?.status === 'accepted'
                      ? 'Interest accepted — you can chat now.'
                      : 'Waiting for provider to respond.'}
                  </Text>
                </Stack>
              ) : isFull ? (
                <Stack gap={2}>
                  <Button w="full" disabled bg="gray.200" color="gray.500" size="lg" cursor="not-allowed">
                    {isRecurrentService ? 'All Slots Taken' : 'Service Full'}
                  </Button>
                  <Text fontSize="12px" color="gray.400" textAlign="center">
                    {isRecurrentService
                      ? 'All spots are currently occupied. Check back once an active session ends.'
                      : `This service has reached its maximum capacity (${service.max_participants} participant${service.max_participants !== 1 ? 's' : ''}).`}
                  </Text>
                </Stack>
              ) : (
                <Button
                  w="full"
                  bg={service.type === 'Offer' ? 'orange.500' : 'blue.500'}
                  color="white"
                  _hover={{ bg: service.type === 'Offer' ? 'orange.600' : 'blue.600' }}
                  loading={interestLoading}
                  loadingText="Processing…"
                  onClick={handleExpressInterest}
                  size="lg"
                >
                  {service.type === 'Offer' ? 'Request this Service' : 'Offer to Help'}
                </Button>
              )
            ) : (
              <Stack gap={2}>
                <Text fontSize="14px" color="gray.600" textAlign="center">
                  Log in to express interest in this service.
                </Text>
                <Button
                  w="full"
                  bg={GREEN}
                  color="white"
                  _hover={{ bg: '#1e3f34' }}
                  onClick={() => navigate('/login')}
                >
                  Log In to Request
                </Button>
              </Stack>
            )}

            {/* Report button */}
            {isAuthenticated && !isOwnService && (
              <Box textAlign="center" mt={4}>
                <Box
                  as="button"
                  display="inline-flex"
                  alignItems="center"
                  gap={2}
                  fontSize="12px"
                  color={alreadyReported ? 'gray.300' : 'gray.400'}
                  cursor={alreadyReported ? 'not-allowed' : 'pointer'}
                  _hover={alreadyReported ? {} : { color: 'red.500' }}
                  style={{ background: 'none', border: 'none' }}
                  _disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
                  onClick={() => {
                    if (alreadyReported) return
                    setShowReport(true)
                  }}
                >
                  <FiFlag size={12} />
                  {alreadyReported ? 'Already Reported' : 'Report this listing'}
                </Box>
              </Box>
            )}
          </Box>

          {/* Metadata */}
          <Box
            bg="gray.50"
            borderRadius="12px"
            border="1px solid"
            borderColor="gray.100"
            p={4}
          >
            <Stack gap={2} fontSize="13px" color="gray.500">
              {service.comment_count !== undefined && (
                <Flex align="center" gap={2}>
                  <FiMessageSquare size={13} />
                  <Text>{service.comment_count} review{service.comment_count !== 1 ? 's' : ''}</Text>
                </Flex>
              )}
              <Flex align="center" gap={2}>
                <FiCalendar size={13} />
                <Text>Posted {new Date(service.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              </Flex>
            </Stack>
          </Box>
        </Stack>
      </Grid>

      {showReport && (
        <ReportModal
          onClose={() => setShowReport(false)}
          onSubmit={handleReport}
          loading={reportLoading}
        />
      )}
    </Container>
  )
}
