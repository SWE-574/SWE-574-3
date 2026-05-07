import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiChevronRight, FiChevronLeft, FiAlertTriangle } from 'react-icons/fi'
import { format, parseISO, isSameDay } from 'date-fns'
import type { CalendarItem, CalendarConflict } from '@/types'
import {
  groupItemsByAgenda,
  itemAccentColor,
  conflictMap,
  formatItemRange,
  itemLinkTo,
  type AgendaGroupKey,
} from '@/utils/calendarItems'
import { AMBER, GREEN, GREEN_LT, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800, WHITE } from '@/theme/tokens'

type Props = {
  items: CalendarItem[]
  conflicts: CalendarConflict[]
  selectedDate?: Date | null
}

const GROUP_LABELS: Record<AgendaGroupKey, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  later: 'Later',
}

const AVATAR_PALETTE = ['#2D5C4E', '#1D4ED8', '#7C3AED', '#D97706', '#0D9488', '#EA580C']
const SELECTED_DAY_PAGE_SIZE = 2
const UPCOMING_PAGE_SIZE = 3
const AGENDA_CARD_HEIGHT = 78

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function AgendaItemCard({
  item,
  cmap,
}: {
  item: CalendarItem
  cmap: Map<string, string[]>
}) {
  const isConflict = cmap.has(item.id)
  const colors = itemAccentColor(item.accent_token)
  const to = itemLinkTo(item)

  const counterpartInitial = item.counterpart
    ? getInitials(item.counterpart.name)
    : null
  const avatarBg = item.counterpart
    ? AVATAR_PALETTE[item.counterpart.name.charCodeAt(0) % AVATAR_PALETTE.length]
    : AVATAR_PALETTE[0]

  return (
    <Link
      to={to}
      style={{ display: 'block', textDecoration: 'none' }}
    >
      <Box
        borderRadius="12px"
        overflow="hidden"
        h={`${AGENDA_CARD_HEIGHT}px`}
        style={{
          border: `1px solid ${GRAY200}`,
          background: WHITE,
          boxShadow: isConflict ? `inset 0 0 0 1px ${AMBER}30` : 'none',
          transition: 'box-shadow 0.15s, border-color 0.15s',
        }}
      >
        <Flex align="stretch" h="100%">
          {/* Accent strip */}
          <Box
            w="4px"
            flexShrink={0}
            style={{ background: colors.strip }}
          />

          {/* Content */}
          <Flex flex={1} align="center" gap={3} px={3} py="8px">
            <Box flex={1} minW={0}>
              <Flex align="center" justify="space-between" gap={2}>
                <Text
                  fontSize="13px"
                  fontWeight={800}
                  color={GRAY800}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {item.title}
                </Text>
                {isConflict && (
                  <Flex align="center" gap="4px" flexShrink={0} px="6px" py="2px" borderRadius="999px" bg={GRAY100}>
                    <FiAlertTriangle size={10} color={AMBER} />
                    <Text fontSize="10px" style={{ color: AMBER }} fontWeight={800}>
                      Conflict
                    </Text>
                  </Flex>
                )}
              </Flex>

              <Flex align="center" gap="6px" mt="6px" minW={0}>
                {item.counterpart && (
                  <>
                  {/* No nested link — the whole card is already an <a>; just show avatar + name */}
                  {item.counterpart.avatar_url ? (
                    <Box
                      w="18px"
                      h="18px"
                      borderRadius="full"
                      overflow="hidden"
                      flexShrink={0}
                    >
                      <img
                        src={item.counterpart.avatar_url}
                        alt={item.counterpart.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </Box>
                  ) : (
                    <Flex
                      w="20px"
                      h="20px"
                      borderRadius="full"
                      flexShrink={0}
                      align="center"
                      justify="center"
                      style={{ background: avatarBg, color: WHITE, fontSize: '9px', fontWeight: 700 }}
                    >
                      {counterpartInitial}
                    </Flex>
                  )}
                  <Text fontSize="11px" color={GRAY500} flexShrink={0}>
                    {item.counterpart.name}
                  </Text>
                  <Text fontSize="11px" color={GRAY400} flexShrink={0}>·</Text>
                  </>
                )}
                <Text fontSize="11px" color={GRAY500}>
                  {formatItemRange(item)}
                </Text>
              </Flex>

              <Flex align="center" gap="6px" mt="4px" flexWrap="wrap">
                {item.location_type && (
                  <Box
                    px="6px"
                    py="1px"
                    borderRadius="4px"
                    fontSize="10px"
                    fontWeight={600}
                    style={{ background: GRAY100, color: GRAY700 }}
                  >
                    {item.location_label
                      ? `${item.location_type} · ${item.location_label}`
                      : item.location_type}
                  </Box>
                )}
              </Flex>
            </Box>

            <Box style={{ color: GRAY400 }} flexShrink={0}>
              <FiChevronRight size={16} />
            </Box>
          </Flex>
        </Flex>
      </Box>
    </Link>
  )
}

const AgendaList = ({ items, conflicts, selectedDate }: Props) => {
  // MINOR 1: memoize heavy computations so selectedDate clicks don't recompute
  const cmap = useMemo(() => conflictMap(conflicts), [conflicts])
  const [selectedDayPage, setSelectedDayPage] = useState(0)
  const [upcomingPage, setUpcomingPage] = useState(0)

  const dayItems = useMemo(() => {
    if (selectedDate === undefined || selectedDate === null) return []
    return items
      .filter((item) => isSameDay(parseISO(item.start), selectedDate))
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
  }, [items, selectedDate])

  const pageCount = Math.max(1, Math.ceil(dayItems.length / SELECTED_DAY_PAGE_SIZE))
  const safePage = Math.min(selectedDayPage, pageCount - 1)
  const pagedDayItems = dayItems.slice(
    safePage * SELECTED_DAY_PAGE_SIZE,
    safePage * SELECTED_DAY_PAGE_SIZE + SELECTED_DAY_PAGE_SIZE,
  )
  // MINOR 1: memoize grouping so it doesn't rerun on selectedDate changes
  const groups = useMemo(() => groupItemsByAgenda(items), [items])
  const hasAnyItems = (Object.keys(groups) as AgendaGroupKey[]).some(
    (key) => groups[key].length > 0,
  )
  const upcomingEntries = useMemo(
    () => (Object.entries(groups) as [AgendaGroupKey, CalendarItem[]][])
      .flatMap(([key, groupItems]) => groupItems.map((item) => ({ key, item }))),
    [groups],
  )
  const upcomingPageCount = Math.max(1, Math.ceil(upcomingEntries.length / UPCOMING_PAGE_SIZE))
  const safeUpcomingPage = Math.min(upcomingPage, upcomingPageCount - 1)
  const pagedUpcomingEntries = upcomingEntries.slice(
    safeUpcomingPage * UPCOMING_PAGE_SIZE,
    safeUpcomingPage * UPCOMING_PAGE_SIZE + UPCOMING_PAGE_SIZE,
  )

  if (selectedDate !== undefined && selectedDate !== null) {
    return (
      <Box h="100%" minH={0} display="flex" flexDirection="column">
        <Flex align="center" justify="space-between" gap={3} mb={3}>
          <Text
            fontSize="12px"
            fontWeight={700}
            color={GRAY500}
            letterSpacing="0.08em"
            textTransform="uppercase"
          >
            {format(selectedDate, 'EEEE, d MMM')}
          </Text>
          {dayItems.length > SELECTED_DAY_PAGE_SIZE && (
            <Flex align="center" gap={2}>
              <Text fontSize="11px" fontWeight={700} color={GRAY500}>
                {safePage + 1} / {pageCount}
              </Text>
              <Box
                as="button"
                aria-label="Previous schedule page"
                onClick={() => setSelectedDayPage((page) => Math.max(0, page - 1))}
                w="28px"
                h="28px"
                borderRadius="9px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                style={{
                  border: `1px solid ${GRAY200}`,
                  background: WHITE,
                  color: safePage === 0 ? GRAY400 : GRAY700,
                  cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                  opacity: safePage === 0 ? 0.5 : 1,
                }}
              >
                <FiChevronLeft size={14} />
              </Box>
              <Box
                as="button"
                aria-label="Next schedule page"
                onClick={() => setSelectedDayPage((page) => Math.min(pageCount - 1, page + 1))}
                w="28px"
                h="28px"
                borderRadius="9px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                style={{
                  border: `1px solid ${GREEN_LT}`,
                  background: GREEN_LT,
                  color: safePage >= pageCount - 1 ? GRAY400 : GREEN,
                  cursor: safePage >= pageCount - 1 ? 'not-allowed' : 'pointer',
                  opacity: safePage >= pageCount - 1 ? 0.5 : 1,
                }}
              >
                <FiChevronRight size={14} />
              </Box>
            </Flex>
          )}
        </Flex>

        <Flex flex={1} minH={0} overflow="hidden" direction="column" gap={3}>
          {dayItems.length === 0 ? (
            <Box textAlign="center" py={6}>
              <Text fontSize="13px" color={GRAY400}>
                Nothing scheduled on this day.
              </Text>
            </Box>
          ) : (
            pagedDayItems.map((item) => (
              <AgendaItemCard key={item.id} item={item} cmap={cmap} />
            ))
          )}
        </Flex>
      </Box>
    )
  }

  if (!hasAnyItems) {
    return (
      <Box textAlign="center" py={8}>
        <Text fontSize="32px" mb={3}>
          📅
        </Text>
        <Text fontSize="14px" fontWeight={600} color={GRAY700} mb={2}>
          Nothing on your calendar yet.
        </Text>
        <Text fontSize="13px" color={GRAY400} maxW="260px" mx="auto">
          Accept an exchange or join an event to get started.
        </Text>
      </Box>
    )
  }

  return (
    <Box h="100%" minH={0} display="flex" flexDirection="column">
      <Flex align="center" justify="space-between" gap={3} mb={3} flexShrink={0}>
        <Text
          fontSize="12px"
          fontWeight={800}
          color={GRAY500}
          letterSpacing="0.1em"
          textTransform="uppercase"
        >
          Upcoming
        </Text>
        {upcomingPageCount > 1 && (
          <Flex align="center" gap={2}>
            <Text fontSize="11px" fontWeight={700} color={GRAY500}>
              {safeUpcomingPage + 1} / {upcomingPageCount}
            </Text>
            <Box
              as="button"
              aria-label="Previous upcoming page"
              onClick={() => setUpcomingPage((page) => Math.max(0, page - 1))}
              w="28px"
              h="28px"
              borderRadius="9px"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              style={{
                border: `1px solid ${GRAY200}`,
                background: WHITE,
                color: safeUpcomingPage === 0 ? GRAY400 : GRAY700,
                cursor: safeUpcomingPage === 0 ? 'not-allowed' : 'pointer',
                opacity: safeUpcomingPage === 0 ? 0.5 : 1,
              }}
            >
              <FiChevronLeft size={14} />
            </Box>
            <Box
              as="button"
              aria-label="Next upcoming page"
              onClick={() => setUpcomingPage((page) => Math.min(upcomingPageCount - 1, page + 1))}
              w="28px"
              h="28px"
              borderRadius="9px"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              style={{
                border: `1px solid ${GREEN_LT}`,
                background: GREEN_LT,
                color: safeUpcomingPage >= upcomingPageCount - 1 ? GRAY400 : GREEN,
                cursor: safeUpcomingPage >= upcomingPageCount - 1 ? 'not-allowed' : 'pointer',
                opacity: safeUpcomingPage >= upcomingPageCount - 1 ? 0.5 : 1,
              }}
            >
              <FiChevronRight size={14} />
            </Box>
          </Flex>
        )}
      </Flex>

      <Flex flex={1} minH={0} overflow="hidden" direction="column" gap={3}>
        {pagedUpcomingEntries.map(({ key, item }, index) => {
          const showHeader = index === 0 || pagedUpcomingEntries[index - 1].key !== key
          return (
            <Box key={item.id}>
              <Box
                display={showHeader ? 'block' : 'none'}
                bg={WHITE}
                pb={2}
              >
                <Text
                  fontSize="11px"
                  fontWeight={800}
                  color={GRAY500}
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                >
                  {GROUP_LABELS[key]}
                </Text>
              </Box>
              <AgendaItemCard item={item} cmap={cmap} />
            </Box>
          )
        })}
      </Flex>
    </Box>
  )
}

export default AgendaList
