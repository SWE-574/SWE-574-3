import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import { FiAlertCircle, FiCheckCircle, FiClock, FiXCircle } from 'react-icons/fi'
import { userAPI, type MyReport, type MyReportStatus } from '@/services/userAPI'
import {
  AMBER, AMBER_LT, BLUE, BLUE_LT, GRAY100, GRAY200, GRAY400,
  GRAY500, GRAY600, GRAY700, GRAY800, GRAY900, GREEN, GREEN_LT, WHITE,
} from '@/theme/tokens'

type StatusFilter = 'all' | MyReportStatus

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'dismissed', label: 'Dismissed' },
]

function statusStyle(status: MyReportStatus) {
  if (status === 'pending') return { fg: AMBER, bg: AMBER_LT, Icon: FiClock }
  if (status === 'resolved') return { fg: GREEN, bg: GREEN_LT, Icon: FiCheckCircle }
  return { fg: BLUE, bg: BLUE_LT, Icon: FiXCircle }
}

function targetHref(report: MyReport): string | null {
  if (!report.target_id) return null
  switch (report.target_kind) {
    case 'service':
      return `/service-detail/${report.target_id}`
    case 'forum_topic':
      return `/forum/topic/${report.target_id}`
    case 'forum_post':
      return `/forum/topic/${report.target_id}`
    case 'user':
      return `/public-profile/${report.target_id}`
    default:
      return null
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function MyReports() {
  const [reports, setReports] = useState<MyReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    const ac = new AbortController()
    setError(null)
    userAPI.getMyReports(ac.signal)
      .then(setReports)
      .catch((err) => {
        if (ac.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load reports')
        setReports([])
      })
    return () => ac.abort()
  }, [])

  const visible = useMemo(() => {
    if (!reports) return []
    return filter === 'all' ? reports : reports.filter((r) => r.status === filter)
  }, [reports, filter])

  const counts = useMemo(() => {
    const out = { pending: 0, resolved: 0, dismissed: 0 }
    for (const r of reports ?? []) out[r.status]++
    return out
  }, [reports])

  return (
    <Box maxW="900px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 4, md: 8 }}>
      <Flex direction="column" gap={1} mb={6}>
        <Text fontSize="22px" fontWeight={700} color={GRAY900}>Your reports</Text>
        <Text fontSize="13px" color={GRAY500}>
          What you've submitted, and where moderators landed on it.
        </Text>
      </Flex>

      <Flex gap={2} mb={5} wrap="wrap">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key
          const count = key === 'all'
            ? (reports?.length ?? 0)
            : counts[key as MyReportStatus]
          return (
            <Box
              as="button"
              key={key}
              onClick={() => setFilter(key)}
              px="14px"
              py="7px"
              borderRadius="8px"
              fontSize="12px"
              fontWeight={500}
              style={{
                background: active ? GRAY900 : WHITE,
                color: active ? WHITE : GRAY700,
                border: `1px solid ${active ? GRAY900 : GRAY200}`,
                cursor: 'pointer',
              }}
            >
              {label}
              {count > 0 && (
                <Text as="span" ml="6px" color={active ? GRAY200 : GRAY400} fontSize="11px">
                  {count}
                </Text>
              )}
            </Box>
          )
        })}
      </Flex>

      {reports === null && (
        <Flex minH="200px" justify="center" align="center"><Spinner /></Flex>
      )}

      {reports !== null && error && (
        <Flex
          align="center" gap={2} px={4} py={3}
          borderRadius="10px"
          style={{ background: AMBER_LT, border: `1px solid ${AMBER}`, color: GRAY800 }}
        >
          <FiAlertCircle />
          <Text fontSize="13px">{error}</Text>
        </Flex>
      )}

      {reports !== null && !error && visible.length === 0 && (
        <Flex
          minH="160px" justify="center" align="center" direction="column" gap={2}
          borderRadius="12px"
          style={{ background: GRAY100, border: `1px dashed ${GRAY200}` }}
        >
          <Text fontSize="14px" color={GRAY600}>No reports here yet.</Text>
          <Text fontSize="12px" color={GRAY400}>
            When you flag something, you'll see its progress on this page.
          </Text>
        </Flex>
      )}

      <Flex direction="column" gap={3}>
        {visible.map((r) => {
          const { fg, bg, Icon } = statusStyle(r.status)
          const href = targetHref(r)
          return (
            <Box
              key={r.id}
              p={4}
              borderRadius="12px"
              style={{ background: WHITE, border: `1px solid ${GRAY200}` }}
            >
              <Flex justify="space-between" align="flex-start" gap={3}>
                <Box flex={1} minW={0}>
                  <Flex align="center" gap={2} mb={1}>
                    <Text fontSize="14px" fontWeight={600} color={GRAY900}>
                      {r.type_display}
                    </Text>
                    <Text fontSize="11px" color={GRAY400}>·</Text>
                    <Text fontSize="12px" color={GRAY500}>{formatDate(r.created_at)}</Text>
                  </Flex>
                  {r.target_summary && (
                    <Text fontSize="13px" color={GRAY700} mb={1}>
                      {href ? (
                        <RouterLink to={href} style={{ color: GRAY700, textDecoration: 'underline' }}>
                          {r.target_summary}
                        </RouterLink>
                      ) : r.target_summary}
                    </Text>
                  )}
                  {r.description && (
                    <Text fontSize="12px" color={GRAY500} lineHeight={1.55}>
                      {r.description}
                    </Text>
                  )}
                </Box>
                <Flex
                  align="center" gap={1.5}
                  px="10px" py="6px"
                  borderRadius="8px"
                  style={{ background: bg, color: fg, border: `1px solid ${fg}33` }}
                >
                  <Icon size={12} />
                  <Text fontSize="11px" fontWeight={600} textTransform="uppercase" letterSpacing="0.04em">
                    {r.status_display}
                  </Text>
                </Flex>
              </Flex>
            </Box>
          )
        })}
      </Flex>
    </Box>
  )
}
