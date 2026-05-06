import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Box, Flex, Grid, Spinner, Text } from '@chakra-ui/react'
import {
  FiArrowLeft, FiArrowRight, FiClock, FiDownload, FiRefreshCw,
  FiRepeat, FiTrendingDown, FiTrendingUp, FiUser, FiZap,
} from 'react-icons/fi'
import { transactionAPI, type TransactionDirection } from '@/services/transactionAPI'
import { handshakeAPI, type Handshake } from '@/services/handshakeAPI'
import { userAPI, type UserHistoryItem } from '@/services/userAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Transaction, TransactionSummary, User } from '@/types'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'
import {
  AMBER, AMBER_LT, BLUE, BLUE_LT, GRAY100, GRAY200, GRAY400,
  GRAY50, GRAY500, GRAY600, GRAY700, GRAY800, GRAY900, GREEN, GREEN_LT,
  PURPLE, PURPLE_LT, RED, RED_LT, WHITE,
} from '@/theme/tokens'

const PAGE_SIZE = 20

const EMPTY_SUMMARY: TransactionSummary = {
  current_balance: 0,
  total_earned: 0,
  total_spent: 0,
}

const FILTERS: { key: TransactionDirection; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'credit', label: 'Earned' },
  { key: 'debit', label: 'Used' },
]

const ACTIVE_HANDSHAKE_STATUSES = new Set(['accepted', 'checked_in', 'attended'])
const INSIGHT_SERVICE_TYPES = ['Offer', 'Need', 'Event'] as const

interface ExpectedAgreement {
  id: string
  service_id?: string | null
  service_title: string
  service_type?: Handshake['service_type']
  is_current_user_provider: boolean
  counterpart_id?: string | null
  counterpart_name: string
  counterpart_email: string
  counterpart_avatar_url?: string | null
  status: Handshake['status']
  provisioned_hours: number
  reserved_delta: number
  expected_delta: number
  note: string
}

type EventHistoryItem = UserHistoryItem & {
  event_status: 'completed' | 'attended'
}

interface GroupedTransactionRow {
  key: string
  serviceId?: string | null
  primary: Transaction
  items: Transaction[]
  amount: number
  balanceAfter: number
  createdAt: string
  counterpartLabel: string
  counterpartId?: string | null
  counterpartAvatarUrl?: string | null
  description: string
  isMultiUse: boolean
}

function formatHours(value: number): string {
  const absolute = Math.abs(value)
  const formatted = Number.isInteger(absolute) ? absolute.toString() : absolute.toFixed(2).replace(/\.?0+$/, '')
  return `${formatted}h`
}

function formatAmount(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatHours(value)}`
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function startOfLocalDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function counterpartName(transaction: Transaction, currentUserId?: string): string {
  const counterpart = transaction.counterpart
  if (!counterpart && isServiceLevelNeedTransaction(transaction)) return 'You'
  if (!counterpart) return 'TimeBank'
  if (currentUserId && counterpart.id === currentUserId) return 'You'

  const fullName = `${counterpart.first_name ?? ''} ${counterpart.last_name ?? ''}`.trim()
  return fullName || counterpart.email || 'Unknown user'
}

function counterpartSubtitle(transaction: Transaction, currentUserId?: string): string {
  if (transaction.counterpart?.id && currentUserId && transaction.counterpart.id === currentUserId) {
    if (transaction.service_type === 'Need' && transaction.transaction_type === 'provision') return 'Your need reserved time'
    if (transaction.service_type === 'Need' && transaction.transaction_type === 'refund') return 'Your need time returned'
    return transaction.counterpart.email
  }
  if (transaction.counterpart?.email) return transaction.counterpart.email
  if (transaction.service_type === 'Need' && transaction.transaction_type === 'provision') return 'Your need'
  if (transaction.service_type === 'Need' && transaction.transaction_type === 'refund') return 'Cancelled need'
  return 'Time activity entry'
}

function isServiceLevelNeedTransaction(transaction: Transaction): boolean {
  return transaction.service_type === 'Need' && !transaction.handshake_id
}

function isCompletedTransactionContext(transaction: Transaction): boolean {
  return transaction.handshake_status === 'completed' || transaction.service_status === 'Completed'
}

function isOpenServiceLevelReservation(transaction: Transaction): boolean {
  if (!isServiceLevelNeedTransaction(transaction)) return false

  const serviceStatus = transaction.service_status?.toLowerCase()
  if (!serviceStatus) return true

  return !['completed', 'cancelled', 'canceled', 'deleted'].includes(serviceStatus)
}

function transactionActionTitle(transaction: Transaction): string {
  if (isCompletedTransactionContext(transaction) && transaction.transaction_type === 'provision') {
    return transaction.amount < 0 ? 'Time used' : 'Time completed'
  }

  if (isServiceLevelNeedTransaction(transaction)) {
    if (transaction.transaction_type === 'provision') return 'Reserved for need'
    if (transaction.transaction_type === 'refund') return 'Reservation returned'
  }

  if (transaction.transaction_type === 'transfer') {
    return transaction.amount >= 0 ? 'Time earned' : 'Time used'
  }
  if (transaction.transaction_type === 'provision') return 'Time reserved'
  if (transaction.transaction_type === 'refund') return 'Time returned'
  if (transaction.transaction_type === 'adjustment') return 'Balance adjusted'
  return transaction.transaction_type_display
}

function transactionFriendlyDescription(transaction: Transaction): string {
  const serviceTitle = transaction.service_title ?? 'this activity'
  const hours = formatHours(Math.abs(transaction.amount))

  if (isCompletedTransactionContext(transaction) && transaction.transaction_type === 'provision') {
    return transaction.amount < 0
      ? `${hours} used for a completed exchange.`
      : `${hours} completed for "${serviceTitle}".`
  }

  if (isServiceLevelNeedTransaction(transaction)) {
    if (transaction.transaction_type === 'provision') {
      return `${hours} set aside for your need.`
    }
    if (transaction.transaction_type === 'refund') {
      return `${hours} returned after the need was cancelled.`
    }
  }

  if (transaction.transaction_type === 'transfer') {
    return transaction.amount >= 0
      ? `${hours} earned from a completed exchange.`
      : `${hours} used for a completed exchange.`
  }
  if (transaction.transaction_type === 'provision') return `${hours} reserved for "${serviceTitle}".`
  if (transaction.transaction_type === 'refund') return `${hours} returned to your available time.`

  return transaction.description.replace(/\s+/g, ' ').trim()
}

function isMultiUseHandshake(handshake: Handshake) {
  return handshake.schedule_type === 'One-Time' && (handshake.max_participants ?? 0) > 1
}

function isMultiUseTransaction(transaction: Transaction, completedCount: number) {
  return (
    transaction.transaction_type === 'transfer'
    && transaction.is_current_user_provider === true
    && transaction.schedule_type === 'One-Time'
    && (transaction.max_participants ?? 0) > 1
    && completedCount > 1
  )
}

function handshakeCounterpartName(handshake: Handshake, currentUserName?: string): string {
  const counterpart = handshake.counterpart
  const fullName = counterpart
    ? `${counterpart.first_name ?? ''} ${counterpart.last_name ?? ''}`.trim()
    : ''

  if (fullName && fullName !== currentUserName) return fullName
  if (counterpart?.email) return counterpart.email
  if (handshake.provider_name && handshake.provider_name !== currentUserName) return handshake.provider_name
  if (handshake.requester_name && handshake.requester_name !== currentUserName) return handshake.requester_name
  return 'Unknown user'
}

function activeHandshakeLabel(status: Handshake['status']): string {
  if (status === 'checked_in') return 'Checked In'
  if (status === 'attended') return 'Attended'
  return 'Session Confirmed'
}

function handshakeRequesterId(requester: Handshake['requester']): string {
  return typeof requester === 'object' && requester !== null
    ? String(requester.id ?? '')
    : String(requester ?? '')
}

function toExpectedAgreement(handshake: Handshake, currentUser?: User | null): ExpectedAgreement | null {
  const hours = Number(handshake.provisioned_hours ?? 0)
  const isEvent = handshake.service_type === 'Event'
  if (hours <= 0 && !isEvent) return null

  const currentUserName = currentUser
    ? `${currentUser.first_name ?? ''} ${currentUser.last_name ?? ''}`.trim()
    : undefined
  const counterpartName = handshakeCounterpartName(handshake, currentUserName)
  const counterpartEmail = handshake.counterpart?.email ?? ''
  const requesterId = handshakeRequesterId(handshake.requester)
  const isProvider = isEvent
    ? requesterId !== String(currentUser?.id ?? '')
    : handshake.is_current_user_provider === true
  const expectedDelta = isProvider ? hours : 0
  const reservedDelta = isProvider ? 0 : -hours

  return {
    id: handshake.id,
    service_id: handshake.service_id ?? null,
    service_title: handshake.service_title,
    service_type: handshake.service_type,
    is_current_user_provider: isProvider,
    counterpart_id: handshake.counterpart?.id ?? null,
    counterpart_name: counterpartName,
    counterpart_email: counterpartEmail,
    counterpart_avatar_url: handshake.counterpart?.avatar_url ?? null,
    status: handshake.status,
    provisioned_hours: hours,
    reserved_delta: reservedDelta,
    expected_delta: expectedDelta,
    note: isEvent
      ? 'Event session'
      : isProvider
      ? `Time expected after completion`
      : `Already reserved at acceptance`,
  }
}

function amountTone(value: number) {
  return value >= 0
    ? { color: GREEN, bg: GREEN_LT }
    : { color: AMBER, bg: AMBER_LT }
}

function roleAccent(isCurrentUserProvider: boolean) {
  return isCurrentUserProvider
    ? { icon: FiTrendingUp, color: GREEN, bg: GREEN_LT, label: 'Provider' }
    : { icon: FiTrendingDown, color: AMBER, bg: AMBER_LT, label: 'Receiver' }
}

function agreementRoleLabel(agreement: ExpectedAgreement) {
  if (agreement.service_type === 'Event') {
    return agreement.is_current_user_provider ? 'Organizer' : 'Attendee'
  }
  return roleAccent(agreement.is_current_user_provider).label
}

function isOwnService(serviceType?: Handshake['service_type'] | null, isCurrentUserProvider?: boolean) {
  if (serviceType === 'Need') return isCurrentUserProvider === false
  if (serviceType === 'Offer' || serviceType === 'Event') return isCurrentUserProvider === true
  return false
}

function serviceOwnershipLabel(serviceType?: Handshake['service_type'] | null, isCurrentUserProvider?: boolean) {
  return isOwnService(serviceType, isCurrentUserProvider) ? 'Own listing' : 'Other member'
}

function serviceTypeLabel(serviceType?: Handshake['service_type'] | null) {
  if (serviceType === 'Offer') return 'Offer'
  if (serviceType === 'Need') return 'Need'
  if (serviceType === 'Event') return 'Event'
  return 'Activity'
}

function typeBadgeTone(serviceType?: Handshake['service_type'] | null) {
  if (serviceType === 'Offer') return { color: GREEN, bg: GREEN_LT }
  if (serviceType === 'Need') return { color: BLUE, bg: BLUE_LT }
  if (serviceType === 'Event') return { color: AMBER, bg: AMBER_LT }
  return { color: GRAY600, bg: GRAY100 }
}

function transactionAccent(transaction: Transaction) {
  const roleBasedAccent = roleAccent(transaction.is_current_user_provider === true)
  const isCompletedContext = isCompletedTransactionContext(transaction)

  switch (transaction.transaction_type) {
    case 'transfer':
      return { ...roleBasedAccent, stateLabel: 'Completed' }
    case 'refund':
      return { icon: FiRepeat, color: PURPLE, bg: PURPLE_LT, stateLabel: 'Refunded' }
    case 'provision':
      if (isCompletedContext) return { ...roleBasedAccent, stateLabel: 'Completed' }
      return { ...roleBasedAccent, stateLabel: 'Reserved' }
    case 'adjustment':
      return { icon: FiZap, color: GRAY600, bg: GRAY100, stateLabel: 'Adjusted' }
    default:
      return transaction.amount >= 0
        ? { ...roleBasedAccent, stateLabel: 'Earned' }
        : { ...roleBasedAccent, stateLabel: 'Used' }
  }
}

function EmptyLedgerIllustration() {
  return (
    <Flex direction="column" align="center" justify="center" py={{ base: 16, md: 24 }} px={6} textAlign="center">
      <Box position="relative" w="120px" h="120px" mb={6}>
        <Box position="absolute" inset="0" borderRadius="full" bg={PURPLE_LT} />
        <Box position="absolute" top="14px" left="14px" right="14px" bottom="14px" borderRadius="full" bg={WHITE} border={`1px solid ${GRAY200}`} />
        <Flex position="absolute" inset="0" align="center" justify="center">
          <Box p="14px" borderRadius="18px" bg={GREEN_LT} color={GREEN}>
            <FiClock size={30} />
          </Box>
        </Flex>
        <Box position="absolute" top="8px" right="4px" px="8px" py="4px" borderRadius="999px" bg={AMBER_LT} color={AMBER} fontSize="11px" fontWeight={700}>
          +0h
        </Box>
        <Box position="absolute" bottom="10px" left="0" px="8px" py="4px" borderRadius="999px" bg={BLUE_LT} color={BLUE} fontSize="11px" fontWeight={700}>
          Your Time
        </Box>
      </Box>
      <Text fontSize="18px" fontWeight={800} color={GRAY800} mb={2}>
        No time activity yet
      </Text>
      <Text maxW="420px" fontSize="14px" color={GRAY500}>
        Your time activity will appear here once you start completing exchanges with other members.
      </Text>
    </Flex>
  )
}

const TransactionHistoryPage = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const requestIdRef = useRef(0)
  const agreementRequestIdRef = useRef(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [insightTransactions, setInsightTransactions] = useState<Transaction[]>([])
  const [eventHistory, setEventHistory] = useState<EventHistoryItem[]>([])
  const [handshakes, setHandshakes] = useState<Handshake[]>([])
  const [activeAgreements, setActiveAgreements] = useState<ExpectedAgreement[]>([])
  const [summary, setSummary] = useState<TransactionSummary>(EMPTY_SUMMARY)
  const [direction, setDirection] = useState<TransactionDirection>('all')
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTransactionGroup, setSelectedTransactionGroup] = useState<GroupedTransactionRow | null>(null)
  const [showActiveAgreements, setShowActiveAgreements] = useState(false)
  const [openActiveAgreementSections, setOpenActiveAgreementSections] = useState<Record<string, boolean>>({})

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / PAGE_SIZE)), [count])
  const exportDisabled = isLoading || isExporting || transactions.length === 0
  const previousDisabled = page === 1
  const nextDisabled = page >= totalPages
  const openServiceDetail = useCallback((serviceId?: string | null) => {
    if (!serviceId) return
    navigate(`/service-detail/${serviceId}`)
  }, [navigate])
  const openPublicProfile = useCallback((userId?: string | null) => {
    if (!userId || userId === user?.id) return
    navigate(`/public-profile/${userId}`)
  }, [navigate, user?.id])
  const toggleActiveAgreementSection = useCallback((sectionType: string) => {
    setOpenActiveAgreementSections((prev) => ({
      ...prev,
      [sectionType]: !prev[sectionType],
    }))
  }, [])
  const activeAgreementDelta = useMemo(
    () => activeAgreements.reduce(
      (sum, item) => sum + (item.expected_delta !== 0 ? item.expected_delta : item.reserved_delta),
      0,
    ),
    [activeAgreements],
  )
  const completedMultiUseByService = useMemo(() => {
    const map = new Map<string, Handshake[]>()

    for (const handshake of handshakes) {
      if (
        handshake.status !== 'completed'
        || handshake.is_current_user_provider !== true
        || !handshake.service_id
        || !isMultiUseHandshake(handshake)
      ) {
        continue
      }

      const current = map.get(handshake.service_id) ?? []
      current.push(handshake)
      map.set(handshake.service_id, current)
    }

    return map
  }, [handshakes])
  const activeAgreementServiceIds = useMemo(
    () => new Set(activeAgreements.map((item) => item.service_id).filter(Boolean)),
    [activeAgreements],
  )
  const insightStats = useMemo(() => {
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const dailyMap = new Map<string, number>()
    const serviceTypeCounts: Record<(typeof INSIGHT_SERVICE_TYPES)[number], number> = { Offer: 0, Need: 0, Event: 0 }
    const serviceReservationByService = new Map<string, number>()
    let lastSevenDayHours = 0
    let monthActivityCount = 0

    for (const transaction of insightTransactions) {
      const createdAt = new Date(transaction.created_at)
      if (Number.isNaN(createdAt.getTime())) continue

      const dayKey = startOfLocalDay(createdAt)
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + 1)

      if (createdAt >= sevenDaysAgo) {
        lastSevenDayHours += Math.abs(transaction.amount)
      }
      if (createdAt >= monthStart) {
        monthActivityCount += 1
      }

      if (transaction.service_type === 'Offer') serviceTypeCounts.Offer += 1
      if (transaction.service_type === 'Need') serviceTypeCounts.Need += 1
      if (transaction.service_type === 'Event') serviceTypeCounts.Event += 1

      if (
        isOpenServiceLevelReservation(transaction)
        && transaction.service_id
        && !activeAgreementServiceIds.has(transaction.service_id)
      ) {
        const current = serviceReservationByService.get(transaction.service_id) ?? 0
        serviceReservationByService.set(transaction.service_id, current + transaction.amount)
      }
    }

    for (const event of eventHistory) {
      const completedAt = new Date(event.completed_date)
      if (Number.isNaN(completedAt.getTime())) continue

      const dayKey = startOfLocalDay(completedAt)
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + 1)
      serviceTypeCounts.Event += 1

      if (completedAt >= monthStart) {
        monthActivityCount += 1
      }
    }

    const calendarDays = Array.from({ length: 28 }, (_, index) => {
      const date = new Date(now)
      date.setDate(now.getDate() - (27 - index))
      const key = startOfLocalDay(date)
      return { key, count: dailyMap.get(key) ?? 0 }
    })

    const serviceReservationNet = Array.from(serviceReservationByService.values())
      .reduce((sum, amount) => sum + amount, 0)
    const acceptedReservation = activeAgreements.reduce(
      (sum, agreement) => sum + Math.abs(Math.min(agreement.reserved_delta, 0)),
      0,
    )
    const recentCompleted = insightTransactions
      .filter((transaction) => transaction.transaction_type === 'transfer')
      .slice(0, 3)

    return {
      calendarDays,
      lastSevenDayHours,
      monthActivityCount,
      serviceTypeCounts,
      reservedNow: acceptedReservation + Math.abs(Math.min(serviceReservationNet, 0)),
      receivedHours: summary.total_earned,
      sharedHours: Math.abs(summary.total_spent),
      recentCompleted,
    }
  }, [activeAgreementServiceIds, activeAgreements, eventHistory, insightTransactions, summary.total_earned, summary.total_spent])
  const timeFlowTotal = Math.max(1, insightStats.receivedHours + insightStats.sharedHours)
  const receivedShare = Math.round((insightStats.receivedHours / timeFlowTotal) * 100)
  const sharedShare = Math.round((insightStats.sharedHours / timeFlowTotal) * 100)

  const activityMix = useMemo(() => {
    type TypeBucket = {
      count: number
      hours: number
      earnedHours: number
      usedHours: number
      lastDate: Date | null
    }
    const buckets: Record<(typeof INSIGHT_SERVICE_TYPES)[number], TypeBucket> = {
      Offer: { count: 0, hours: 0, earnedHours: 0, usedHours: 0, lastDate: null },
      Need: { count: 0, hours: 0, earnedHours: 0, usedHours: 0, lastDate: null },
      Event: { count: 0, hours: 0, earnedHours: 0, usedHours: 0, lastDate: null },
    }

    const bumpDate = (bucket: TypeBucket, date: Date) => {
      if (Number.isNaN(date.getTime())) return
      if (!bucket.lastDate || date > bucket.lastDate) bucket.lastDate = date
    }

    for (const transaction of insightTransactions) {
      const type = transaction.service_type
      if (type !== 'Offer' && type !== 'Need' && type !== 'Event') continue
      const bucket = buckets[type]
      bucket.count += 1
      const amount = transaction.amount
      bucket.hours += Math.abs(amount)
      if (amount >= 0) bucket.earnedHours += amount
      else bucket.usedHours += Math.abs(amount)
      bumpDate(bucket, new Date(transaction.created_at))
    }
    for (const event of eventHistory) {
      const bucket = buckets.Event
      bucket.count += 1
      const duration = Math.abs(Number(event.duration) || 0)
      bucket.hours += duration
      bumpDate(bucket, new Date(event.completed_date))
    }

    const totalCount = INSIGHT_SERVICE_TYPES.reduce((sum, key) => sum + buckets[key].count, 0)
    return { buckets, totalCount }
  }, [eventHistory, insightTransactions])

  const topPartner = useMemo(() => {
    type Bucket = { id: string; name: string; avatar_url?: string | null; count: number; hours: number }
    const map = new Map<string, Bucket>()

    const bump = (
      id: string | undefined,
      name: string | undefined,
      avatar: string | undefined | null,
      hours: number,
    ) => {
      if (!id || !name || (user?.id && id === user.id)) return
      const prev = map.get(id) ?? { id, name, avatar_url: avatar, count: 0, hours: 0 }
      prev.count += 1
      prev.hours += hours
      if (avatar && !prev.avatar_url) prev.avatar_url = avatar
      map.set(id, prev)
    }

    for (const transaction of insightTransactions) {
      const cp = transaction.counterpart
      if (!cp) continue
      const fullName = `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || cp.email
      bump(cp.id, fullName, cp.avatar_url, Math.abs(transaction.amount))
    }
    for (const agreement of activeAgreements) {
      bump(
        agreement.counterpart_id ?? undefined,
        agreement.counterpart_name,
        agreement.counterpart_avatar_url,
        Math.abs(agreement.expected_delta || agreement.reserved_delta || 0),
      )
    }

    let best: Bucket | null = null
    for (const bucket of map.values()) {
      if (!best || bucket.count > best.count || (bucket.count === best.count && bucket.hours > best.hours)) {
        best = bucket
      }
    }
    return best
  }, [activeAgreements, insightTransactions, user?.id])

  const activeAgreementByServiceId = useMemo(() => {
    const map = new Map<string, ExpectedAgreement>()
    for (const agreement of activeAgreements) {
      if (agreement.service_id && !map.has(agreement.service_id)) {
        map.set(agreement.service_id, agreement)
      }
    }
    return map
  }, [activeAgreements])

  const activeAgreementSections = useMemo(() => {
    return INSIGHT_SERVICE_TYPES
      .map((type) => ({
        type,
        items: activeAgreements.filter((agreement) => agreement.service_type === type),
      }))
      .filter((section) => section.items.length > 0)
  }, [activeAgreements])

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, GroupedTransactionRow>()

    for (const transaction of transactions) {
      const matchingAgreement = transaction.service_id && isServiceLevelNeedTransaction(transaction)
        ? activeAgreementByServiceId.get(transaction.service_id)
        : undefined
      const completedCount = transaction.service_id
        ? (completedMultiUseByService.get(transaction.service_id)?.length ?? 0)
        : 0
      const shouldGroup = isMultiUseTransaction(transaction, completedCount)
      const key = shouldGroup ? `${transaction.transaction_type}:${transaction.service_id}` : transaction.id
      const existing = groups.get(key)

      if (existing) {
        existing.items.push(transaction)
        existing.createdAt = new Date(transaction.created_at).getTime() > new Date(existing.createdAt).getTime()
          ? transaction.created_at
          : existing.createdAt
        existing.balanceAfter = transaction.balance_after
        existing.amount = Math.max(existing.amount, transaction.amount)
        continue
      }

      const label = shouldGroup
        ? `${completedCount} members`
        : matchingAgreement?.counterpart_name ?? counterpartName(transaction, user?.id)

      groups.set(key, {
        key,
        serviceId: transaction.service_id,
        primary: transaction,
        items: [transaction],
        amount: transaction.amount,
        balanceAfter: transaction.balance_after,
        createdAt: transaction.created_at,
        counterpartLabel: label,
        counterpartId: matchingAgreement?.counterpart_id ?? transaction.counterpart?.id ?? null,
        counterpartAvatarUrl: shouldGroup ? null : (matchingAgreement?.counterpart_avatar_url ?? transaction.counterpart?.avatar_url ?? null),
        description: shouldGroup
          ? `Settled once for ${completedCount} participants. Open details to view everyone in this session.`
          : transactionFriendlyDescription(transaction),
        isMultiUse: shouldGroup,
      })
    }

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [activeAgreementByServiceId, completedMultiUseByService, transactions, user?.id])

  const fetchTransactions = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const res = await transactionAPI.list({ page, direction }, signal)
      if (requestId !== requestIdRef.current) return
      setTransactions(res.results)
      setSummary(res.summary ?? EMPTY_SUMMARY)
      setCount(res.count)
    } catch (error) {
      const isAbort =
        signal?.aborted ||
        (error instanceof Error && (
          error.name === 'AbortError' ||
          error.name === 'CanceledError' ||
          error.message === 'canceled'
        )) ||
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ERR_CANCELED')

      if (isAbort || requestId !== requestIdRef.current) return
      setError('Could not load your transaction history. Please try again.')
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [direction, page])

  const fetchInsights = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await transactionAPI.list({ page: 1, page_size: 100, direction: 'all' }, signal)
      setInsightTransactions(res.results)
    } catch (error) {
      const isAbort =
        signal?.aborted ||
        (error instanceof Error && (
          error.name === 'AbortError' ||
          error.name === 'CanceledError' ||
          error.message === 'canceled'
        )) ||
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ERR_CANCELED')

      if (!isAbort) setInsightTransactions([])
    }
  }, [])

  const fetchActiveAgreements = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++agreementRequestIdRef.current

    try {
      const handshakes = await handshakeAPI.list(signal)
      if (requestId !== agreementRequestIdRef.current) return
      setHandshakes(handshakes)

      const nextAgreements = handshakes
        .filter((handshake) => ACTIVE_HANDSHAKE_STATUSES.has(handshake.status))
        .map((handshake) => toExpectedAgreement(handshake, user))
        .filter((item): item is ExpectedAgreement => item !== null)

      setActiveAgreements(nextAgreements)
    } catch (error) {
      const isAbort =
        signal?.aborted ||
        (error instanceof Error && (
          error.name === 'AbortError' ||
          error.name === 'CanceledError' ||
          error.message === 'canceled'
        )) ||
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ERR_CANCELED')

      if (isAbort || requestId !== agreementRequestIdRef.current) return
      setActiveAgreements([])
    }
  }, [user])

  const fetchEventHistory = useCallback(async (signal?: AbortSignal) => {
    if (!user?.id) {
      setEventHistory([])
      return
    }

    try {
      const history = await userAPI.getHistory(user.id, signal)
      setEventHistory(
        history
          .filter((item) => item.service_type === 'Event')
          .map((item) => ({
            ...item,
            event_status: item.evaluation_pending ? 'attended' : 'completed',
          })),
      )
    } catch (error) {
      const isAbort =
        signal?.aborted ||
        (error instanceof Error && (
          error.name === 'AbortError' ||
          error.name === 'CanceledError' ||
          error.message === 'canceled'
        )) ||
        (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ERR_CANCELED')

      if (!isAbort) setEventHistory([])
    }
  }, [user?.id])

  useEffect(() => {
    const controller = new AbortController()
    fetchTransactions(controller.signal)
    return () => controller.abort()
  }, [fetchTransactions])

  useEffect(() => {
    const controller = new AbortController()
    fetchInsights(controller.signal)
    return () => controller.abort()
  }, [fetchInsights])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    fetchActiveAgreements(controller.signal)
    return () => controller.abort()
  }, [fetchActiveAgreements, user])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    fetchEventHistory(controller.signal)
    return () => controller.abort()
  }, [fetchEventHistory, user])

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true)
    try {
      const allRows: Transaction[] = []
      let exportPage = 1

      while (true) {
        const res = await transactionAPI.list({ page: exportPage, direction })
        allRows.push(...res.results)
        if (!res.next) break
        exportPage += 1
      }

      const headers = ['Date', 'Counterpart', 'Service', 'Type', 'Amount', 'Description']
      const rows = allRows.map((transaction) => ([
        formatDate(transaction.created_at),
        counterpartName(transaction, user?.id),
        transaction.service_title ?? '',
        transactionActionTitle(transaction),
        formatAmount(transaction.amount),
        transactionFriendlyDescription(transaction),
      ]))

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `transaction-history-${direction}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }, [direction, user?.id])

  return (
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflowY="auto" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box
        maxW="1440px"
        mx="auto"
        bg={WHITE}
        borderRadius={{ base: 0, md: '20px' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        minH={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        overflow="hidden"
        p={{ base: 5, md: 8 }}
      >
        <Flex direction={{ base: 'column', md: 'row' }} align={{ base: 'flex-start', md: 'center' }} justify="space-between" gap={4} mb={6}>
          <Box>
            <Box
              as="button"
              onClick={() => navigate('/profile')}
              mb={3}
              px="10px"
              py="6px"
              borderRadius="999px"
              fontSize="12px"
              fontWeight={600}
              color={GRAY700}
              bg={GRAY100}
              style={{ cursor: 'pointer' }}
            >
              <Flex align="center" gap={2}>
                <FiArrowLeft size={14} />
                Back to Profile
              </Flex>
            </Box>
            <Text fontSize={{ base: '24px', md: '28px' }} fontWeight={800} color={GRAY900} mb={2}>
              Time Activity
            </Text>
            <Text fontSize="14px" color={GRAY500}>
              A shared record of the time you have earned and used with the community.
            </Text>
          </Box>

          <Box
            as="button"
            onClick={() => {
              if (exportDisabled) return
              void handleExportCsv()
            }}
            aria-disabled={exportDisabled}
            px="12px"
            py="8px"
            borderRadius="9px"
            fontSize="12px"
            fontWeight={600}
            color={PURPLE}
            bg={PURPLE_LT}
            border={`1px solid ${PURPLE}22`}
            style={{ cursor: exportDisabled ? 'not-allowed' : 'pointer', opacity: exportDisabled ? 0.6 : 1 }}
          >
            <Flex align="center" gap={2}>
              {isExporting ? <Spinner size="sm" color={PURPLE} /> : <FiDownload size={15} />}
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </Flex>
          </Box>
        </Flex>

        <Box
          position="relative"
          overflow="hidden"
          borderRadius="22px"
          mb={4}
          p={{ base: 5, md: 6 }}
          color={WHITE}
          backgroundImage={`linear-gradient(135deg, #064E3B 0%, ${GREEN} 55%, #34D399 100%)`}
          boxShadow="0 14px 38px rgba(5, 122, 85, 0.30)"
        >
          <Box
            position="absolute"
            top="-80px"
            right="-60px"
            w="260px"
            h="260px"
            borderRadius="full"
            bg="whiteAlpha.200"
            style={{ filter: 'blur(2px)' }}
          />
          <Box
            position="absolute"
            bottom="-100px"
            left="-40px"
            w="220px"
            h="220px"
            borderRadius="full"
            bg="whiteAlpha.100"
          />

          <Grid
            templateColumns={{ base: '1fr', md: '1.2fr 1fr 1fr' }}
            gap={{ base: 4, md: 6 }}
            alignItems="center"
            position="relative"
          >
            <Box>
              <Flex align="center" gap={2} mb={2}>
                <Box
                  w="32px"
                  h="32px"
                  borderRadius="full"
                  bg="whiteAlpha.300"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <FiClock size={16} color={WHITE} />
                </Box>
                <Text fontSize="11px" fontWeight={800} letterSpacing="0.16em" textTransform="uppercase" color="whiteAlpha.900">
                  Time Available
                </Text>
              </Flex>
              <Flex align="baseline" gap={2}>
                <Text fontSize={{ base: '40px', md: '52px' }} fontWeight={900} lineHeight={1} color={WHITE}>
                  {formatHours(summary.current_balance)}
                </Text>
              </Flex>
              <Flex align="center" gap={3} mt={3} flexWrap="wrap">
                <Flex align="center" gap="6px" px="10px" py="5px" borderRadius="999px" bg="whiteAlpha.250">
                  <FiTrendingUp size={12} color={WHITE} />
                  <Text fontSize="11px" fontWeight={800} color={WHITE}>
                    {formatHours(summary.total_earned)} earned
                  </Text>
                </Flex>
                <Flex align="center" gap="6px" px="10px" py="5px" borderRadius="999px" bg="whiteAlpha.250">
                  <FiTrendingDown size={12} color={WHITE} />
                  <Text fontSize="11px" fontWeight={800} color={WHITE}>
                    {formatHours(Math.abs(summary.total_spent))} used
                  </Text>
                </Flex>
              </Flex>
            </Box>

            <Box
              borderRadius="16px"
              bg="whiteAlpha.200"
              border="1px solid rgba(255,255,255,0.25)"
              p={4}
              backdropFilter="blur(8px)"
            >
              <Text fontSize="10px" fontWeight={800} letterSpacing="0.14em" textTransform="uppercase" color="whiteAlpha.800" mb={2}>
                Top community partner
              </Text>
              {topPartner ? (
                <Flex
                  as="button"
                  align="center"
                  gap={3}
                  textAlign="left"
                  onClick={() => openPublicProfile(topPartner.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Avatar.Root size="lg" borderRadius="full">
                    {topPartner.avatar_url ? (
                      <Avatar.Image src={topPartner.avatar_url} alt={topPartner.name} />
                    ) : null}
                    <Avatar.Fallback name={topPartner.name} bg="whiteAlpha.400" color={WHITE} />
                  </Avatar.Root>
                  <Box minW={0}>
                    <Text fontSize="15px" fontWeight={800} color={WHITE} lineHeight={1.1}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {topPartner.name}
                    </Text>
                    <Text fontSize="11px" color="whiteAlpha.800" mt="3px" fontWeight={600}>
                      {topPartner.count} {topPartner.count === 1 ? 'exchange' : 'exchanges'} · {formatHours(topPartner.hours)}
                    </Text>
                  </Box>
                </Flex>
              ) : (
                <Flex align="center" gap={3}>
                  <Box
                    w="48px"
                    h="48px"
                    borderRadius="full"
                    bg="whiteAlpha.300"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <FiUser size={20} color={WHITE} />
                  </Box>
                  <Box>
                    <Text fontSize="13px" fontWeight={800} color={WHITE}>No partner yet</Text>
                    <Text fontSize="11px" color="whiteAlpha.800" mt="2px">Start an exchange to see who you trade time with most.</Text>
                  </Box>
                </Flex>
              )}
            </Box>

            <Box
              borderRadius="16px"
              bg="whiteAlpha.200"
              border="1px solid rgba(255,255,255,0.25)"
              p={4}
              backdropFilter="blur(8px)"
            >
              <Text fontSize="10px" fontWeight={800} letterSpacing="0.14em" textTransform="uppercase" color="whiteAlpha.800" mb={2}>
                Activity pulse
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={3}>
                <Box>
                  <Text fontSize="22px" fontWeight={900} color={WHITE} lineHeight={1}>
                    {insightStats.monthActivityCount}
                  </Text>
                  <Text fontSize="10px" fontWeight={700} color="whiteAlpha.800" textTransform="uppercase" letterSpacing="0.08em" mt="3px">
                    This month
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="22px" fontWeight={900} color={WHITE} lineHeight={1}>
                    {formatHours(insightStats.reservedNow)}
                  </Text>
                  <Text fontSize="10px" fontWeight={700} color="whiteAlpha.800" textTransform="uppercase" letterSpacing="0.08em" mt="3px">
                    Reserved
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="22px" fontWeight={900} color={WHITE} lineHeight={1}>
                    {formatHours(insightStats.lastSevenDayHours)}
                  </Text>
                  <Text fontSize="10px" fontWeight={700} color="whiteAlpha.800" textTransform="uppercase" letterSpacing="0.08em" mt="3px">
                    Last 7d
                  </Text>
                </Box>
                <Box>
                  <Text
                    fontSize="22px"
                    fontWeight={900}
                    color={WHITE}
                    lineHeight={1}
                  >
                    {activeAgreementDelta === 0 ? '0h' : formatAmount(activeAgreementDelta)}
                  </Text>
                  <Text fontSize="10px" fontWeight={700} color="whiteAlpha.800" textTransform="uppercase" letterSpacing="0.08em" mt="3px">
                    Active
                  </Text>
                </Box>
              </Grid>
            </Box>
          </Grid>
        </Box>

        <Box
          borderRadius="20px"
          border={`1px solid ${GRAY200}`}
          bg={WHITE}
          mb={5}
          p={{ base: 4, md: 5 }}
          backgroundImage={`linear-gradient(135deg, ${WHITE} 0%, ${GRAY50} 100%)`}
        >
          <Flex
            align={{ base: 'flex-start', md: 'center' }}
            justify="space-between"
            direction={{ base: 'column', md: 'row' }}
            gap={3}
            mb={4}
          >
            <Box>
              <Text fontSize={{ base: '15px', md: '16px' }} fontWeight={800} color={GRAY900}>
                Activity Insights
              </Text>
              <Text fontSize="12px" color={GRAY500} mt="2px">
                Your last 28 days at a glance
              </Text>
            </Box>
            <Flex gap={2} flexWrap="wrap">
              <Box px="10px" py="5px" borderRadius="999px" bg={GREEN_LT} color={GREEN} fontSize="11px" fontWeight={800}>
                {insightStats.monthActivityCount} this month
              </Box>
              {activeAgreementDelta !== 0 && (
                <Box px="10px" py="5px" borderRadius="999px" bg={BLUE_LT} color={BLUE} fontSize="11px" fontWeight={800}>
                  {formatAmount(activeAgreementDelta)} active
                </Box>
              )}
              <Box px="10px" py="5px" borderRadius="999px" bg={AMBER_LT} color={AMBER} fontSize="11px" fontWeight={800}>
                {formatHours(insightStats.reservedNow)} reserved
              </Box>
            </Flex>
          </Flex>

          <Grid templateColumns={{ base: '1fr', lg: '1.15fr 0.85fr' }} gap={4}>
            <Box
              borderRadius="16px"
              bg={WHITE}
              border={`1px solid ${GRAY200}`}
              p={5}
              boxShadow="0 8px 24px rgba(15, 23, 42, 0.06)"
            >
              <Flex align="center" justify="space-between" mb={3}>
                <Box>
                  <Text fontSize="14px" fontWeight={900} color={GRAY900} textTransform="uppercase" letterSpacing="0.06em">
                    28-day activity
                  </Text>
                  <Text fontSize="12px" color={GRAY600} fontWeight={600} mt="2px">
                    {formatHours(insightStats.lastSevenDayHours)} active in last 7 days
                  </Text>
                </Box>
                <Flex align="center" gap="6px">
                  <Text fontSize="10px" color={GRAY600} fontWeight={800}>Less</Text>
                  {['#E5E7EB', '#A7F3D0', '#34D399', GREEN].map((color, i) => (
                    <Box key={i} h="11px" w="11px" borderRadius="4px" bg={color} border={`1px solid ${i === 0 ? GRAY200 : 'rgba(45,92,78,0.18)'}`} />
                  ))}
                  <Text fontSize="10px" color={GRAY600} fontWeight={800}>More</Text>
                </Flex>
              </Flex>
              <Grid templateColumns="repeat(14, 1fr)" gap="8px">
                {insightStats.calendarDays.map((day) => {
                  const bg = day.count === 0
                    ? '#E5E7EB'
                    : day.count === 1
                      ? '#A7F3D0'
                      : day.count <= 3
                        ? '#34D399'
                        : GREEN
                  return (
                    <Box
                      key={day.key}
                      h={{ base: '18px', md: '24px' }}
                      borderRadius="7px"
                      bg={bg}
                      border={`1px solid ${day.count === 0 ? GRAY200 : 'rgba(45,92,78,0.16)'}`}
                      boxShadow={day.count > 0 ? 'inset 0 0 0 1px rgba(255,255,255,0.35)' : 'none'}
                      transition="transform 120ms ease"
                      _hover={{ transform: 'scale(1.12)' }}
                      title={`${day.key}: ${day.count} ${day.count === 1 ? 'entry' : 'entries'}`}
                    />
                  )
                })}
              </Grid>
            </Box>

            <Box
              borderRadius="16px"
              bg={WHITE}
              border={`1px solid ${GRAY100}`}
              p={4}
              boxShadow="0 1px 2px rgba(15, 23, 42, 0.04)"
            >
              <Text fontSize="12px" fontWeight={800} color={GRAY900} textTransform="uppercase" letterSpacing="0.06em" mb={3}>
                Time flow
              </Text>

              <Flex justify="space-between" align="flex-end" mb="6px">
                <Box>
                  <Flex align="center" gap="6px">
                    <Box h="8px" w="8px" borderRadius="full" bg={GREEN} />
                    <Text fontSize="11px" color={GRAY600} fontWeight={700}>Earned</Text>
                  </Flex>
                  <Text fontSize="18px" fontWeight={900} color={GREEN} mt="2px" lineHeight={1}>
                    {formatHours(insightStats.receivedHours)}
                  </Text>
                </Box>
                <Box textAlign="right">
                  <Flex align="center" gap="6px" justify="flex-end">
                    <Text fontSize="11px" color={GRAY600} fontWeight={700}>Used</Text>
                    <Box h="8px" w="8px" borderRadius="full" bg={AMBER} />
                  </Flex>
                  <Text fontSize="18px" fontWeight={900} color={AMBER} mt="2px" lineHeight={1}>
                    {formatHours(insightStats.sharedHours)}
                  </Text>
                </Box>
              </Flex>

              <Flex h="12px" borderRadius="999px" overflow="hidden" bg={GRAY100} mb={3}>
                <Box
                  style={{
                    width: `${receivedShare}%`,
                    backgroundImage: `linear-gradient(90deg, ${GREEN_LT} 0%, ${GREEN} 100%)`,
                  }}
                />
                <Box
                  style={{
                    width: `${sharedShare}%`,
                    backgroundImage: `linear-gradient(90deg, ${AMBER} 0%, ${AMBER_LT} 100%)`,
                  }}
                />
              </Flex>

            </Box>
          </Grid>

          <Box
            mt={4}
            borderRadius="20px"
            bg={WHITE}
            border={`1px solid ${GRAY200}`}
            overflow="hidden"
            boxShadow="0 1px 2px rgba(15, 23, 42, 0.04)"
          >
            <Flex
              px={5}
              py={4}
              align="center"
              justify="space-between"
              gap={3}
              bg={GRAY50}
              borderBottom={`1px solid ${GRAY200}`}
            >
              <Box>
                <Text fontSize="14px" fontWeight={800} color={GRAY900}>
                  Activity mix
                </Text>
                <Text fontSize="12px" color={GRAY500} mt="2px">
                  Hours, role and recency for each listing type
                </Text>
              </Box>
              <Box
                px="10px"
                py="5px"
                borderRadius="999px"
                bg={WHITE}
                border={`1px solid ${GRAY200}`}
                color={GRAY700}
                fontSize="11px"
                fontWeight={800}
              >
                {activityMix.totalCount} entries
              </Box>
            </Flex>

            <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={0}>
              {INSIGHT_SERVICE_TYPES.map((typeKey, idx) => {
                const tone = typeBadgeTone(typeKey)
                const bucket = activityMix.buckets[typeKey]
                const total = Math.max(1, activityMix.totalCount)
                const share = Math.round((bucket.count / total) * 100)
                const lastSeen = bucket.lastDate
                  ? bucket.lastDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
                  : '—'
                return (
                  <Box
                    key={typeKey}
                    bg={WHITE}
                    borderLeft={{ base: 'none', md: idx === 0 ? 'none' : `1px solid ${GRAY100}` }}
                    borderTop={{ base: idx === 0 ? 'none' : `1px solid ${GRAY100}`, md: 'none' }}
                  >
                    <Box h="3px" bg={tone.color} />
                    <Box px={5} py={4}>
                      <Flex align="center" justify="space-between" mb={3}>
                        <Flex align="center" gap={2}>
                          <Box w="8px" h="8px" borderRadius="full" bg={tone.color} />
                          <Text fontSize="11px" color={GRAY900} fontWeight={800} textTransform="uppercase" letterSpacing="0.08em">
                            {typeKey}
                          </Text>
                        </Flex>
                        <Box px="8px" py="2px" borderRadius="999px" bg={tone.bg} color={tone.color} fontSize="10px" fontWeight={800}>
                          {share}% of activity
                        </Box>
                      </Flex>

                      <Flex align="baseline" gap={2} mb={1}>
                        <Text fontSize="32px" color={GRAY900} fontWeight={900} lineHeight={1}>
                          {bucket.count}
                        </Text>
                        <Text fontSize="12px" color={GRAY500} fontWeight={700}>
                          {bucket.count === 1 ? 'entry' : 'entries'}
                        </Text>
                        <Box flex="1" />
                        <Text fontSize="12px" color={GRAY700} fontWeight={700}>
                          {formatHours(bucket.hours)}
                        </Text>
                      </Flex>

                      <Box h="6px" borderRadius="999px" bg={GRAY100} overflow="hidden" mb={3}>
                        <Box h="full" borderRadius="999px" bg={tone.color} style={{ width: `${Math.max(share, bucket.count > 0 ? 4 : 0)}%` }} />
                      </Box>

                      {typeKey !== 'Event' ? (
                        <Flex gap="6px" flexWrap="wrap" mb={3}>
                          <Flex align="center" gap="4px" px="8px" py="3px" borderRadius="999px" bg={GREEN_LT}>
                            <FiTrendingUp size={10} color={GREEN} />
                            <Text fontSize="10px" color={GREEN} fontWeight={800}>
                              {formatHours(bucket.earnedHours)} earned
                            </Text>
                          </Flex>
                          <Flex align="center" gap="4px" px="8px" py="3px" borderRadius="999px" bg={AMBER_LT}>
                            <FiTrendingDown size={10} color={AMBER} />
                            <Text fontSize="10px" color={AMBER} fontWeight={800}>
                              {formatHours(bucket.usedHours)} used
                            </Text>
                          </Flex>
                        </Flex>
                      ) : (
                        <Flex gap="6px" mb={3}>
                          <Flex align="center" gap="4px" px="8px" py="3px" borderRadius="999px" bg={tone.bg}>
                            <Text fontSize="10px" color={tone.color} fontWeight={800}>
                              Time-free sessions
                            </Text>
                          </Flex>
                        </Flex>
                      )}

                      <Flex align="center" gap="6px" pt={2} borderTop={`1px solid ${GRAY100}`}>
                        <FiClock size={11} color={GRAY500} />
                        <Text fontSize="11px" color={GRAY600} fontWeight={600}>
                          Last activity · {lastSeen}
                        </Text>
                      </Flex>
                    </Box>
                  </Box>
                )
              })}
            </Grid>
          </Box>
        </Box>

        {activeAgreements.length > 0 && (
          <Box borderRadius="20px" border={`1px solid ${GRAY200}`} bg={WHITE} mb={4} overflow="hidden">
            <Flex
              as="button"
              onClick={() => setShowActiveAgreements((prev) => !prev)}
              w="full"
              px={{ base: 4, md: 5 }}
              py={{ base: 3, md: 3 }}
              justify="space-between"
              align="center"
              gap={3}
              bg={GRAY50}
              borderBottom={`1px solid ${GRAY200}`}
              textAlign="left"
              style={{ cursor: 'pointer' }}
            >
              <Box>
                <Text fontSize="15px" fontWeight={800} color={GRAY900} mb={1}>
                  Active Agreements
                </Text>
                <Text fontSize="12px" color={GRAY600}>
                  {activeAgreements.length} ongoing session{activeAgreements.length === 1 ? '' : 's'}
                </Text>
              </Box>
              <Flex align="center" gap={2}>
                <Box px="10px" py="5px" borderRadius="999px" bg={WHITE} color={BLUE} fontSize="12px" fontWeight={700}>
                  {activeAgreementDelta !== 0 ? `${formatAmount(activeAgreementDelta)} active` : 'No time change'}
                </Box>
                <Text fontSize="16px" fontWeight={900} color={BLUE}>
                  {showActiveAgreements ? '−' : '+'}
                </Text>
              </Flex>
            </Flex>

            {showActiveAgreements && (
              <Box>
                <Box display={{ base: 'none', md: 'block' }} px={5} py={3} bg={WHITE} borderBottom={`1px solid ${GRAY100}`}>
                  <Grid templateColumns="minmax(260px, 1fr) 220px 140px" gap={4}>
                    {['Session', 'With', 'Time'].map((label) => (
                      <Text key={label} fontSize="11px" fontWeight={800} color={GRAY500} textTransform="uppercase" letterSpacing="0.08em">
                        {label}
                      </Text>
                    ))}
                  </Grid>
                </Box>

                {activeAgreementSections.map((section, sectionIndex) => {
                  const sectionTone = typeBadgeTone(section.type)
                  const sectionOpen = openActiveAgreementSections[section.type] === true
                  const sectionTotal = section.items.reduce(
                    (sum, agreement) => sum + (agreement.expected_delta !== 0 ? agreement.expected_delta : agreement.reserved_delta),
                    0,
                  )

                  return (
                    <Box key={section.type} borderTop={sectionIndex === 0 ? 'none' : `1px solid ${GRAY100}`}>
                      <Flex
                        as="button"
                        onClick={() => toggleActiveAgreementSection(section.type)}
                        w="full"
                        px={{ base: 4, md: 5 }}
                        py={2.5}
                        align="center"
                        justify="space-between"
                        bg={sectionTone.bg}
                        textAlign="left"
                        style={{ cursor: 'pointer' }}
                      >
                        <Flex align="center" gap={2}>
                          <Box w="8px" h="8px" borderRadius="full" bg={sectionTone.color} />
                          <Text fontSize="11px" fontWeight={900} color={sectionTone.color} textTransform="uppercase" letterSpacing="0.08em">
                            {section.type}
                          </Text>
                        </Flex>
                        <Flex align="center" gap={2}>
                          <Text fontSize="11px" color={sectionTone.color} fontWeight={800}>
                            {section.items.length} active · {formatAmount(sectionTotal)}
                          </Text>
                          <Text fontSize="13px" color={sectionTone.color} fontWeight={900}>
                            {sectionOpen ? '−' : '+'}
                          </Text>
                        </Flex>
                      </Flex>

                      {sectionOpen && section.items.map((agreement, index) => {
                        const accent = roleAccent(agreement.is_current_user_provider)
                        const Icon = accent.icon
                        const typeTone = typeBadgeTone(agreement.service_type)
                        const ownListing = isOwnService(agreement.service_type, agreement.is_current_user_provider)
                        const displayDelta = agreement.expected_delta !== 0 ? agreement.expected_delta : agreement.reserved_delta
                        const timeColor = displayDelta > 0 ? GREEN : displayDelta < 0 ? AMBER : GRAY700
                        const timeBg = displayDelta > 0 ? GREEN_LT : displayDelta < 0 ? AMBER_LT : GRAY100
                        const timeLabel = agreement.expected_delta !== 0
                          ? 'after completion'
                          : agreement.reserved_delta !== 0
                            ? 'reserved now'
                            : 'no time change'

                        return (
                          <Grid
                            key={agreement.id}
                            templateColumns={{ base: '1fr', md: 'minmax(260px, 1fr) 220px 140px' }}
                            gap={{ base: 3, md: 4 }}
                            alignItems="center"
                            px={{ base: 4, md: 5 }}
                            py={3}
                            borderTop={index === 0 ? 'none' : `1px solid ${GRAY100}`}
                          >
                            <Flex align="center" gap={3} minW={0}>
                              <Box p="9px" borderRadius="12px" bg={accent.bg} color={accent.color}>
                                <Icon size={16} />
                              </Box>
                              <Box minW={0}>
                                <Text
                                  as={agreement.service_id ? 'button' : undefined}
                                  onClick={() => openServiceDetail(agreement.service_id)}
                                  fontSize="13px"
                                  fontWeight={800}
                                  color={agreement.service_id ? GREEN : GRAY800}
                                  whiteSpace="nowrap"
                                  overflow="hidden"
                                  textOverflow="ellipsis"
                                  textAlign="left"
                                  style={{ cursor: agreement.service_id ? 'pointer' : 'default' }}
                                >
                                  {agreement.service_title}
                                </Text>
                                <Flex gap={1.5} flexWrap="wrap" mt={1.5}>
                                  <Box px="7px" py="2px" borderRadius="999px" bg={accent.bg} color={accent.color} fontSize="10px" fontWeight={800}>
                                    {agreementRoleLabel(agreement)}
                                  </Box>
                                  <Box px="7px" py="2px" borderRadius="999px" bg={ownListing ? PURPLE_LT : GRAY100} color={ownListing ? PURPLE : GRAY600} fontSize="10px" fontWeight={800}>
                                    {serviceOwnershipLabel(agreement.service_type, agreement.is_current_user_provider)}
                                  </Box>
                                  <Box px="7px" py="2px" borderRadius="999px" bg={typeTone.bg} color={typeTone.color} fontSize="10px" fontWeight={800}>
                                    {serviceTypeLabel(agreement.service_type)}
                                  </Box>
                                  <Box px="7px" py="2px" borderRadius="999px" bg={GRAY100} color={GRAY600} fontSize="10px" fontWeight={800}>
                                    {activeHandshakeLabel(agreement.status)}
                                  </Box>
                                </Flex>
                              </Box>
                            </Flex>

                            <Flex
                              as={agreement.counterpart_id ? 'button' : undefined}
                              align="center"
                              gap={2}
                              minW={0}
                              textAlign="left"
                              onClick={() => openPublicProfile(agreement.counterpart_id)}
                              style={{ cursor: agreement.counterpart_id ? 'pointer' : 'default' }}
                            >
                              {agreement.counterpart_avatar_url ? (
                                <Avatar.Root size="xs">
                                  <Avatar.Image src={agreement.counterpart_avatar_url} alt={agreement.counterpart_name} />
                                  <Avatar.Fallback name={agreement.counterpart_name} />
                                </Avatar.Root>
                              ) : (
                                <Box p="5px" borderRadius="full" bg={GRAY100} color={GRAY500}><FiUser size={12} /></Box>
                              )}
                              <Text fontSize="13px" fontWeight={700} color={GRAY800} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                                {agreement.counterpart_name}
                              </Text>
                            </Flex>

                            <Flex align={{ base: 'center', md: 'flex-end' }} justify="space-between" direction={{ base: 'row', md: 'column' }} gap={1}>
                              <Box px="10px" py="5px" borderRadius="999px" bg={timeBg} color={timeColor} fontSize="13px" fontWeight={900}>
                                {displayDelta !== 0 ? formatAmount(displayDelta) : 'No hours'}
                              </Box>
                              <Text fontSize="11px" color={GRAY500}>
                                {timeLabel}
                              </Text>
                            </Flex>
                          </Grid>
                        )
                      })}
                    </Box>
                  )
                })}
              </Box>
            )}
          </Box>
        )}

        {eventHistory.length > 0 && (
          <Box borderRadius="20px" border={`1px solid ${GRAY200}`} bg={WHITE} mb={4} overflow="hidden">
            <Flex px={{ base: 4, md: 5 }} py={3} align="center" justify="space-between" bg={GRAY50} borderBottom={`1px solid ${GRAY200}`}>
              <Box>
                <Text fontSize="15px" fontWeight={800} color={GRAY900}>
                  Event Activity
                </Text>
                <Text fontSize="12px" color={GRAY600}>
                  {eventHistory.length} event{eventHistory.length === 1 ? '' : 's'} joined or completed
                </Text>
              </Box>
            </Flex>

            <Box>
              {eventHistory.slice(0, 5).map((event, index) => (
                <Grid
                  key={`${event.service_id}-${event.completed_date}-${index}`}
                  templateColumns={{ base: '1fr', md: 'minmax(260px, 1fr) 220px 140px' }}
                  gap={{ base: 3, md: 4 }}
                  alignItems="center"
                  px={{ base: 4, md: 5 }}
                  py={3}
                  borderTop={index === 0 ? 'none' : `1px solid ${GRAY100}`}
                >
                  <Flex align="center" gap={3} minW={0}>
                    <Box p="9px" borderRadius="12px" bg={AMBER_LT} color={AMBER}>
                      <FiClock size={16} />
                    </Box>
                    <Box minW={0}>
                      <Text
                        as={event.service_id ? 'button' : undefined}
                        onClick={() => openServiceDetail(event.service_id)}
                        fontSize="13px"
                        fontWeight={800}
                        color={event.service_id ? GREEN : GRAY800}
                        whiteSpace="nowrap"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        textAlign="left"
                        style={{ cursor: event.service_id ? 'pointer' : 'default' }}
                      >
                        {event.service_title}
                      </Text>
                      <Flex gap={1.5} flexWrap="wrap" mt={1.5}>
                        <Box px="7px" py="2px" borderRadius="999px" bg={AMBER_LT} color={AMBER} fontSize="10px" fontWeight={800}>
                          Event
                        </Box>
                        <Box px="7px" py="2px" borderRadius="999px" bg={event.was_provider ? PURPLE_LT : GRAY100} color={event.was_provider ? PURPLE : GRAY600} fontSize="10px" fontWeight={800}>
                          {event.was_provider ? 'Organizer' : 'Attendee'}
                        </Box>
                        <Box px="7px" py="2px" borderRadius="999px" bg={GRAY100} color={GRAY600} fontSize="10px" fontWeight={800}>
                          {event.event_status === 'attended' ? 'Attended' : 'Completed'}
                        </Box>
                      </Flex>
                    </Box>
                  </Flex>

                  <Flex
                    as={event.partner_id ? 'button' : undefined}
                    align="center"
                    gap={2}
                    minW={0}
                    textAlign="left"
                    onClick={() => openPublicProfile(event.partner_id)}
                    style={{ cursor: event.partner_id ? 'pointer' : 'default' }}
                  >
                    {event.partner_avatar_url ? (
                      <Avatar.Root size="xs">
                        <Avatar.Image src={event.partner_avatar_url} alt={event.partner_name} />
                        <Avatar.Fallback name={event.partner_name} />
                      </Avatar.Root>
                    ) : (
                      <Box p="5px" borderRadius="full" bg={GRAY100} color={GRAY500}><FiUser size={12} /></Box>
                    )}
                    <Text fontSize="13px" fontWeight={700} color={GRAY800} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                      {event.partner_name}
                    </Text>
                  </Flex>

                  <Box textAlign={{ base: 'left', md: 'right' }}>
                    <Text fontSize="13px" fontWeight={800} color={GRAY800}>
                      {formatHours(Number(event.duration))}
                    </Text>
                    <Text fontSize="11px" color={GRAY500}>
                      {formatDate(event.completed_date)}
                    </Text>
                  </Box>
                </Grid>
              ))}
            </Box>
          </Box>
        )}

        <Flex
          direction={{ base: 'column', lg: 'row' }}
          align={{ base: 'stretch', lg: 'center' }}
          justify="space-between"
          gap={4}
          mb={4}
        >
          <Flex gap={2} flexWrap="wrap">
            {FILTERS.map((filter) => {
              const active = filter.key === direction
              return (
                <Box
                  key={filter.key}
                  as="button"
                  onClick={() => {
                    setDirection(filter.key)
                    setPage(1)
                  }}
                  px="12px"
                  py="6px"
                  borderRadius="999px"
                  fontSize="12px"
                  fontWeight={500}
                  border={`1px solid ${active ? GREEN : GRAY200}`}
                  bg={active ? GREEN_LT : WHITE}
                  color={active ? GREEN : GRAY600}
                  style={{ cursor: 'pointer' }}
                >
                  {filter.label}
                </Box>
              )
            })}
          </Flex>

          <Text fontSize="13px" color={GRAY500}>
            {groupedTransactions.length === 0 ? '0 entries' : `${groupedTransactions.length} ${groupedTransactions.length === 1 ? 'entry' : 'entries'}`}
          </Text>
        </Flex>

        {isLoading ? (
          <Flex direction="column" align="center" justify="center" py={{ base: 16, md: 24 }} gap={3}>
            <Spinner color={GREEN} size="lg" />
            <Text fontSize="14px" color={GRAY500}>Loading time activity…</Text>
          </Flex>
        ) : error ? (
          <Box borderRadius="20px" border={`1px solid ${RED}22`} bg={RED_LT} p={{ base: 5, md: 6 }}>
            <Text fontSize="16px" fontWeight={700} color={RED} mb={2}>Could not load time activity</Text>
            <Text fontSize="14px" color={GRAY700} mb={4}>{error}</Text>
            <Box
              as="button"
              onClick={() => fetchTransactions()}
              px="12px"
              py="7px"
              borderRadius="8px"
              fontSize="12px"
              fontWeight={600}
              color={RED}
              bg={WHITE}
              border={`1px solid ${RED}33`}
              style={{ cursor: 'pointer' }}
            >
              <Flex align="center" gap={2}>
                <FiRefreshCw size={14} />
                Retry
              </Flex>
            </Box>
          </Box>
        ) : groupedTransactions.length === 0 ? (
          <Box borderRadius="24px" border={`1px solid ${GRAY200}`} bg={WHITE}>
            <EmptyLedgerIllustration />
          </Box>
        ) : (
          <Box borderRadius="24px" border={`1px solid ${GRAY200}`} bg={WHITE} overflow="hidden">
            <Box display={{ base: 'none', md: 'block' }} px={6} py={4} bg={GRAY50} borderBottom={`1px solid ${GRAY200}`}>
              <Grid templateColumns="180px 220px minmax(220px, 1fr) 140px" gap={4}>
                {['When', 'Who', 'Activity', 'Time'].map((label) => (
                  <Text key={label} fontSize="11px" fontWeight={800} color={GRAY500} textTransform="uppercase" letterSpacing="0.08em">
                    {label}
                  </Text>
                ))}
              </Grid>
            </Box>

            <Box>
              {groupedTransactions.map((row, index) => {
                const tone = amountTone(row.amount)
                const accent = transactionAccent(row.primary)
                const Icon = accent.icon
                const name = row.counterpartLabel
                const isClickable = row.isMultiUse
                const typeTone = typeBadgeTone(row.primary.service_type)
                const ownListing = isOwnService(row.primary.service_type, row.primary.is_current_user_provider)

                return (
                  <Box
                    key={row.key}
                    px={{ base: 4, md: 6 }}
                    py={{ base: 4, md: 5 }}
                    borderTop={index === 0 ? 'none' : `1px solid ${GRAY100}`}
                    onClick={() => { if (isClickable) setSelectedTransactionGroup(row) }}
                    style={{ cursor: isClickable ? 'pointer' : 'default' }}
                  >
                    <Box display={{ base: 'block', md: 'none' }}>
                      <Flex justify="space-between" align="flex-start" gap={3} mb={3}>
                        <Flex align="center" gap={3}>
                          <Box p="9px" borderRadius="12px" bg={accent.bg} color={accent.color}>
                            <Icon size={16} />
                          </Box>
                          <Box>
                            <Text fontSize="14px" fontWeight={700} color={GRAY800}>{transactionActionTitle(row.primary)}</Text>
                            <Text
                              as={row.primary.service_id ? 'button' : undefined}
                              onClick={(event) => {
                                if (!row.primary.service_id) return
                                event.stopPropagation()
                                openServiceDetail(row.primary.service_id)
                              }}
                              fontSize="12px"
                              color={row.primary.service_id ? GREEN : GRAY500}
                              fontWeight={row.primary.service_id ? 700 : 400}
                              textAlign="left"
                              style={{ cursor: row.primary.service_id ? 'pointer' : 'default' }}
                            >
                              {row.primary.service_title ?? 'Time activity'}
                            </Text>
                            <Flex gap={1.5} flexWrap="wrap" mt={2}>
                              <Box px="7px" py="2px" borderRadius="999px" bg={ownListing ? PURPLE_LT : GRAY100} color={ownListing ? PURPLE : GRAY600} fontSize="10px" fontWeight={800}>
                                {serviceOwnershipLabel(row.primary.service_type, row.primary.is_current_user_provider)}
                              </Box>
                              <Box px="7px" py="2px" borderRadius="999px" bg={typeTone.bg} color={typeTone.color} fontSize="10px" fontWeight={800}>
                                {serviceTypeLabel(row.primary.service_type)}
                              </Box>
                            </Flex>
                          </Box>
                        </Flex>
                        <Box px="10px" py="6px" borderRadius="999px" bg={tone.bg} color={tone.color} fontSize="12px" fontWeight={800}>
                          {formatAmount(row.amount)}
                        </Box>
                      </Flex>

                      <Box>
                        <Box>
                          <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" mb={1}>Who</Text>
                          <Flex
                            as={row.counterpartId ? 'button' : undefined}
                            align="center"
                            gap={2}
                            textAlign="left"
                            onClick={(event) => {
                              const targetId = row.counterpartId
                              if (!targetId) return
                              event.stopPropagation()
                              openPublicProfile(targetId)
                            }}
                            style={{ cursor: row.counterpartId ? 'pointer' : 'default' }}
                          >
                            {row.counterpartAvatarUrl ? (
                              <Avatar.Root size="xs">
                                <Avatar.Image src={row.counterpartAvatarUrl ?? undefined} alt={name} />
                                <Avatar.Fallback name={name} />
                              </Avatar.Root>
                            ) : (
                              <Box p="5px" borderRadius="full" bg={GRAY100} color={GRAY500}><FiUser size={12} /></Box>
                            )}
                            <Text fontSize="13px" color={GRAY700}>{name}</Text>
                          </Flex>
                        </Box>
                      </Box>

                      <Text fontSize="12px" color={GRAY500} mt={3}>{row.description}</Text>
                    </Box>

                    <Grid display={{ base: 'none', md: 'grid' }} templateColumns="180px 220px minmax(220px, 1fr) 140px" gap={4} alignItems="center">
                      <Box>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800}>{formatDate(row.createdAt)}</Text>
                        <Box display="inline-flex" mt={1} px="7px" py="2px" borderRadius="999px" bg={accent.bg} color={accent.color} fontSize="10px" fontWeight={800}>
                          {accent.stateLabel}
                        </Box>
                      </Box>

                      <Flex align="center" gap={3}>
                        <Box p="9px" borderRadius="12px" bg={accent.bg} color={accent.color}>
                          <Icon size={16} />
                        </Box>
                        <Flex
                          as={row.counterpartId ? 'button' : undefined}
                          align="center"
                          gap={2}
                          minW={0}
                          textAlign="left"
                          onClick={(event) => {
                            const targetId = row.counterpartId
                            if (!targetId) return
                            event.stopPropagation()
                            openPublicProfile(targetId)
                          }}
                          style={{ cursor: row.counterpartId ? 'pointer' : 'default' }}
                        >
                          {row.counterpartAvatarUrl ? (
                            <Avatar.Root size="xs">
                              <Avatar.Image src={row.counterpartAvatarUrl ?? undefined} alt={name} />
                              <Avatar.Fallback name={name} />
                            </Avatar.Root>
                          ) : (
                            <Box p="5px" borderRadius="full" bg={GRAY100} color={GRAY500}><FiUser size={12} /></Box>
                          )}
                          <Box minW={0}>
                            <Text
                              fontSize="13px"
                              fontWeight={700}
                              color={GRAY800}
                              whiteSpace="nowrap"
                              overflow="hidden"
                              textOverflow="ellipsis"
                            >
                              {name}
                            </Text>
                            <Text fontSize="11px" color={GRAY500}>
                              {row.isMultiUse ? `${row.items.length} linked records` : counterpartSubtitle(row.primary, user?.id)}
                            </Text>
                          </Box>
                        </Flex>
                      </Flex>

                      <Box minW={0}>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                          {transactionActionTitle(row.primary)}
                        </Text>
                        <Text
                          as={row.primary.service_id ? 'button' : undefined}
                          onClick={(event) => {
                            if (!row.primary.service_id) return
                            event.stopPropagation()
                            openServiceDetail(row.primary.service_id)
                          }}
                          fontSize="12px"
                          color={row.primary.service_id ? GREEN : GRAY700}
                          fontWeight={row.primary.service_id ? 700 : 400}
                          mt={1}
                          whiteSpace="nowrap"
                          overflow="hidden"
                          textOverflow="ellipsis"
                          textAlign="left"
                          style={{ cursor: row.primary.service_id ? 'pointer' : 'default' }}
                        >
                          {row.primary.service_title ?? 'Manual adjustment'}
                        </Text>
                        <Flex gap={1.5} flexWrap="wrap" mt={2}>
                          <Box px="7px" py="2px" borderRadius="999px" bg={ownListing ? PURPLE_LT : GRAY100} color={ownListing ? PURPLE : GRAY600} fontSize="10px" fontWeight={800}>
                            {serviceOwnershipLabel(row.primary.service_type, row.primary.is_current_user_provider)}
                          </Box>
                          <Box px="7px" py="2px" borderRadius="999px" bg={typeTone.bg} color={typeTone.color} fontSize="10px" fontWeight={800}>
                            {serviceTypeLabel(row.primary.service_type)}
                          </Box>
                        </Flex>
                        <Text fontSize="11px" color={GRAY500} mt={1} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                          {row.description}
                        </Text>
                      </Box>

                      <Text fontSize="14px" fontWeight={800} color={tone.color}>
                        {formatAmount(row.amount)}
                      </Text>
                    </Grid>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}

        {!isLoading && !error && groupedTransactions.length > 0 && (
          <Flex direction={{ base: 'column', sm: 'row' }} align={{ base: 'stretch', sm: 'center' }} justify="space-between" gap={3} mt={5}>
            <Text fontSize="13px" color={GRAY500}>
              Page {page} of {totalPages}
            </Text>
            <Flex gap={2}>
              <Box
                as="button"
                onClick={() => {
                  if (previousDisabled) return
                  setPage((prev) => Math.max(1, prev - 1))
                }}
                aria-disabled={previousDisabled}
                px="12px"
                py="7px"
                borderRadius="8px"
                border={`1px solid ${GRAY200}`}
                bg={WHITE}
                color={GRAY700}
                fontSize="12px"
                fontWeight={500}
                style={{ cursor: previousDisabled ? 'not-allowed' : 'pointer', opacity: previousDisabled ? 0.55 : 1 }}
              >
                <Flex align="center" gap={2}>
                  <FiArrowLeft size={14} />
                  Previous
                </Flex>
              </Box>
              <Box
                as="button"
                onClick={() => {
                  if (nextDisabled) return
                  setPage((prev) => Math.min(totalPages, prev + 1))
                }}
                aria-disabled={nextDisabled}
                px="12px"
                py="7px"
                borderRadius="8px"
                border={`1px solid ${GRAY200}`}
                bg={GREEN_LT}
                color={GREEN}
                fontSize="12px"
                fontWeight={500}
                style={{ cursor: nextDisabled ? 'not-allowed' : 'pointer', opacity: nextDisabled ? 0.55 : 1 }}
              >
                <Flex align="center" gap={2}>
                  Next
                  <FiArrowRight size={14} />
                </Flex>
              </Box>
            </Flex>
          </Flex>
        )}
      </Box>

      <MultiUseDetailsModal
        isOpen={!!selectedTransactionGroup}
        title={selectedTransactionGroup?.primary.service_title ?? 'Session details'}
        subtitle={selectedTransactionGroup
          ? `${completedMultiUseByService.get(selectedTransactionGroup.serviceId ?? '')?.length ?? 0} participants completed this one-time session.`
          : undefined}
        onClose={() => setSelectedTransactionGroup(null)}
        items={(
          selectedTransactionGroup?.serviceId
            ? (completedMultiUseByService.get(selectedTransactionGroup.serviceId) ?? [])
            : []
        ).map((handshake) => ({
          id: handshake.id,
          title: handshake.counterpart
            ? `${handshake.counterpart.first_name} ${handshake.counterpart.last_name}`.trim() || handshake.counterpart.email
            : handshake.requester_name,
          subtitle: 'Completed participant',
          meta: formatDate(handshake.updated_at),
          value: formatHours(handshake.provisioned_hours),
          avatarUrl: handshake.counterpart?.avatar_url ?? null,
        }))}
      />
    </Box>
  )
}

export default TransactionHistoryPage
