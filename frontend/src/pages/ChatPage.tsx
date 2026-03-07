import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Box, Button, Flex, Text, Stack, Spinner } from '@chakra-ui/react'
import {
  FiSend,
  FiArrowLeft,
  FiMessageSquare,
  FiWifiOff,
  FiCheck,
  FiZap,
  FiCalendar,
  FiMapPin,
  FiClock,
  FiChevronDown,
  FiChevronRight,
  FiInbox,
  FiUsers,
} from 'react-icons/fi'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { usePolling } from '@/hooks/usePolling'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  conversationAPI,
  groupChatAPI,
  buildChatWsUrl,
  buildGroupChatWsUrl,
  type ApiChatMessage,
  type ChatConversation,
  type GroupChatParticipant,
  type GroupChatMessage,
} from '@/services/conversationAPI'
import { handshakeAPI, type InitiatePayload } from '@/services/handshakeAPI'
import { HandshakeDetailsModal } from '@/components/HandshakeDetailsModal'
import { ProviderDetailsModal } from '@/components/ProviderDetailsModal'
import { ServiceConfirmationModal } from '@/components/ServiceConfirmationModal'
import ServiceEvaluationModal from '@/components/ServiceEvaluationModal'

import {
  GREEN, GREEN_LT, GREEN_MD,
  AMBER, AMBER_LT,
  BLUE, BLUE_LT,
  RED, RED_LT,
  GRAY50, GRAY100, GRAY200, GRAY300, GRAY400, GRAY500, GRAY600, GRAY700, GRAY800,
  WHITE,
} from '@/theme/tokens'

const CONV_POLL_MS = 30_000
const MSG_POLL_MS  = 30_000
const POLL_IN_DEV  = false // In dev, rely on WebSocket only to avoid hammering the API

const ACTIVE_STATUSES = new Set(['pending', 'accepted'])
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'denied', 'reported', 'paused'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

type EvaluationWindowState = {
  isPending: boolean
  isClosed: boolean
  timeLeftLabel: string | null
}

function getEvaluationWindowState(conv: ChatConversation): EvaluationWindowState {
  const isStandardService = conv.service_type?.toLowerCase() !== 'event'
  const isEligible = conv.status === 'completed' && isStandardService && !conv.user_has_reviewed

  if (!isEligible) {
    return { isPending: false, isClosed: false, timeLeftLabel: null }
  }

  if (conv.evaluation_window_closed_at) {
    return { isPending: false, isClosed: true, timeLeftLabel: null }
  }

  let deadlineMs: number | null = null
  if (conv.evaluation_window_ends_at) {
    const parsed = new Date(conv.evaluation_window_ends_at).getTime()
    if (!Number.isNaN(parsed)) deadlineMs = parsed
  } else if (conv.evaluation_window_starts_at) {
    const start = new Date(conv.evaluation_window_starts_at).getTime()
    if (!Number.isNaN(start)) deadlineMs = start + (48 * 60 * 60 * 1000)
  }

  if (deadlineMs == null) {
    if (conv.updated_at) {
      const updatedMs = new Date(conv.updated_at).getTime()
      if (!Number.isNaN(updatedMs)) {
        deadlineMs = updatedMs + (48 * 60 * 60 * 1000)
      }
    }
  }

  if (deadlineMs == null) {
    return { isPending: true, isClosed: false, timeLeftLabel: '48h window active' }
  }

  const msLeft = deadlineMs - Date.now()
  if (msLeft <= 0) {
    return { isPending: false, isClosed: true, timeLeftLabel: null }
  }

  const totalMinutes = Math.ceil(msLeft / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return {
    isPending: true,
    isClosed: false,
    timeLeftLabel: `${hours}h ${minutes}m left`,
  }
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function mergeMessages(a: ApiChatMessage[], b: ApiChatMessage[]): ApiChatMessage[] {
  const map = new Map<string, ApiChatMessage>()
  for (const m of a) map.set(m.id, m)
  for (const m of b) map.set(m.id, m)
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime(),
  )
}

/** Group conversations by service_title */
function groupByService(convs: ChatConversation[]): Map<string, ChatConversation[]> {
  const map = new Map<string, ChatConversation[]>()
  for (const c of convs) {
    const key = c.service_title
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  return map
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  return (
    <Box
      w={`${size}px`} h={`${size}px`} borderRadius="full" flexShrink={0}
      bg={GREEN} color={WHITE}
      display="flex" alignItems="center" justifyContent="center"
      fontSize={`${Math.round(size * 0.33)}px`} fontWeight={700}
      overflow="hidden"
    >
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(name)
      }
    </Box>
  )
}

// ─── Status dot ───────────────────────────────────────────────────────────────

const STATUS_DOT_COLOR: Record<string, string> = {
  pending:   '#F59E0B',
  accepted:  '#10B981',
  completed: '#3B82F6',
  cancelled: '#9CA3AF',
  denied:    '#EF4444',
  paused:    '#F59E0B',
  reported:  '#EF4444',
}

const STATUS_LABEL: Record<string, string> = {
  pending:   'Pending',
  accepted:  'Accepted',
  completed: 'Completed',
  cancelled: 'Cancelled',
  denied:    'Denied',
  paused:    'Paused',
  reported:  'Reported',
}

// ─── Conversation Row (inside a group) ───────────────────────────────────────

/** True when the current user owns the service (regardless of Offer/Want). */
function isServiceOwner(conv: ChatConversation): boolean {
  const isOffer = conv.service_type?.toLowerCase() !== 'need' && conv.service_type?.toLowerCase() !== 'want'
  return isOffer ? conv.is_provider : !conv.is_provider
}

function isFixedGroupOffer(conv: ChatConversation): boolean {
  return conv.service_type === 'Offer' && conv.schedule_type === 'One-Time' && conv.max_participants > 1
}

function isGroupChatVisibleStatus(status: string): boolean {
  return ['accepted'].includes(status)
}

function ConvRow({
  conv, isSelected, onClick,
}: { conv: ChatConversation; isSelected: boolean; onClick: () => void }) {
  const evalWindow = getEvaluationWindowState(conv)
  const dot = evalWindow.isPending
    ? AMBER
    : (evalWindow.isClosed ? GRAY400 : (STATUS_DOT_COLOR[conv.status] ?? GRAY400))
  const label = evalWindow.isPending
    ? 'Evaluation Pending'
    : (evalWindow.isClosed ? 'Evaluation Closed' : (STATUS_LABEL[conv.status] ?? conv.status))
  const lm    = conv.last_message
  const myService = isServiceOwner(conv)

  return (
    <Box
      as="button" w="100%" textAlign="left"
      px={4} py="11px"
      bg={isSelected ? GREEN_LT : 'transparent'}
      borderLeft={isSelected ? `3px solid ${GREEN}` : '3px solid transparent'}
      _hover={{ bg: isSelected ? GREEN_LT : GRAY50 }}
      onClick={onClick}
      transition="background 0.1s"
    >
      <Flex align="center" gap="10px">
        <Box flexShrink={0}>
          <Avatar name={conv.other_user.name} url={conv.other_user.avatar_url} size={36} />
        </Box>
        <Box flex={1} minW={0}>
          <Flex align="center" justify="space-between" gap={1}>
            <Text
              fontSize="13px" fontWeight={isSelected ? 700 : 600}
              color={isSelected ? GREEN : GRAY800}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}
            >
              {conv.other_user.name}
            </Text>
            <Flex align="center" gap={1} flexShrink={0}>
              {myService && (
                <Box
                  px="5px" py="1px" borderRadius="4px"
                  fontSize="9px" fontWeight={700}
                  bg="#EFF6FF" color="#1D4ED8"
                  style={{ letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
                >
                  YOUR SERVICE
                </Box>
              )}
              <Text fontSize="10px" color={GRAY400}>
                {lm ? timeAgo(lm.created_at) : ''}
              </Text>
            </Flex>
          </Flex>
          <Flex align="center" gap={1} mt="1px">
            <Box w="6px" h="6px" borderRadius="full" flexShrink={0} bg={dot} />
            <Text fontSize="11px" color={GRAY500} fontWeight={500}>{label}</Text>
          </Flex>
          {evalWindow.isPending && evalWindow.timeLeftLabel && (
            <Text fontSize="10px" color={AMBER} fontWeight={600} mt="1px">
              {evalWindow.timeLeftLabel}
            </Text>
          )}
          {lm && (
            <Text fontSize="11px" color={GRAY400} mt="1px"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {lm.body}
            </Text>
          )}
        </Box>
      </Flex>
    </Box>
  )
}

// ─── Service Group (accordion) ────────────────────────────────────────────────

function ServiceGroup({
  title, convs, selectedId, selectedGroupServiceId, onSelect, onSelectGroup, defaultOpen,
}: {
  title: string
  convs: ChatConversation[]
  selectedId: string | null
  selectedGroupServiceId: string | null
  onSelect: (id: string) => void
  onSelectGroup: (serviceId: string) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasSelected = convs.some((c) => c.handshake_id === selectedId)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasSelected) setOpen(true)
  }, [hasSelected])

  // Show group chat row when service is One-Time with max_participants > 1
  // and at least one accepted handshake exists. Events always get group chat.
  const representativeConv = convs[0]
  const isEvent = representativeConv?.service_type === 'Event'
  const isGroupEligible =
    isEvent ||
    (representativeConv?.schedule_type === 'One-Time' &&
    representativeConv?.max_participants > 1)
  const hasEligibleParticipant = convs.some((c) =>
    isEvent
      ? ['accepted', 'checked_in', 'attended'].includes(c.status)
      : isGroupChatVisibleStatus(c.status)
  )
  const groupMembers = convs.filter((c) =>
    isEvent
      ? ['accepted', 'checked_in', 'attended'].includes(c.status)
      : isGroupChatVisibleStatus(c.status)
  )
  const groupMemberCount = representativeConv?.service_member_count ?? groupMembers.length
  const showGroupRow = isGroupEligible && hasEligibleParticipant
  const groupServiceId = representativeConv?.service_id ?? null
  const isGroupSelected = groupServiceId !== null && selectedGroupServiceId === groupServiceId

  return (
    <Box>
      {/* Group header */}
      <Box
        as="button" w="100%" textAlign="left"
        px={4} py="9px"
        bg={open ? GRAY50 : WHITE}
        borderBottom={`1px solid ${GRAY100}`}
        onClick={() => setOpen((v) => !v)}
        _hover={{ bg: GRAY50 }}
        transition="background 0.1s"
      >
        <Flex align="center" gap={2}>
          <Box color={GRAY400} fontSize="12px" flexShrink={0}>
            {open ? <FiChevronDown /> : <FiChevronRight />}
          </Box>
          <Text
            fontSize="12px" fontWeight={700} color={GRAY700}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          >
            {title}
          </Text>
          {showGroupRow && (
            <Box
              px="5px" py="1px" borderRadius="4px"
              bg="#EFF6FF" color={BLUE}
              fontSize="9px" fontWeight={700} flexShrink={0}
              style={{ letterSpacing: '0.04em' }}
            >
              GROUP
            </Box>
          )}
          <Box
            px="6px" py="1px" borderRadius="full"
            bg={GRAY100} color={GRAY500}
            fontSize="10px" fontWeight={700}
            flexShrink={0}
          >
            {convs.length}
          </Box>
        </Flex>
      </Box>

      {/* Conv rows */}
      {open && (
        <Box borderBottom={`1px solid ${GRAY100}`}>
          {/* Group chat row — only when eligible */}
          {showGroupRow && groupServiceId && (
            <Box
              as="button" w="100%" textAlign="left"
              px={4} py="10px"
              bg={isGroupSelected ? '#EFF6FF' : 'transparent'}
              borderLeft={isGroupSelected ? `3px solid ${BLUE}` : '3px solid transparent'}
              _hover={{ bg: isGroupSelected ? '#EFF6FF' : GRAY50 }}
              onClick={() => onSelectGroup(groupServiceId)}
              transition="background 0.1s"
            >
              <Flex align="center" gap="10px">
                <Box
                  w="36px" h="36px" borderRadius="full" flexShrink={0}
                  bg={isGroupSelected ? BLUE : GRAY200}
                  display="flex" alignItems="center" justifyContent="center"
                  color={isGroupSelected ? WHITE : GRAY500}
                  fontSize="16px"
                >
                  <FiUsers />
                </Box>
                <Box flex={1} minW={0}>
                  <Text
                    fontSize="13px" fontWeight={isGroupSelected ? 700 : 600}
                    color={isGroupSelected ? BLUE : GRAY800}
                  >
                    {title}
                  </Text>
                  <Text fontSize="11px" color={GRAY500}>
                    {groupMemberCount} member{groupMemberCount !== 1 ? 's' : ''}
                  </Text>
                </Box>
                <Box
                  px="5px" py="1px" borderRadius="4px"
                  bg={isGroupSelected ? BLUE : GRAY100}
                  color={isGroupSelected ? WHITE : GRAY500}
                  fontSize="9px" fontWeight={700}
                  style={{ letterSpacing: '0.04em' }}
                >
                  GROUP
                </Box>
              </Flex>
            </Box>
          )}

          {convs.map((c) => (
            <ConvRow
              key={c.handshake_id}
              conv={c}
              isSelected={c.handshake_id === selectedId}
              onClick={() => onSelect(c.handshake_id)}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

// ─── Conversation Sidebar ─────────────────────────────────────────────────────

type FilterTab = 'all' | 'my_services' | 'my_interests'

function ConversationSidebar({
  conversations, selectedId, selectedGroupServiceId, onSelect, onSelectGroup, isLoading,
}: {
  conversations: ChatConversation[]
  selectedId: string | null
  selectedGroupServiceId: string | null
  onSelect: (id: string) => void
  onSelectGroup: (serviceId: string) => void
  isLoading: boolean
}) {
  const [showClosed, setShowClosed] = useState(false)
  const [tab, setTab] = useState<FilterTab>('all')
  const nav = useNavigate()

  const myServices  = conversations.filter((c) => isServiceOwner(c))
  const myInterests = conversations.filter((c) => !isServiceOwner(c))

  const filtered = tab === 'my_services' ? myServices : tab === 'my_interests' ? myInterests : conversations

  const active = filtered.filter((c) => ACTIVE_STATUSES.has(c.status))
  const evaluationPending = filtered.filter(
    (c) => c.status === 'completed' && getEvaluationWindowState(c).isPending,
  )
  const evaluationPendingIds = new Set(evaluationPending.map((c) => c.handshake_id))
  const closed = filtered.filter(
    (c) => CLOSED_STATUSES.has(c.status) && !evaluationPendingIds.has(c.handshake_id),
  )

  const activeGroups = groupByService(active)
  const evaluationPendingGroups = groupByService(evaluationPending)
  const closedGroups = groupByService(closed)

  if (isLoading && conversations.length === 0) {
    return (
      <Flex flex={1} align="center" justify="center">
        <Spinner size="md" color={GREEN} />
      </Flex>
    )
  }

  if (conversations.length === 0) {
    return (
      <Flex flex={1} direction="column" align="center" justify="center" gap={4} p={6} textAlign="center">
        <Box
          w="56px" h="56px" borderRadius="full" bg={GREEN_LT}
          display="flex" alignItems="center" justifyContent="center"
          color={GREEN} fontSize="24px"
        >
          <FiMessageSquare />
        </Box>
        <Box>
          <Text fontSize="14px" fontWeight={700} color={GRAY800}>No conversations yet</Text>
          <Text fontSize="12px" color={GRAY500} mt={1}>
            Express interest in a service to start chatting.
          </Text>
        </Box>
        <Box
          as="button" px={4} py="8px" borderRadius="8px"
          bg={GREEN} color={WHITE} fontSize="12px" fontWeight={600}
          style={{ border: 'none', cursor: 'pointer' }}
          onClick={() => nav('/dashboard')}
        >
          Browse Services
        </Box>
      </Flex>
    )
  }

  return (
    <Box flex={1} display="flex" flexDirection="column" overflow="hidden">
      {/* Filter tabs */}
      <Box px={3} pt={2} pb={0} borderBottom={`1px solid ${GRAY100}`} bg={WHITE}>
        <Flex gap={0}>
          {([ 
            { key: 'all',          label: 'All',          count: conversations.length },
            { key: 'my_services',  label: 'My Services',  count: myServices.length },
            { key: 'my_interests', label: 'My Interests', count: myInterests.length },
          ] as { key: FilterTab; label: string; count: number }[]).map(({ key, label, count }) => (
            <Box
              key={key}
              as="button"
              px={3} py="8px"
              fontSize="12px" fontWeight={tab === key ? 700 : 500}
              color={tab === key ? GREEN : GRAY400}
              borderBottom={tab === key ? `2px solid ${GREEN}` : '2px solid transparent'}
              bg="transparent"
              style={{ border: 'none', borderBottom: tab === key ? `2px solid ${GREEN}` : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => setTab(key)}
              _hover={{ color: GRAY700 }}
              transition="all 0.1s"
            >
              {label}
              {count > 0 && (
                <Box
                  as="span"
                  ml={1} px="5px" py="0px" borderRadius="full"
                  fontSize="10px" fontWeight={700}
                  bg={tab === key ? GREEN : GRAY200}
                  color={tab === key ? WHITE : GRAY500}
                  display="inline-block"
                >
                  {count}
                </Box>
              )}
            </Box>
          ))}
        </Flex>
      </Box>

      <Box flex={1} overflowY="auto">
      {/* Active section */}
      {active.length > 0 && (
        <Box>
          <Box px={4} py="8px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`}>
            <Flex align="center" gap={2}>
              <Box w="7px" h="7px" borderRadius="full" bg="#10B981" />
              <Text fontSize="11px" fontWeight={700} color={GRAY600} textTransform="uppercase" letterSpacing="0.06em">
                Active · {active.length}
              </Text>
            </Flex>
          </Box>
          {Array.from(activeGroups.entries()).map(([title, convs]) => (
            <ServiceGroup
              key={title}
              title={title}
              convs={convs}
              selectedId={selectedId}
              selectedGroupServiceId={selectedGroupServiceId}
              onSelect={onSelect}
              onSelectGroup={onSelectGroup}
              defaultOpen={convs.some((c) => c.handshake_id === selectedId) || activeGroups.size === 1}
            />
          ))}
        </Box>
      )}
      {active.length === 0 && filtered.length > 0 && (
        <Box px={4} py={3}>
          <Text fontSize="12px" color={GRAY400} textAlign="center">No active conversations in this filter.</Text>
        </Box>
      )}

      {/* Evaluation Pending section */}
      {evaluationPending.length > 0 && (
        <Box>
          <Box
            px={4} py="8px" bg={GRAY50}
            borderTop={active.length > 0 ? `1px solid ${GRAY200}` : 'none'}
            borderBottom={`1px solid ${GRAY200}`}
          >
            <Flex align="center" gap={2}>
              <Box w="7px" h="7px" borderRadius="full" bg={AMBER} />
              <Text fontSize="11px" fontWeight={700} color={AMBER} textTransform="uppercase" letterSpacing="0.06em">
                Evaluation Pending · {evaluationPending.length}
              </Text>
            </Flex>
          </Box>
          {Array.from(evaluationPendingGroups.entries()).map(([title, convs]) => (
            <ServiceGroup
              key={title}
              title={title}
              convs={convs}
              selectedId={selectedId}
              selectedGroupServiceId={selectedGroupServiceId}
              onSelect={onSelect}
              onSelectGroup={onSelectGroup}
              defaultOpen={convs.some((c) => c.handshake_id === selectedId) || evaluationPendingGroups.size === 1}
            />
          ))}
        </Box>
      )}

      {/* Closed section toggle */}
      {closed.length > 0 && (
        <Box>
          <Box
            as="button" w="100%" textAlign="left"
            px={4} py="9px"
            bg={GRAY50}
            borderTop={active.length > 0 ? `1px solid ${GRAY200}` : 'none'}
            borderBottom={`1px solid ${GRAY200}`}
            onClick={() => setShowClosed((v) => !v)}
            _hover={{ bg: GRAY100 }}
          >
            <Flex align="center" gap={2}>
              <Box color={GRAY400} fontSize="12px">
                {showClosed ? <FiChevronDown /> : <FiChevronRight />}
              </Box>
              <Box w="7px" h="7px" borderRadius="full" bg={GRAY400} flexShrink={0} />
              <Text fontSize="11px" fontWeight={700} color={GRAY500} textTransform="uppercase" letterSpacing="0.06em">
                Completed / Closed · {closed.length}
              </Text>
            </Flex>
          </Box>

          {showClosed && (
            <Box opacity={0.75}>
              {Array.from(closedGroups.entries()).map(([title, convs]) => (
                <ServiceGroup
                  key={title}
                  title={title}
                  convs={convs}
                  selectedId={selectedId}
                  selectedGroupServiceId={selectedGroupServiceId}
                  onSelect={onSelect}
                  onSelectGroup={onSelectGroup}
                  defaultOpen={convs.some((c) => c.handshake_id === selectedId)}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
      </Box>
    </Box>
  )
}

// ─── Handshake Step Bar ───────────────────────────────────────────────────────

type StepStatus = 'done' | 'active' | 'upcoming'

function StepDot({ s }: { s: StepStatus }) {
  if (s === 'done') return (
    <Box
      w="22px" h="22px" borderRadius="full" flexShrink={0}
      bg={GREEN} color={WHITE}
      display="flex" alignItems="center" justifyContent="center"
      fontSize="11px"
    >
      <FiCheck strokeWidth={3} />
    </Box>
  )
  if (s === 'active') return (
    <Box
      w="22px" h="22px" borderRadius="full" flexShrink={0}
      bg={WHITE} border={`2.5px solid ${GREEN}`}
      display="flex" alignItems="center" justifyContent="center"
    >
      <Box w="9px" h="9px" borderRadius="full" bg={GREEN} />
    </Box>
  )
  return (
    <Box w="22px" h="22px" borderRadius="full" flexShrink={0} bg={WHITE} border={`2px solid ${GRAY300}`} />
  )
}

function HsStepBar({ conv }: { conv: ChatConversation }) {
  const { status, provider_initiated } = conv
  if (['cancelled', 'denied'].includes(status)) return null

  let cur = 0
  if (status === 'completed' || status === 'reported') cur = 3
  else if (status === 'accepted') cur = 2
  else if (status === 'pending' && provider_initiated) cur = 1
  else cur = 0

  const steps = ['Interest Sent', 'Session Proposed', 'Session Confirmed', 'Completed']

  const ss = (i: number): StepStatus => i < cur ? 'done' : i === cur ? 'active' : 'upcoming'

  return (
    <Box px={5} py="10px" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`}>
      <Flex align="center">
        {steps.map((label, i) => (
          <Flex key={i} align="center" flex={i < steps.length - 1 ? 1 : 'none'} minW={0}>
            <Flex direction="column" align="center" gap="4px" flexShrink={0}>
              <StepDot s={ss(i)} />
              <Text
                fontSize="9px" fontWeight={ss(i) === 'active' ? 700 : 500}
                color={ss(i) === 'upcoming' ? GRAY300 : ss(i) === 'done' ? GREEN : GRAY700}
                textAlign="center"
                style={{ whiteSpace: 'nowrap', letterSpacing: '0.02em' }}
              >
                {label.toUpperCase()}
              </Text>
            </Flex>
            {i < steps.length - 1 && (
              <Box flex={1} h="1.5px" mx="8px" mb="13px" bg={i < cur ? GREEN : GRAY200} borderRadius="full" />
            )}
          </Flex>
        ))}
      </Flex>
    </Box>
  )
}

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({
  conv,
  onInitiate,
  onShowApprove,
  onConfirm,
  onCancel,
  isCancelling,
  onRequestCancellation,
  onApproveCancellation,
  onRejectCancellation,
  isRequestingCancellation,
  isApprovingCancellation,
  isRejectingCancellation,
  onOpenEvaluation,
  onReportNoShow,
  isReportingNoShow,
}: {
  conv: ChatConversation
  onInitiate: () => void
  onShowApprove: () => void
  onConfirm: () => void
  onCancel: () => Promise<void>
  isCancelling: boolean
  onRequestCancellation: () => Promise<void>
  onApproveCancellation: () => Promise<void>
  onRejectCancellation: () => Promise<void>
  isRequestingCancellation: boolean
  isApprovingCancellation: boolean
  isRejectingCancellation: boolean
  onOpenEvaluation: () => void
  onReportNoShow: () => Promise<void>
  isReportingNoShow: boolean
}) {
  const {
    status, is_provider, provider_initiated,
    provider_confirmed_complete, receiver_confirmed_complete,
    scheduled_time, exact_location, exact_duration, provisioned_hours,
  } = conv
  const fixedGroupOffer = isFixedGroupOffer(conv)
  const previewScheduledTime = scheduled_time ?? conv.service_scheduled_time ?? null
  const previewLocation = exact_location ?? conv.service_location_area ?? null

  // Service owner always initiates (Offer or Want) — requester approves
  const iAmServiceOwner = isServiceOwner(conv)

  const myConfirmed    = is_provider ? provider_confirmed_complete : receiver_confirmed_complete
  const otherConfirmed = is_provider ? receiver_confirmed_complete : provider_confirmed_complete

  if (!['pending', 'accepted', 'completed'].includes(status)) return null

  if (status === 'completed') {
    const evalWindow = getEvaluationWindowState(conv)
    const canEvaluate = evalWindow.isPending

    return (
      <Box mx={4} my="10px" p={4} borderRadius="14px" bg={BLUE_LT} border={`1px solid #BFDBFE`}>
        <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
          <Flex align="center" gap={3}>
            <Box
              w="34px" h="34px" borderRadius="full" flexShrink={0}
              bg={BLUE} color={WHITE}
              display="flex" alignItems="center" justifyContent="center"
            >
              <FiCheck size={14} strokeWidth={3} />
            </Box>
            <Box>
              <Text fontSize="13px" fontWeight={700} color={BLUE}>Service Completed</Text>
              <Text fontSize="12px" color="#3B82F6">TimeBank hours transferred successfully.</Text>
            </Box>
          </Flex>
          {canEvaluate ? (
            <CTA label="Leave Evaluation" bg={BLUE} onClick={onOpenEvaluation} />
          ) : conv.user_has_reviewed ? (
            <Text fontSize="12px" fontWeight={700} color={GREEN}>Evaluation submitted</Text>
          ) : evalWindow.isClosed ? (
            <Text fontSize="12px" fontWeight={700} color={GRAY600}>Evaluation window closed</Text>
          ) : null}
        </Flex>
        {canEvaluate && (
          <Text fontSize="11px" color={AMBER} mt={2} fontWeight={700}>
            Evaluation Waiting: {evalWindow.timeLeftLabel ?? 'Time left unavailable'}
          </Text>
        )}
      </Box>
    )
  }

  if (status === 'accepted') {
    const hasDetails = provisioned_hours != null || scheduled_time || exact_location || exact_duration
    const hasCancellationRequest = Boolean(conv.cancellation_requested_by_id)
    const canRespondToCancellation = conv.can_respond_to_cancellation === true
    const cancellationReason = conv.cancellation_reason?.trim()
    const cancellationRequesterName = conv.cancellation_requested_by_name ?? conv.other_user.name

    return (
      <Box mx={4} my="10px" borderRadius="14px" overflow="hidden"
        border={`1px solid ${myConfirmed ? GREEN_MD : '#FDE68A'}`}
      >
        {/* Session detail grid */}
        {hasDetails && (
          <Box bg={WHITE} px={4} py="12px" borderBottom={`1px solid ${GRAY100}`}>
            <Text fontSize="10px" fontWeight={700} color={GRAY400}
              textTransform="uppercase" letterSpacing="0.06em" mb={2}>
              Session Details
            </Text>
            <Flex gap={4} flexWrap="wrap">
              {provisioned_hours != null && (
                <Box>
                  <Text fontSize="10px" color={GRAY400} fontWeight={600} mb="2px">TIMEBANK</Text>
                  {is_provider ? (
                    <Box px="6px" py="1px" borderRadius="5px" bg="#D1FAE5" display="inline-flex" alignItems="center" gap={1}>
                      <Text fontSize="13px" fontWeight={700} color="#065F46">+{provisioned_hours}h</Text>
                      <Text fontSize="10px" color="#065F46" opacity={0.7}>you earn</Text>
                    </Box>
                  ) : (
                    <Box px="6px" py="1px" borderRadius="5px" bg="#FEE2E2" display="inline-flex" alignItems="center" gap={1}>
                      <Text fontSize="13px" fontWeight={700} color="#991B1B">-{provisioned_hours}h</Text>
                      <Text fontSize="10px" color="#991B1B" opacity={0.7}>you pay</Text>
                    </Box>
                  )}
                </Box>
              )}
              {exact_duration && (
                <Box>
                  <Text fontSize="10px" color={GRAY400} fontWeight={600} mb="2px">DURATION</Text>
                  <Flex align="center" gap={1}>
                    <FiClock size={12} color={GRAY500} />
                    <Text fontSize="13px" fontWeight={600} color={GRAY700}>
                      {exact_duration}h
                    </Text>
                  </Flex>
                </Box>
              )}
              {scheduled_time && (
                <Box>
                  <Text fontSize="10px" color={GRAY400} fontWeight={600} mb="2px">DATE & TIME</Text>
                  <Flex align="center" gap={1}>
                    <FiCalendar size={12} color={GRAY500} />
                    <Text fontSize="13px" fontWeight={600} color={GRAY700}>
                      {fmtDateTime(scheduled_time)}
                    </Text>
                  </Flex>
                </Box>
              )}
              {exact_location && (
                <Box>
                  <Text fontSize="10px" color={GRAY400} fontWeight={600} mb="2px">LOCATION</Text>
                  <Flex align="center" gap={1}>
                    <FiMapPin size={12} color={GRAY500} />
                    <Text fontSize="13px" fontWeight={600} color={GRAY700}>
                      {exact_location}
                    </Text>
                  </Flex>
                </Box>
              )}
            </Flex>
          </Box>
        )}

        {hasCancellationRequest ? (
          <Flex
            align="center" justify="space-between" gap={3}
            px={4} py="12px"
            bg={RED_LT}
            borderTop={`1px solid ${GRAY100}`}
            flexWrap="wrap"
          >
            <Box>
              <Text fontSize="13px" fontWeight={700} color={RED}>
                {canRespondToCancellation ? 'Cancellation approval needed' : 'Cancellation request pending'}
              </Text>
              <Text fontSize="12px" color={GRAY500} mt="1px">
                {canRespondToCancellation
                  ? `${cancellationRequesterName} wants to cancel this handshake.`
                  : `Waiting for ${conv.other_user.name} to respond to the cancellation request.`}
              </Text>
              {cancellationReason && (
                <Text fontSize="11px" color={GRAY600} mt="4px">
                  Reason: {cancellationReason}
                </Text>
              )}
            </Box>
            {canRespondToCancellation ? (
              <Flex align="center" gap={2}>
                <Button
                  px="12px"
                  h="34px"
                  borderRadius="9px"
                  bg={RED}
                  color={WHITE}
                  fontSize="12px"
                  fontWeight={700}
                  disabled={isApprovingCancellation || isRejectingCancellation}
                  onClick={() => { void onApproveCancellation() }}
                >
                  {isApprovingCancellation ? 'Approving...' : 'Approve Cancellation'}
                </Button>
                <Button
                  px="12px"
                  h="34px"
                  borderRadius="9px"
                  border={`1px solid ${GRAY300}`}
                  bg={WHITE}
                  color={GRAY700}
                  fontSize="12px"
                  fontWeight={700}
                  disabled={isApprovingCancellation || isRejectingCancellation}
                  onClick={() => { void onRejectCancellation() }}
                >
                  {isRejectingCancellation ? 'Keeping...' : 'Keep Handshake'}
                </Button>
              </Flex>
            ) : (
              <Text fontSize="12px" fontWeight={700} color={RED}>
                Awaiting response
              </Text>
            )}
          </Flex>
        ) : (
          <Flex
            align="center" justify="space-between" gap={3}
            px={4} py="12px"
            bg={myConfirmed ? GREEN_LT : AMBER_LT}
            flexWrap="wrap"
          >
            <Box>
              {myConfirmed ? (
                <Text fontSize="13px" fontWeight={700} color={GREEN}>✓ You confirmed completion</Text>
              ) : (
                <Text fontSize="13px" fontWeight={700} color={AMBER}>Confirm the service is done</Text>
              )}
              <Text fontSize="12px" color={GRAY500} mt="1px">
                {myConfirmed
                  ? otherConfirmed
                    ? 'Both confirmed — completing transfer…'
                    : `Waiting for ${conv.other_user.name} to confirm`
                  : otherConfirmed
                    ? `${conv.other_user.name} already confirmed — your turn!`
                    : 'Both sides must confirm to release TimeBank hours'
                }
              </Text>
            </Box>
            <Flex align="center" gap={2} flexWrap="wrap">
              {!myConfirmed && <CTA label="Confirm Completion" bg={AMBER} onClick={onConfirm} />}
              <Button
                px="12px"
                h="34px"
                borderRadius="9px"
                border={`1px solid ${RED}`}
                color={RED}
                bg={RED_LT}
                fontSize="12px"
                fontWeight={700}
                disabled={isRequestingCancellation || isReportingNoShow}
                onClick={() => { void onRequestCancellation() }}
              >
                {isRequestingCancellation ? 'Requesting...' : 'Request Cancellation'}
              </Button>
              {!myConfirmed && (
                <Button
                  px="12px"
                  h="34px"
                  borderRadius="9px"
                  border={`1px solid ${RED}`}
                  color={RED}
                  bg={RED_LT}
                  fontSize="12px"
                  fontWeight={700}
                  disabled={isReportingNoShow || isRequestingCancellation}
                  onClick={() => { void onReportNoShow() }}
                >
                  {isReportingNoShow ? 'Reporting...' : 'Report No-Show'}
                </Button>
              )}
            </Flex>
          </Flex>
        )}
      </Box>
    )
  }

  // Pending
  return (
    <Box mx={4} my="10px" p={4} borderRadius="14px"
      bg={WHITE} border={`1.5px solid ${GRAY200}`}
      boxShadow="0 1px 3px rgba(0,0,0,0.04)"
    >
      {iAmServiceOwner ? (
        // ── Service owner side (Offer owner OR Want/Need owner) ──────────────
        provider_initiated ? (
          // Already sent details — waiting for requester to approve
          <Flex align="center" gap={3}>
            <Box w="34px" h="34px" borderRadius="10px" flexShrink={0} bg="#FEF3C7"
              display="flex" alignItems="center" justifyContent="center" color={AMBER}>
              <FiClock size={15} />
            </Box>
            <Box>
              <Text fontSize="13px" fontWeight={700} color={GRAY800}>Session details sent</Text>
              <Text fontSize="12px" color={GRAY500}>
                Waiting for <b>{conv.other_user.name}</b> to approve
              </Text>
              {previewScheduledTime && (
                <Text fontSize="11px" color={GRAY400} mt="3px">
                  📅 {fmtDateTime(previewScheduledTime)}{previewLocation ? `  •  📍 ${previewLocation}` : ''}
                </Text>
              )}
            </Box>
          </Flex>
        ) : (
          // Not yet initiated — service owner proposes
          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Flex align="center" gap={3}>
              <Box w="34px" h="34px" borderRadius="10px" flexShrink={0} bg={GREEN_LT}
                display="flex" alignItems="center" justifyContent="center" color={GREEN}>
                <FiZap size={15} />
              </Box>
              <Box>
                <Text fontSize="13px" fontWeight={700} color={GRAY800}>
                  {fixedGroupOffer ? 'Share fixed group details' : 'Propose a session'}
                </Text>
                <Text fontSize="12px" color={GRAY500}>
                  {fixedGroupOffer
                    ? 'This offer already has a fixed location, date and duration.'
                    : 'Set a location, date and duration'}
                </Text>
              </Box>
            </Flex>
            <Flex align="center" gap={2}>
              <CTA label={fixedGroupOffer ? 'Share Offer Details' : 'Initiate Handshake'} bg={GREEN} onClick={onInitiate} />
              <CancelBtn onClick={onCancel} loading={isCancelling} />
            </Flex>
          </Flex>
        )
      ) : (
        // ── Requester side (expressed interest) ─────────────────────────────
        provider_initiated ? (
          // Service owner sent details — requester reviews & approves
          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
            <Flex align="center" gap={3}>
              <Box w="34px" h="34px" borderRadius="10px" flexShrink={0} bg={GREEN_LT}
                display="flex" alignItems="center" justifyContent="center" color={GREEN}>
                <FiCalendar size={15} />
              </Box>
              <Box>
                <Text fontSize="13px" fontWeight={700} color={GRAY800}>Service owner proposed a session</Text>
                <Text fontSize="12px" color={GRAY500}>
                  {fixedGroupOffer ? 'Review the fixed group-offer details and approve or decline' : 'Review the details and approve or decline'}
                </Text>
                {previewScheduledTime && (
                  <Text fontSize="11px" color={GRAY400} mt="3px">
                    📅 {fmtDateTime(previewScheduledTime)}{previewLocation ? `  •  📍 ${previewLocation}` : ''}
                  </Text>
                )}
              </Box>
            </Flex>
            <Flex align="center" gap={2}>
              <CTA label="Review & Approve" bg={GREEN} onClick={onShowApprove} />
              <CancelBtn onClick={onCancel} loading={isCancelling} />
            </Flex>
          </Flex>
        ) : (
          // Waiting for service owner to initiate
          <Flex align="center" gap={3}>
            <Box w="34px" h="34px" borderRadius="10px" flexShrink={0} bg={GRAY100}
              display="flex" alignItems="center" justifyContent="center" color={GRAY400}>
              <FiClock size={15} />
            </Box>
            <Box flex={1}>
              <Text fontSize="13px" fontWeight={700} color={GRAY800}>Waiting for the service owner</Text>
              <Text fontSize="12px" color={GRAY500}>
                <b>{conv.other_user.name}</b> will {fixedGroupOffer ? 'share the fixed group-offer details' : 'propose a session time and location'}
              </Text>
            </Box>
            <CancelBtn onClick={onCancel} loading={isCancelling} />
          </Flex>
        )
      )}
    </Box>
  )
}

function CTA({ label, bg, onClick, disabled }: {
  label: string; bg: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <Box
      as="button" px={4} py="7px" borderRadius="8px"
      fontSize="12px" fontWeight={600} color={WHITE} flexShrink={0}
      style={{
        background: bg, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
      }}
      onClick={!disabled ? onClick : undefined}
    >
      {label}
    </Box>
  )
}

function CancelBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Box
      as="button" px={3} py="6px" borderRadius="8px"
      fontSize="12px" fontWeight={600} color={RED} bg={RED_LT} flexShrink={0}
      style={{ border: 'none', cursor: loading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
      onClick={!loading ? onClick : undefined}
    >
      {loading ? 'Cancelling…' : 'Cancel'}
    </Box>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg, isMine }: { msg: ApiChatMessage; isMine: boolean }) {
  return (
    <Flex
      justify={isMine ? 'flex-end' : 'flex-start'}
      align="flex-end" gap={2} px={4} py="2px"
    >
      {!isMine && <Avatar name={msg.sender_name} url={msg.sender_avatar_url} size={28} />}
      <Box maxW="68%">
        {!isMine && (
          <Text fontSize="11px" color={GRAY400} mb="3px" ml={1}>{msg.sender_name}</Text>
        )}
        <Box
          px={3} py="10px"
          borderRadius={isMine ? '20px 20px 6px 20px' : '20px 20px 20px 6px'}
          bg={isMine ? GREEN : WHITE}
          color={isMine ? WHITE : GRAY800}
          fontSize="14px" lineHeight="1.55"
          boxShadow={isMine ? 'none' : '0 1px 2px rgba(0,0,0,0.06)'}
          style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
        >
          {msg.body}
        </Box>
        <Text
          fontSize="10px" color={GRAY400} mt="3px"
          textAlign={isMine ? 'right' : 'left'} px={1}
        >
          {timeAgo(msg.created_at)}
        </Text>
      </Box>
    </Flex>
  )
}

// ─── Group Chat Thread ────────────────────────────────────────────────────────

function GroupChatThread({
  serviceId, serviceTitle, participants, messages, user, wsConnected, draft, setDraft, isSending,
  sendError, onSend, onKeyDown, inputRef, bottomRef, onBack,
}: {
  serviceId: string
  serviceTitle: string
  participants: GroupChatParticipant[]
  messages: GroupChatMessage[]
  user: { id?: string } | null
  wsConnected: boolean
  draft: string
  setDraft: (v: string) => void
  isSending: boolean
  sendError: string | null
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
  onBack: () => void
}) {
  return (
    <>
      {/* Header */}
      <Box px={5} py="12px" bg={WHITE} borderBottom={`1px solid ${GRAY200}`}>
        <Flex align="center" gap={3}>
          <Box
            as="button"
            display={{ base: 'flex', md: 'none' }}
            alignItems="center" color={GRAY500} fontSize="18px"
            onClick={onBack}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <FiArrowLeft />
          </Box>

          <Box
            w="38px" h="38px" borderRadius="full" flexShrink={0}
            bg={BLUE} display="flex" alignItems="center" justifyContent="center"
            color={WHITE} fontSize="18px"
          >
            <FiUsers />
          </Box>

          <Box flex={1} minW={0}>
            <Flex align="center" gap={2}>
              <Text fontSize="14px" fontWeight={700} color={GRAY800}>{serviceTitle}</Text>
              <Box
                px="6px" py="1px" borderRadius="full" fontSize="10px" fontWeight={700}
                bg="#EFF6FF" color={BLUE}
              >
                {participants.length} members
              </Box>
            </Flex>
            <Flex
              as="button"
              align="center" gap={1}
              onClick={() => window.open(`/service-detail/${serviceId}`, '_blank')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <Text
                fontSize="12px" color={GREEN} fontWeight={500}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textDecoration: 'underline', textUnderlineOffset: '2px' }}
              >
                {serviceTitle}
              </Text>
              <Box color={GREEN} fontSize="11px" flexShrink={0}><FiChevronRight /></Box>
            </Flex>
          </Box>

          {/* Participant avatars */}
          <Flex align="center" gap={1} flexShrink={0}>
            {participants.slice(0, 3).map((participant) => (
              <Box
                key={participant.id}
                w="26px" h="26px" borderRadius="full"
                bg={GREEN} color={WHITE}
                display="flex" alignItems="center" justifyContent="center"
                fontSize="10px" fontWeight={700}
                style={{ overflow: 'hidden', marginLeft: '-6px', border: `2px solid ${WHITE}` }}
                title={participant.name}
              >
                {participant.avatar_url
                  ? <img src={participant.avatar_url} alt={participant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : participant.name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)
                }
              </Box>
            ))}
            {participants.length > 3 && (
              <Box
                w="26px" h="26px" borderRadius="full"
                bg={GRAY200} color={GRAY600}
                display="flex" alignItems="center" justifyContent="center"
                fontSize="10px" fontWeight={700}
                style={{ marginLeft: '-6px', border: `2px solid ${WHITE}` }}
              >
                +{participants.length - 3}
              </Box>
            )}
          </Flex>

          {!wsConnected && (
            <Box color={GRAY400} fontSize="14px" title="Polling fallback">
              <FiWifiOff />
            </Box>
          )}
        </Flex>
      </Box>

      {/* Messages */}
      <Box flex={1} overflowY="auto" py={3}>
        {messages.length === 0 ? (
          <Flex align="center" justify="center" h="100%" direction="column" gap={3}>
            <Box
              w="48px" h="48px" borderRadius="full" bg="#EFF6FF"
              display="flex" alignItems="center" justifyContent="center"
              color={BLUE} fontSize="20px"
            >
              <FiUsers />
            </Box>
            <Text fontSize="13px" color={GRAY400}>No messages yet. Start the group conversation! 👋</Text>
          </Flex>
        ) : (
          <Stack gap={1}>
            {messages.map((msg) => {
              const isMine = msg.sender_id === user?.id
              return (
                <Flex
                  key={msg.id}
                  justify={isMine ? 'flex-end' : 'flex-start'}
                  align="flex-end" gap={2} px={4} py="2px"
                >
                  {!isMine && <Avatar name={msg.sender_name} url={msg.sender_avatar_url} size={28} />}
                  <Box maxW="68%">
                    {!isMine && (
                      <Text fontSize="11px" color={GRAY400} mb="3px" ml={1}>{msg.sender_name}</Text>
                    )}
                    <Box
                      px={3} py="10px"
                      borderRadius={isMine ? '20px 20px 6px 20px' : '20px 20px 20px 6px'}
                      bg={isMine ? BLUE : WHITE}
                      color={isMine ? WHITE : GRAY800}
                      fontSize="14px" lineHeight="1.55"
                      boxShadow={isMine ? 'none' : '0 1px 2px rgba(0,0,0,0.06)'}
                      style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                    >
                      {msg.body}
                    </Box>
                    <Text
                      fontSize="10px" color={GRAY400} mt="3px"
                      textAlign={isMine ? 'right' : 'left'} px={1}
                    >
                      {timeAgo(msg.created_at)}
                    </Text>
                  </Box>
                </Flex>
              )
            })}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      {sendError && (
        <Box px={4} py={2} bg={RED_LT}>
          <Text fontSize="12px" color={RED}>{sendError}</Text>
        </Box>
      )}

      {/* Input */}
      <Box px={4} py={3} bg={WHITE} borderTop={`1px solid ${GRAY200}`}>
        <Flex align="flex-end" gap={2}>
          <Box
            flex={1} border={`1.5px solid ${GRAY200}`} borderRadius="16px"
            overflow="hidden" bg={GRAY50}
            _focusWithin={{ borderColor: BLUE, bg: WHITE }}
            transition="all 0.15s"
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message the group…"
              rows={1}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', fontSize: '14px', color: GRAY800,
                fontFamily: 'inherit', lineHeight: '1.5',
                maxHeight: '120px', overflowY: 'auto',
              }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />
          </Box>
          <Box
            as="button"
            w="42px" h="42px" borderRadius="12px"
            display="flex" alignItems="center" justifyContent="center"
            flexShrink={0}
            bg={draft.trim() ? BLUE : GRAY200}
            color={draft.trim() ? WHITE : GRAY400}
            fontSize="16px"
            onClick={onSend}
            style={{
              border: 'none',
              cursor: draft.trim() && !isSending ? 'pointer' : 'default',
              transition: 'background 0.15s',
              opacity: !draft.trim() || isSending ? 0.5 : 1,
            }}
          >
            {isSending ? <Spinner size="xs" color={WHITE} /> : <FiSend />}
          </Box>
        </Flex>
        <Text fontSize="10px" color={GRAY400} mt="4px" textAlign="right">
          Enter to send · Shift+Enter for new line
        </Text>
      </Box>
    </>
  )
}

// ─── Empty thread ─────────────────────────────────────────────────────────────

function EmptyThread() {
  return (
    <Flex flex={1} direction="column" align="center" justify="center" gap={3} p={8} textAlign="center">
      <Box
        w="52px" h="52px" borderRadius="full" bg={GRAY100}
        display="flex" alignItems="center" justifyContent="center"
        color={GRAY300} fontSize="22px"
      >
        <FiInbox />
      </Box>
      <Box>
        <Text fontSize="14px" fontWeight={600} color={GRAY700}>No conversation selected</Text>
        <Text fontSize="12px" color={GRAY400} mt={1}>
          Pick one from the list to start messaging.
        </Text>
      </Box>
    </Flex>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { handshakeId: paramId } = useParams<{ handshakeId?: string }>()
  const [searchParams] = useSearchParams()
  const groupParam = searchParams.get('group')
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  // WebSocket auth via Cookie only (Vite proxy forwards headers for /ws)

  const [conversations,        setConversations]        = useState<ChatConversation[]>([])
  const [messages,             setMessages]             = useState<ApiChatMessage[]>([])
  const [selectedId,           setSelectedId]           = useState<string | null>(paramId ?? null)
  const [groupServiceId,       setGroupServiceId]       = useState<string | null>(null)
  const [groupMessages,        setGroupMessages]        = useState<GroupChatMessage[]>([])
  const [groupParticipants,    setGroupParticipants]    = useState<GroupChatParticipant[]>([])
  const [groupServiceTitle,    setGroupServiceTitle]    = useState('Group Chat')
  const [draft,                setDraft]                = useState('')
  const [isSending,            setIsSending]            = useState(false)
  const [sendError,            setSendError]            = useState<string | null>(null)
  const [isCancelling,         setIsCancelling]         = useState(false)
  const [isRequestingCancellation, setIsRequestingCancellation] = useState(false)
  const [isApprovingCancellation, setIsApprovingCancellation] = useState(false)
  const [isRejectingCancellation, setIsRejectingCancellation] = useState(false)
  const [isReportingNoShow,    setIsReportingNoShow]    = useState(false)
  const [isApproving,          setIsApproving]          = useState(false)
  const [isDeclining,          setIsDeclining]          = useState(false)
  const [mobileShowThread,     setMobileShowThread]     = useState(!!paramId)
  const [convRefreshTick,      setConvRefreshTick]      = useState(0)

  const [showInitiateModal, setShowInitiateModal] = useState(false)
  const [showApproveModal,  setShowApproveModal]  = useState(false)
  const [showConfirmModal,  setShowConfirmModal]  = useState(false)
  const [showEvaluationModal, setShowEvaluationModal] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Refs so fetchConversations doesn't recreate on every selectedId change
  const selectedIdRef = useRef(selectedId)
  const paramIdRef    = useRef(paramId)
  selectedIdRef.current = selectedId
  paramIdRef.current    = paramId

  const selectedConv     = conversations.find((c) => c.handshake_id === selectedId) ?? null
  const refreshConversations = useCallback(() => setConvRefreshTick((n) => n + 1), [])

  useEffect(() => {
    if (paramId && paramId !== selectedId) {
      setSelectedId(paramId)
      setMobileShowThread(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId])

  // Deep-link: ?group={serviceId} opens the group chat for that service
  useEffect(() => {
    if (groupParam && groupParam !== groupServiceId) {
      setGroupServiceId(groupParam)
      setSelectedId(null)
      setMobileShowThread(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupParam])

  // Scroll to bottom — walk up to the first scrollable container and set scrollTop.
  // Using scrollIntoView would bubble up to body/html and shift the navbar.
  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    let node: HTMLElement | null = el.parentElement
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node)
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        node.scrollTop = node.scrollHeight
        return
      }
      node = node.parentElement
    }
  }, [messages.length, groupMessages.length])
  useEffect(() => { setMessages([]); setSendError(null) }, [selectedId])
  useEffect(() => {
    setGroupMessages([])
    setGroupParticipants([])
    setGroupServiceTitle('Group Chat')
  }, [groupServiceId])

  const fetchMessages = useCallback(async (signal: AbortSignal) => {
    if (!selectedId) return
    const fetched = await conversationAPI.getMessages(selectedId, signal)
    setMessages((prev) => mergeMessages(prev, [...fetched].reverse()))
  }, [selectedId])

  const fetchGroupMessages = useCallback(async (signal: AbortSignal) => {
    if (!groupServiceId) return
    const fetched = await groupChatAPI.getMessages(groupServiceId, signal)
    setGroupMessages(fetched.messages)
    setGroupParticipants(fetched.participants)
    setGroupServiceTitle(fetched.service_title || 'Group Chat')
  }, [groupServiceId])

  // Initial load from DB when conversation is selected (so old messages show even when polling is off in dev)
  useEffect(() => {
    if (!selectedId) return
    const ac = new AbortController()
    fetchMessages(ac.signal).catch(() => {})
    return () => ac.abort()
  }, [selectedId, fetchMessages])
  useEffect(() => {
    if (!groupServiceId) return
    const ac = new AbortController()
    fetchGroupMessages(ac.signal).catch(() => {})
    return () => ac.abort()
  }, [groupServiceId, fetchGroupMessages])

  const fetchConversations = useCallback(async (signal: AbortSignal) => {
    const data = await conversationAPI.listConversations(signal)
    // Filter out event conversations — events use a dedicated Event Chat modal
    const filtered = data.filter((c) => c.service_type !== 'Event')
    setConversations(filtered)
    // Auto-select first active conversation only when nothing is selected yet
    if (!selectedIdRef.current && !paramIdRef.current && filtered.length > 0) {
      const first =
        filtered.find((c) => ACTIVE_STATUSES.has(c.status))
        ?? filtered.find((c) => c.status === 'completed' && getEvaluationWindowState(c).isPending)
        ?? filtered[0]
      setSelectedId(first.handshake_id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convRefreshTick]) // convRefreshTick is a manual refresh trigger; selectedId intentionally excluded — use ref instead

  const { isLoading: convLoading } = usePolling(fetchConversations, [fetchConversations], { interval: CONV_POLL_MS })

  const msgPollEnabled = !!selectedId && (import.meta.env.PROD || POLL_IN_DEV)
  usePolling(fetchMessages, [fetchMessages], { interval: MSG_POLL_MS, enabled: msgPollEnabled })

  const groupPollEnabled = !!groupServiceId && (import.meta.env.PROD || POLL_IN_DEV)
  usePolling(fetchGroupMessages, [fetchGroupMessages], { interval: MSG_POLL_MS, enabled: groupPollEnabled })

  // ── 1-1 WebSocket ─────────────────────────────────────────────────────────
  const wsUrl = useMemo(() => (selectedId ? buildChatWsUrl(selectedId) : ''), [selectedId])
  const handleWsMessage = useCallback((msg: ApiChatMessage) => {
    if (!msg?.id) return
    if ((msg.handshake_id ?? msg.handshake) !== selectedId) return
    setMessages((prev) => mergeMessages(prev, [msg]))
  }, [selectedId])

  const { isConnected: wsConnected, sendMessage: wsSend } = useWebSocket({
    url: wsUrl,
    onMessage: handleWsMessage,
    enabled: !!selectedId && isAuthenticated,
  })

  // ── Group WebSocket ────────────────────────────────────────────────────────
  const groupWsUrl = useMemo(
    () => (groupServiceId ? buildGroupChatWsUrl(groupServiceId) : ''),
    [groupServiceId],
  )
  const handleGroupWsMessage = useCallback((msg: GroupChatMessage) => {
    if (!msg?.id) return
    setGroupMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [])

  const { isConnected: groupWsConnected, sendMessage: groupWsSend } = useWebSocket({
    url: groupWsUrl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMessage: handleGroupWsMessage as any,
    enabled: !!groupServiceId && isAuthenticated,
  })

  const selectConversation = useCallback((id: string) => {
    setSelectedId(id)
    setGroupServiceId(null)
    setGroupMessages([])
    setMobileShowThread(true)
    setDraft('')
    navigate(`/messages/${id}`, { replace: true })
  }, [navigate])

  const selectGroupChat = useCallback((serviceId: string) => {
    setGroupServiceId(serviceId)
    setSelectedId(null)
    setGroupMessages([])
    setMobileShowThread(true)
    setDraft('')
    navigate('/messages', { replace: true })
  }, [navigate])

  const handleSend = useCallback(async () => {
    if (!draft.trim() || isSending) return
    const body = draft.trim()
    setDraft('')
    setSendError(null)
    setIsSending(true)
    try {
      if (groupServiceId) {
        // Group chat send
        const sent = groupWsConnected ? groupWsSend(body) : false
        if (!sent) {
          const msg = await groupChatAPI.sendMessage(groupServiceId, body)
          setGroupMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
        }
      } else if (selectedId) {
        // 1-1 chat send
        const sent = wsConnected ? wsSend(body) : false
        if (!sent) {
          const msg = await conversationAPI.sendMessage(selectedId, body)
          setMessages((prev) => mergeMessages(prev, [msg]))
        }
      }
    } catch {
      setSendError('Failed to send. Please try again.')
      setDraft(body)
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }, [selectedId, groupServiceId, draft, isSending, wsConnected, wsSend, groupWsConnected, groupWsSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  const handleInitiate = useCallback(async (payload: InitiatePayload) => {
    if (!selectedId) return
    await handshakeAPI.initiate(selectedId, payload)
    toast.success('Session details sent!')
    refreshConversations()
  }, [selectedId, refreshConversations])

  const handleApprove = useCallback(async () => {
    if (!selectedId || isApproving) return
    setIsApproving(true)
    try {
      await handshakeAPI.approve(selectedId)
      toast.success('Session approved! Handshake is now accepted.')
      setShowApproveModal(false)
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      toast.error(err?.response?.data?.detail ?? err?.message ?? 'Failed to approve.')
    } finally {
      setIsApproving(false)
    }
  }, [selectedId, isApproving, refreshConversations])

  const handleDecline = useCallback(async () => {
    if (!selectedId || isDeclining) return
    setIsDeclining(true)
    try {
      await handshakeAPI.requestChanges(selectedId)
      toast.success('Session details declined. The owner can propose new session details.')
      setShowApproveModal(false)
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      toast.error(err?.response?.data?.detail ?? 'Failed to decline.')
    } finally {
      setIsDeclining(false)
    }
  }, [selectedId, isDeclining, refreshConversations])

  const handleConfirm = useCallback(async () => {
    if (!selectedId) return
    await handshakeAPI.confirm(selectedId)
    toast.success('Service completion confirmed!')
    refreshConversations()
  }, [selectedId, refreshConversations])

  const handleCancel = useCallback(async () => {
    if (!selectedId || isCancelling) return
    setIsCancelling(true)
    try {
      await handshakeAPI.cancel(selectedId)
      toast.success('Handshake cancelled.')
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err?.response?.data?.detail ?? ''
      if (detail.toLowerCase().includes('only the service provider')) {
        toast.error('Only the service provider can cancel this handshake.')
      } else if (detail.toLowerCase().includes('cancellation request')) {
        toast.error('Accepted handshakes now require a cancellation request.')
      } else if (detail.toLowerCase().includes('only cancel accepted') || detail.toLowerCase().includes('can only cancel')) {
        toast.error('Only accepted handshakes can be cancelled.')
      } else {
        toast.error(detail || 'Failed to cancel.')
      }
    } finally {
      setIsCancelling(false)
    }
  }, [selectedId, isCancelling, refreshConversations])

  const handleRequestCancellation = useCallback(async () => {
    if (!selectedId || isRequestingCancellation) return

    const reason = window.prompt(
      'Optional: why do you want to cancel this handshake?',
      'Something changed and I would like to cancel this handshake.',
    )
    if (reason === null) return

    setIsRequestingCancellation(true)
    try {
      await handshakeAPI.requestCancellation(selectedId, reason.trim() || undefined)
      toast.success('Cancellation request sent.')
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      toast.error(err?.response?.data?.detail ?? err?.message ?? 'Failed to request cancellation.')
    } finally {
      setIsRequestingCancellation(false)
    }
  }, [isRequestingCancellation, refreshConversations, selectedId])

  const handleApproveCancellation = useCallback(async () => {
    if (!selectedId || isApprovingCancellation) return
    setIsApprovingCancellation(true)
    try {
      await handshakeAPI.approveCancellation(selectedId)
      toast.success('Handshake cancelled and reserved hours refunded.')
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      toast.error(err?.response?.data?.detail ?? err?.message ?? 'Failed to approve cancellation.')
    } finally {
      setIsApprovingCancellation(false)
    }
  }, [isApprovingCancellation, refreshConversations, selectedId])

  const handleRejectCancellation = useCallback(async () => {
    if (!selectedId || isRejectingCancellation) return
    setIsRejectingCancellation(true)
    try {
      await handshakeAPI.rejectCancellation(selectedId)
      toast.success('Cancellation request declined. The handshake remains active.')
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      toast.error(err?.response?.data?.detail ?? err?.message ?? 'Failed to keep handshake active.')
    } finally {
      setIsRejectingCancellation(false)
    }
  }, [isRejectingCancellation, refreshConversations, selectedId])

  const handleReportNoShow = useCallback(async () => {
    if (!selectedId || isReportingNoShow) return

    const description = window.prompt(
      'Describe the no-show briefly (optional):',
      'The other participant did not show up at the agreed time.',
    )
    if (description === null) return

    setIsReportingNoShow(true)
    try {
      await handshakeAPI.report(selectedId, 'no_show', description.trim() || 'No-show reported by participant')
      toast.success('No-show report submitted for admin review.')
      refreshConversations()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      toast.error(err?.response?.data?.detail ?? err?.message ?? 'Failed to submit no-show report.')
    } finally {
      setIsReportingNoShow(false)
    }
  }, [isReportingNoShow, refreshConversations, selectedId])

  const showConvList = !mobileShowThread
  const showThread   = mobileShowThread || !!selectedId

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflow="hidden" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box
        maxW="1440px" mx="auto"
        h={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        borderRadius={{ base: 0, md: '20px' }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        display="flex"
        overflow="hidden"
      >
        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <Box
          w={{ base: '100%', md: '290px', lg: '310px' }}
          flexShrink={0}
          display={{ base: showConvList ? 'flex' : 'none', md: 'flex' }}
          flexDirection="column"
          h="100%"
          overflow="hidden"
          borderRight={`1px solid ${GRAY200}`}
          bg={WHITE}
        >
          <Box px={5} py={4} borderBottom={`1px solid ${GRAY100}`}>
            <Text fontSize="17px" fontWeight={700} color={GRAY800}>Messages</Text>
            <Text fontSize="12px" color={GRAY400} mt="2px">
              {conversations.filter((c) => ACTIVE_STATUSES.has(c.status)).length} active conversation{conversations.filter((c) => ACTIVE_STATUSES.has(c.status)).length !== 1 ? 's' : ''}
            </Text>
          </Box>

          <ConversationSidebar
            conversations={conversations}
            selectedId={selectedId}
            selectedGroupServiceId={groupServiceId}
            onSelect={selectConversation}
            onSelectGroup={selectGroupChat}
            isLoading={convLoading}
          />
        </Box>

        {/* ── Right thread ──────────────────────────────────────────────────── */}
        <Box
          flex={1}
          display={{ base: showThread ? 'flex' : 'none', md: 'flex' }}
          flexDirection="column"
          h="100%"
          overflow="hidden"
          minW={0}
          bg={GRAY50}
        >
          {groupServiceId ? (
            /* ── Group Chat Thread ─────────────────────────────────────────── */
            <GroupChatThread
              serviceId={groupServiceId}
              serviceTitle={groupServiceTitle}
              participants={groupParticipants}
              messages={groupMessages}
              user={user}
              wsConnected={groupWsConnected}
              draft={draft}
              setDraft={setDraft}
              isSending={isSending}
              sendError={sendError}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              bottomRef={bottomRef}
              onBack={() => { setMobileShowThread(false); navigate('/messages', { replace: true }) }}
            />
          ) : !selectedId || !selectedConv ? (
            <EmptyThread />
          ) : (
            <>
              {/* Thread Header */}
              <Box px={5} py="12px" bg={WHITE} borderBottom={`1px solid ${GRAY200}`}>
                <Flex align="center" gap={3}>
                  <Box
                    as="button"
                    display={{ base: 'flex', md: 'none' }}
                    alignItems="center" color={GRAY500} fontSize="18px"
                    onClick={() => { setMobileShowThread(false); navigate('/messages', { replace: true }) }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}
                  >
                    <FiArrowLeft />
                  </Box>

                  <Avatar name={selectedConv.other_user.name} url={selectedConv.other_user.avatar_url} size={38} />

                  <Box flex={1} minW={0}>
                    <Flex align="center" gap={2} flexWrap="wrap">
                      <Text fontSize="14px" fontWeight={700} color={GRAY800}>
                        {selectedConv.other_user.name}
                      </Text>
                      {/* Service type pill */}
                      <Box
                        px="7px" py="1px" borderRadius="full" fontSize="10px" fontWeight={700}
                        bg={selectedConv.service_type?.toLowerCase() === 'offer' ? '#FEF3C7' : '#F3E8FF'}
                        color={selectedConv.service_type?.toLowerCase() === 'offer' ? '#92400E' : '#6B21A8'}
                      >
                        {selectedConv.service_type?.toLowerCase() === 'offer' ? 'Offer' : 'Want'}
                      </Box>
                    </Flex>
                    {/* Clickable service title */}
                    <Flex
                      as="button"
                      align="center" gap={1}
                      onClick={() => window.open(`/service-detail/${selectedConv.service_id}`, '_blank')}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      _hover={{ opacity: 0.75 }}
                    >
                      <Text
                        fontSize="12px" color={GREEN} fontWeight={500}
                        style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: 'underline', textUnderlineOffset: '2px',
                        }}
                      >
                        {selectedConv.service_title}
                      </Text>
                      <Box color={GREEN} fontSize="11px" flexShrink={0}><FiChevronRight /></Box>
                    </Flex>
                  </Box>

                  {!wsConnected && (
                    <Box color={GRAY400} fontSize="14px" title="Polling fallback (WebSocket disconnected)">
                      <FiWifiOff />
                    </Box>
                  )}
                </Flex>
              </Box>

              {/* Step bar */}
              <HsStepBar conv={selectedConv} />

              {/* Action card */}
              <ActionCard
                conv={selectedConv}
                onInitiate={() => setShowInitiateModal(true)}
                onShowApprove={() => setShowApproveModal(true)}
                onConfirm={() => setShowConfirmModal(true)}
                onCancel={handleCancel}
                isCancelling={isCancelling}
                onRequestCancellation={handleRequestCancellation}
                onApproveCancellation={handleApproveCancellation}
                onRejectCancellation={handleRejectCancellation}
                isRequestingCancellation={isRequestingCancellation}
                isApprovingCancellation={isApprovingCancellation}
                isRejectingCancellation={isRejectingCancellation}
                onOpenEvaluation={() => setShowEvaluationModal(true)}
                onReportNoShow={handleReportNoShow}
                isReportingNoShow={isReportingNoShow}
              />

              {/* Messages */}
              <Box flex={1} overflowY="auto" py={3}>
                {messages.length === 0 ? (
                  <Flex align="center" justify="center" h="100%">
                    <Text fontSize="13px" color={GRAY400}>No messages yet. Say hello! 👋</Text>
                  </Flex>
                ) : (
                  <Stack gap={1}>
                    {messages.map((msg) => (
                      <MsgBubble
                        key={msg.id} msg={msg}
                        isMine={msg.sender_id === user?.id || msg.sender === user?.id}
                      />
                    ))}
                    <div ref={bottomRef} />
                  </Stack>
                )}
              </Box>

              {sendError && (
                <Box px={4} py={2} bg={RED_LT}>
                  <Text fontSize="12px" color={RED}>{sendError}</Text>
                </Box>
              )}

              {/* Input */}
              <Box px={4} py={3} bg={WHITE} borderTop={`1px solid ${GRAY200}`}>
                <Flex align="flex-end" gap={2}>
                  <Box
                    flex={1} border={`1.5px solid ${GRAY200}`} borderRadius="16px"
                    overflow="hidden" bg={GRAY50}
                    _focusWithin={{ borderColor: GREEN, bg: WHITE }}
                    transition="all 0.15s"
                  >
                    <textarea
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Write a message…"
                      rows={1}
                      style={{
                        width: '100%', padding: '10px 14px',
                        background: 'transparent', border: 'none', outline: 'none',
                        resize: 'none', fontSize: '14px', color: GRAY800,
                        fontFamily: 'inherit', lineHeight: '1.5',
                        maxHeight: '120px', overflowY: 'auto',
                      }}
                      onInput={(e) => {
                        const el = e.currentTarget
                        el.style.height = 'auto'
                        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
                      }}
                    />
                  </Box>

                  <Box
                    as="button"
                    w="42px" h="42px" borderRadius="12px"
                    display="flex" alignItems="center" justifyContent="center"
                    flexShrink={0}
                    bg={draft.trim() ? GREEN : GRAY200}
                    color={draft.trim() ? WHITE : GRAY400}
                    fontSize="16px"
                    onClick={handleSend}
                    style={{
                      border: 'none',
                      cursor: draft.trim() && !isSending ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                      opacity: !draft.trim() || isSending ? 0.5 : 1,
                    }}
                  >
                    {isSending ? <Spinner size="xs" color={WHITE} /> : <FiSend />}
                  </Box>
                </Flex>
                <Text fontSize="10px" color={GRAY400} mt="4px" textAlign="right">
                  Enter to send · Shift+Enter for new line
                </Text>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Modals */}
      <HandshakeDetailsModal
        isOpen={showInitiateModal}
        onClose={() => setShowInitiateModal(false)}
        onSubmit={handleInitiate}
        serviceType={selectedConv?.service_type}
        scheduledTime={selectedConv?.scheduled_time}
        serviceDuration={selectedConv?.provisioned_hours ?? undefined}
        presetDetails={selectedConv && isFixedGroupOffer(selectedConv) && selectedConv.service_scheduled_time && selectedConv.service_location_area
          ? {
              exactLocation: selectedConv.service_location_area,
              exactDuration: selectedConv.provisioned_hours ?? 0,
              scheduledTime: selectedConv.service_scheduled_time,
            }
          : null}
      />
      {selectedConv?.provider_initiated && (
        <ProviderDetailsModal
          isOpen={showApproveModal}
          onClose={() => setShowApproveModal(false)}
          exactLocation={selectedConv.exact_location ?? ''}
          exactDuration={selectedConv.exact_duration ?? 1}
          scheduledTime={selectedConv.scheduled_time ?? ''}
          onApprove={handleApprove}
          onDecline={handleDecline}
          approving={isApproving}
          declining={isDeclining}
        />
      )}
      {selectedConv && (
        <ServiceConfirmationModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirm}
          provisioned_hours={selectedConv.provisioned_hours ?? undefined}
          other_user_name={selectedConv.other_user.name}
        />
      )}
      {selectedConv && selectedId && (
        <ServiceEvaluationModal
          isOpen={showEvaluationModal}
          onClose={() => setShowEvaluationModal(false)}
          handshakeId={selectedId}
          counterpartName={selectedConv.other_user.name}
          alreadyReviewed={selectedConv.user_has_reviewed}
          onSubmitted={async () => {
            refreshConversations()
          }}
        />
      )}
    </Box>
  )
}
