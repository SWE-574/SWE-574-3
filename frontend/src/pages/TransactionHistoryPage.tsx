import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Box, Flex, Grid, Spinner, Text } from '@chakra-ui/react'
import {
  FiArrowLeft, FiArrowRight, FiClock, FiDownload, FiRefreshCw,
  FiRepeat, FiTrendingDown, FiTrendingUp, FiUser, FiZap,
} from 'react-icons/fi'
import { transactionAPI, type TransactionDirection } from '@/services/transactionAPI'
import { handshakeAPI, type Handshake } from '@/services/handshakeAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { Transaction, TransactionSummary } from '@/types'
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
  { key: 'credit', label: 'Received' },
  { key: 'debit', label: 'Shared' },
]

const ACTIVE_HANDSHAKE_STATUSES = new Set(['accepted', 'checked_in', 'attended'])

interface ExpectedAgreement {
  id: string
  service_title: string
  service_type?: Handshake['service_type']
  is_current_user_provider: boolean
  counterpart_name: string
  counterpart_email: string
  counterpart_avatar_url?: string | null
  status: Handshake['status']
  provisioned_hours: number
  expected_delta: number
  note: string
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

function counterpartName(transaction: Transaction): string {
  const counterpart = transaction.counterpart
  if (!counterpart) return 'System'

  const fullName = `${counterpart.first_name ?? ''} ${counterpart.last_name ?? ''}`.trim()
  return fullName || counterpart.email || 'Unknown user'
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

function toExpectedAgreement(handshake: Handshake, currentUserName?: string): ExpectedAgreement | null {
  const hours = Number(handshake.provisioned_hours ?? 0)
  if (hours <= 0) return null

  const counterpartName = handshakeCounterpartName(handshake, currentUserName)
  const counterpartEmail = handshake.counterpart?.email ?? ''
  const isProvider = handshake.is_current_user_provider === true

  return {
    id: handshake.id,
    service_title: handshake.service_title,
    service_type: handshake.service_type,
    is_current_user_provider: isProvider,
    counterpart_name: counterpartName,
    counterpart_email: counterpartEmail,
    counterpart_avatar_url: handshake.counterpart?.avatar_url ?? null,
    status: handshake.status,
    provisioned_hours: hours,
    expected_delta: isProvider ? hours : 0,
    note: isProvider
      ? `Time expected after completion`
      : `Hours already reflected in your available time`,
  }
}

function amountTone(value: number) {
  return value >= 0
    ? { color: GREEN, bg: GREEN_LT }
    : { color: RED, bg: RED_LT }
}

function roleAccent(isCurrentUserProvider: boolean) {
  return isCurrentUserProvider
    ? { icon: FiTrendingUp, color: GREEN, bg: GREEN_LT, label: 'Provider' }
    : { icon: FiTrendingDown, color: AMBER, bg: AMBER_LT, label: 'Receiver' }
}

function isOwnService(serviceType?: Handshake['service_type'] | null, isCurrentUserProvider?: boolean) {
  if (serviceType === 'Need') return isCurrentUserProvider === false
  if (serviceType === 'Offer' || serviceType === 'Event') return isCurrentUserProvider === true
  return false
}

function serviceMeta(serviceType?: Handshake['service_type'] | null, isCurrentUserProvider?: boolean) {
  const parts = [
    isCurrentUserProvider ? 'You are provider' : 'You are receiver',
    isOwnService(serviceType, isCurrentUserProvider) ? 'Own service' : 'Other user service',
    serviceType ?? 'Unknown type',
  ]

  return parts.join(' · ')
}

function transactionAccent(transaction: Transaction) {
  const roleBasedAccent = roleAccent(transaction.is_current_user_provider === true)

  switch (transaction.transaction_type) {
    case 'transfer':
      return { ...roleBasedAccent, stateLabel: 'Completed' }
    case 'refund':
      return { icon: FiRepeat, color: PURPLE, bg: PURPLE_LT, stateLabel: 'Refunded' }
    case 'provision':
      return { ...roleBasedAccent, stateLabel: 'Reserved' }
    case 'adjustment':
      return { icon: FiZap, color: GRAY600, bg: GRAY100, stateLabel: 'Adjusted' }
    default:
      return transaction.amount >= 0
        ? { ...roleBasedAccent, stateLabel: 'Received' }
        : { ...roleBasedAccent, stateLabel: 'Shared' }
  }
}

function SummaryCard({
  label,
  value,
  color,
  bg,
}: {
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <Box
      p={{ base: 4, md: 5 }}
      borderRadius="18px"
      border={`1px solid ${GRAY200}`}
      bg={WHITE}
      boxShadow="0 10px 32px rgba(17,24,39,0.05)"
    >
      <Flex align="center" justify="space-between" mb={3}>
        <Text fontSize="12px" fontWeight={700} letterSpacing="0.08em" textTransform="uppercase" color={GRAY500}>
          {label}
        </Text>
        <Box w="10px" h="10px" borderRadius="full" bg={color} />
      </Flex>
      <Box
        display="inline-flex"
        alignItems="center"
        px="12px"
        py="6px"
        borderRadius="999px"
        fontSize="12px"
        fontWeight={700}
        color={color}
        bg={bg}
      >
        {formatHours(value)}
      </Box>
    </Box>
  )
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
        Your shared time activity will appear here once you start completing exchanges with other members.
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
  const [activeAgreements, setActiveAgreements] = useState<ExpectedAgreement[]>([])
  const [summary, setSummary] = useState<TransactionSummary>(EMPTY_SUMMARY)
  const [direction, setDirection] = useState<TransactionDirection>('all')
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / PAGE_SIZE)), [count])
  const exportDisabled = isLoading || isExporting || transactions.length === 0
  const previousDisabled = page === 1
  const nextDisabled = page >= totalPages
  const currentUserName = useMemo(
    () => `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim(),
    [user?.first_name, user?.last_name],
  )
  const expectedBalance = useMemo(
    () => summary.current_balance + activeAgreements.reduce((sum, item) => sum + item.expected_delta, 0),
    [summary.current_balance, activeAgreements],
  )

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

  const fetchActiveAgreements = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++agreementRequestIdRef.current

    try {
      const handshakes = await handshakeAPI.list(signal)
      if (requestId !== agreementRequestIdRef.current) return

      const nextAgreements = handshakes
        .filter((handshake) => ACTIVE_HANDSHAKE_STATUSES.has(handshake.status))
        .map((handshake) => toExpectedAgreement(handshake, currentUserName))
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
  }, [currentUserName])

  useEffect(() => {
    const controller = new AbortController()
    fetchTransactions(controller.signal)
    return () => controller.abort()
  }, [fetchTransactions])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    fetchActiveAgreements(controller.signal)
    return () => controller.abort()
  }, [fetchActiveAgreements, user])

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

      const headers = ['Date', 'Counterpart', 'Service', 'Type', 'Amount', 'Running Balance', 'Description']
      const rows = allRows.map((transaction) => ([
        formatDate(transaction.created_at),
        counterpartName(transaction),
        transaction.service_title ?? '',
        transaction.transaction_type_display,
        formatAmount(transaction.amount),
        formatHours(transaction.balance_after),
        transaction.description.replace(/\s+/g, ' ').trim(),
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
  }, [direction])

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
              A shared record of the time you have received and shared with the community.
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

        <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }} gap={4} mb={6}>
          <SummaryCard label="Time Available" value={summary.current_balance} color={PURPLE} bg={PURPLE_LT} />
          <SummaryCard label="Upcoming Time" value={expectedBalance} color={BLUE} bg={BLUE_LT} />
          <SummaryCard label="Time Received" value={summary.total_earned} color={GREEN} bg={GREEN_LT} />
          <SummaryCard label="Time Shared" value={summary.total_spent} color={RED} bg={RED_LT} />
        </Grid>

        {activeAgreements.length > 0 && (
          <Box borderRadius="20px" border={`1px solid ${BLUE}20`} bg={WHITE} mb={5} overflow="hidden">
            <Flex
              px={{ base: 4, md: 5 }}
              py={{ base: 4, md: 4 }}
              justify="space-between"
              align={{ base: 'flex-start', md: 'center' }}
              direction={{ base: 'column', md: 'row' }}
              gap={3}
              bg={BLUE_LT}
              borderBottom={`1px solid ${GRAY200}`}
            >
              <Box>
                <Text fontSize="15px" fontWeight={800} color={GRAY900} mb={1}>
                  Active Agreements
                </Text>
                <Text fontSize="12px" color={GRAY600}>
                  Ongoing accepted exchanges. Reserved hours are already reflected in your available time; only pending incoming time increases your upcoming time.
                </Text>
              </Box>
              <Box px="10px" py="5px" borderRadius="999px" bg={WHITE} color={BLUE} fontSize="12px" fontWeight={700}>
                {activeAgreements.reduce((sum, item) => sum + item.expected_delta, 0) > 0
                  ? `Upcoming +${formatHours(activeAgreements.reduce((sum, item) => sum + item.expected_delta, 0))}`
                  : 'No upcoming time'}
              </Box>
            </Flex>

            <Box px={{ base: 4, md: 5 }} py={{ base: 2, md: 3 }}>
              {activeAgreements.map((agreement, index) => (
                <Flex
                  key={agreement.id}
                  align={{ base: 'flex-start', md: 'center' }}
                  justify="space-between"
                  direction={{ base: 'column', md: 'row' }}
                  gap={3}
                  py={3}
                  borderTop={index === 0 ? 'none' : `1px solid ${GRAY100}`}
                >
                  {(() => {
                    const accent = roleAccent(agreement.is_current_user_provider)
                    const Icon = accent.icon

                    return (
                      <Flex align="center" gap={3} minW={0}>
                        <Box p="9px" borderRadius="12px" bg={accent.bg} color={accent.color}>
                          <Icon size={16} />
                        </Box>
                        <Flex align="center" gap={2} minW={0}>
                          {agreement.counterpart_avatar_url ? (
                            <Avatar.Root size="xs">
                              <Avatar.Image src={agreement.counterpart_avatar_url} alt={agreement.counterpart_name} />
                              <Avatar.Fallback name={agreement.counterpart_name} />
                            </Avatar.Root>
                          ) : (
                            <Box p="5px" borderRadius="full" bg={GRAY100} color={GRAY500}><FiUser size={12} /></Box>
                          )}
                          <Box minW={0}>
                            <Text fontSize="13px" fontWeight={700} color={GRAY800} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                              {agreement.service_title}
                            </Text>
                            <Text fontSize="11px" color={GRAY500}>
                              With {agreement.counterpart_name} · {serviceMeta(agreement.service_type, agreement.is_current_user_provider)} · {activeHandshakeLabel(agreement.status)}
                            </Text>
                          </Box>
                        </Flex>
                      </Flex>
                    )
                  })()}

                  <Flex
                    align={{ base: 'flex-start', md: 'center' }}
                    gap={{ base: 2, md: 4 }}
                    direction={{ base: 'column', md: 'row' }}
                    flexShrink={0}
                  >
                    <Box textAlign={{ base: 'left', md: 'right' }}>
                      <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase">Upcoming</Text>
                      <Text fontSize="13px" fontWeight={800} color={agreement.expected_delta > 0 ? GREEN : GRAY700}>
                        {agreement.expected_delta > 0 ? formatAmount(agreement.expected_delta) : 'No additional change'}
                      </Text>
                    </Box>
                  </Flex>
                </Flex>
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
            {count === 0 ? '0 entries' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
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
        ) : transactions.length === 0 ? (
          <Box borderRadius="24px" border={`1px solid ${GRAY200}`} bg={WHITE}>
            <EmptyLedgerIllustration />
          </Box>
        ) : (
          <Box borderRadius="24px" border={`1px solid ${GRAY200}`} bg={WHITE} overflow="hidden">
            <Box display={{ base: 'none', md: 'block' }} px={6} py={4} bg={GRAY50} borderBottom={`1px solid ${GRAY200}`}>
              <Grid templateColumns="180px 220px minmax(220px, 1fr) 140px 140px" gap={4}>
                {['Date', 'Counterpart', 'Service', 'Time', 'Time Available'].map((label) => (
                  <Text key={label} fontSize="11px" fontWeight={800} color={GRAY500} textTransform="uppercase" letterSpacing="0.08em">
                    {label}
                  </Text>
                ))}
              </Grid>
            </Box>

            <Box>
              {transactions.map((transaction, index) => {
                const tone = amountTone(transaction.amount)
                const accent = transactionAccent(transaction)
                const Icon = accent.icon
                const name = counterpartName(transaction)

                return (
                  <Box
                    key={transaction.id}
                    px={{ base: 4, md: 6 }}
                    py={{ base: 4, md: 5 }}
                    borderTop={index === 0 ? 'none' : `1px solid ${GRAY100}`}
                  >
                    <Box display={{ base: 'block', md: 'none' }}>
                      <Flex justify="space-between" align="flex-start" gap={3} mb={3}>
                        <Flex align="center" gap={3}>
                          <Box p="9px" borderRadius="12px" bg={accent.bg} color={accent.color}>
                            <Icon size={16} />
                          </Box>
                          <Box>
                            <Text fontSize="14px" fontWeight={700} color={GRAY800}>{transaction.service_title ?? transaction.transaction_type_display}</Text>
                            <Text fontSize="12px" color={GRAY500}>
                              {formatDate(transaction.created_at)} · {accent.stateLabel}
                            </Text>
                          </Box>
                        </Flex>
                        <Box px="10px" py="6px" borderRadius="999px" bg={tone.bg} color={tone.color} fontSize="12px" fontWeight={800}>
                          {formatAmount(transaction.amount)}
                        </Box>
                      </Flex>

                      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
                        <Box>
                          <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" mb={1}>Counterpart</Text>
                          <Flex align="center" gap={2}>
                            {transaction.counterpart ? (
                              <Avatar.Root size="xs">
                                <Avatar.Image src={transaction.counterpart.avatar_url ?? undefined} alt={name} />
                                <Avatar.Fallback name={name} />
                              </Avatar.Root>
                            ) : (
                              <Box p="5px" borderRadius="full" bg={GRAY100} color={GRAY500}><FiUser size={12} /></Box>
                            )}
                            <Text fontSize="13px" color={GRAY700}>{name}</Text>
                          </Flex>
                        </Box>
                        <Box>
                          <Text fontSize="11px" color={GRAY400} fontWeight={700} textTransform="uppercase" mb={1}>Time Available</Text>
                          <Text fontSize="13px" fontWeight={700} color={GRAY800}>{formatHours(transaction.balance_after)}</Text>
                        </Box>
                      </Grid>

                      <Text fontSize="12px" color={GRAY500} mt={3}>{transaction.description}</Text>
                      <Text fontSize="11px" color={GRAY500} mt={1}>
                        {serviceMeta(transaction.service_type, transaction.is_current_user_provider)}
                      </Text>
                    </Box>

                    <Grid display={{ base: 'none', md: 'grid' }} templateColumns="180px 220px minmax(220px, 1fr) 140px 140px" gap={4} alignItems="center">
                      <Box>
                        <Text fontSize="13px" fontWeight={600} color={GRAY800}>{formatDate(transaction.created_at)}</Text>
                        <Text fontSize="11px" color={GRAY500} mt={1}>{accent.stateLabel}</Text>
                      </Box>

                      <Flex align="center" gap={3}>
                        <Box p="9px" borderRadius="12px" bg={accent.bg} color={accent.color}>
                          <Icon size={16} />
                        </Box>
                        <Flex align="center" gap={2} minW={0}>
                          {transaction.counterpart ? (
                            <Avatar.Root size="xs">
                              <Avatar.Image src={transaction.counterpart.avatar_url ?? undefined} alt={name} />
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
                              {transaction.counterpart?.email ?? 'System entry'}
                            </Text>
                          </Box>
                        </Flex>
                      </Flex>

                      <Box minW={0}>
                        <Text fontSize="13px" fontWeight={700} color={GRAY800} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                          {transaction.service_title ?? 'Manual adjustment'}
                        </Text>
                        <Text fontSize="11px" color={GRAY500} mt={1} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                          {serviceMeta(transaction.service_type, transaction.is_current_user_provider)}
                        </Text>
                        <Text fontSize="11px" color={GRAY500} mt={1} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                          {transaction.description}
                        </Text>
                      </Box>

                      <Text fontSize="14px" fontWeight={800} color={tone.color}>
                        {formatAmount(transaction.amount)}
                      </Text>

                      <Text fontSize="14px" fontWeight={700} color={GRAY800}>
                        {formatHours(transaction.balance_after)}
                      </Text>
                    </Grid>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}

        {!isLoading && !error && transactions.length > 0 && (
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
    </Box>
  )
}

export default TransactionHistoryPage
