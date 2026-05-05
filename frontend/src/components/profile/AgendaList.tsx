import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Box, Flex, Text } from '@chakra-ui/react'
import { FiChevronRight, FiAlertTriangle } from 'react-icons/fi'
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
import { AMBER, GRAY100, GRAY200, GRAY400, GRAY500, GRAY700, GRAY800, WHITE } from '@/theme/tokens'

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
      style={{ display: 'block', textDecoration: 'none', marginBottom: '8px' }}
    >
      <Box
        borderRadius="10px"
        overflow="hidden"
        style={{
          border: isConflict ? `1.5px solid ${AMBER}` : `1px solid ${GRAY200}`,
          background: WHITE,
          transition: 'box-shadow 0.15s',
        }}
      >
        <Flex align="stretch">
          {/* Accent strip */}
          <Box
            w="4px"
            flexShrink={0}
            style={{ background: colors.strip }}
          />

          {/* Content */}
          <Flex flex={1} align="center" gap={3} px={3} py="10px">
            <Box flex={1} minW={0}>
              <Text
                fontSize="13px"
                fontWeight={700}
                color={GRAY800}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {item.title}
              </Text>

              {item.counterpart && (
                <Flex align="center" gap="6px" mt="4px">
                  {/* No nested link — the whole card is already an <a>; just show avatar + name */}
                  {item.counterpart.avatar_url ? (
                    <Box
                      w="20px"
                      h="20px"
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
                  <Text fontSize="11px" color={GRAY500}>
                    {item.counterpart.name}
                  </Text>
                </Flex>
              )}

              <Flex align="center" gap="6px" mt="4px" flexWrap="wrap">
                <Text fontSize="11px" color={GRAY500}>
                  {formatItemRange(item)}
                </Text>
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

              {isConflict && (
                <Flex align="center" gap="4px" mt="4px">
                  <Box style={{ color: AMBER }} display="flex" alignItems="center">
                    <FiAlertTriangle size={11} />
                  </Box>
                  <Text fontSize="10px" style={{ color: AMBER }} fontWeight={600}>
                    Schedule conflict
                  </Text>
                </Flex>
              )}
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

  if (selectedDate !== undefined && selectedDate !== null) {
    const dayItems = items.filter((item) => isSameDay(parseISO(item.start), selectedDate))

    return (
      <Box>
        <Text
          fontSize="12px"
          fontWeight={700}
          color={GRAY500}
          letterSpacing="0.08em"
          textTransform="uppercase"
          mb={3}
        >
          {format(selectedDate, 'EEEE, d MMM')}
        </Text>

        {dayItems.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Text fontSize="13px" color={GRAY400}>
              Nothing scheduled on this day.
            </Text>
          </Box>
        ) : (
          dayItems.map((item) => (
            <AgendaItemCard key={item.id} item={item} cmap={cmap} />
          ))
        )}
      </Box>
    )
  }

  // MINOR 1: memoize grouping so it doesn't rerun on selectedDate changes
  const groups = useMemo(() => groupItemsByAgenda(items), [items])
  const hasAnyItems = (Object.keys(groups) as AgendaGroupKey[]).some(
    (key) => groups[key].length > 0,
  )

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
    <Box>
      {(Object.entries(groups) as [AgendaGroupKey, CalendarItem[]][]).map(([key, groupItems]) => {
        if (groupItems.length === 0) return null

        return (
          <Box key={key} mb={4}>
            <Box
              position="sticky"
              top={0}
              bg={WHITE}
              zIndex={1}
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
            {groupItems.map((item) => (
              <AgendaItemCard key={item.id} item={item} cmap={cmap} />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export default AgendaList
