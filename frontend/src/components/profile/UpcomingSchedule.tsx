import { useEffect, useRef, useState } from 'react'
import { Box, Flex, Grid, Spinner, Text } from '@chakra-ui/react'
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday as isTodayFn,
  isSameDay,
  parseISO,
} from 'date-fns'
import { FiChevronUp, FiArrowRight } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { calendarAPI } from '@/services/calendarAPI'
import type { CalendarResponse } from '@/types'
import { itemAccentColor, nextNItems, formatItemRange, itemLinkTo } from '@/utils/calendarItems'
import SectionCard from '@/components/ui/SectionCard'
import CalendarMonthGrid from '@/components/profile/CalendarMonthGrid'
import AgendaList from '@/components/profile/AgendaList'
import EyebrowLabel from '@/components/ui/EyebrowLabel'
import {
  GREEN, GREEN_LT, GRAY100, GRAY200, GRAY500, GRAY800, WHITE,
} from '@/theme/tokens'

// The max number of days ahead the calendar fetches (and navigation is capped to).
const CALENDAR_WINDOW_DAYS = 60

// No external props — this component owns its own data fetch
const UpcomingSchedule = () => {
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [currentMonth] = useState<Date>(new Date())
  // The last date reachable in the calendar — today + CALENDAR_WINDOW_DAYS.
  // Navigation past this boundary is disabled.
  const maxDate = addDays(new Date(), CALENDAR_WINDOW_DAYS)

  const abortRef = useRef<AbortController | null>(null)
  const cacheRef = useRef<Record<string, CalendarResponse>>({})

  const fetchData = async (from: string, to: string) => {
    const key = `${from}|${to}`
    if (cacheRef.current[key]) {
      // MINOR 2: abort any in-flight request before returning cached data
      abortRef.current?.abort()
      setData(cacheRef.current[key])
      setLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const result = await calendarAPI.fetchUpcoming({ from, to }, controller.signal)
      cacheRef.current[key] = result
      setData(result)
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e.name === 'AbortError' || e.name === 'CanceledError') return
      setError('Failed to load schedule.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const to = format(addDays(new Date(), 60), 'yyyy-MM-dd')
    void fetchData(today, to)

    return () => {
      abortRef.current?.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Current week days for collapsed strip
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const items = data?.items ?? []
  const conflicts = data?.conflicts ?? []

  const nextItems = nextNItems(items, 3)

  const expandToggle = expanded ? (
    <Flex
      as="button"
      align="center"
      gap="4px"
      fontSize="12px"
      fontWeight={600}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREEN }}
      onClick={() => setExpanded(false)}
    >
      Collapse <FiChevronUp size={13} />
    </Flex>
  ) : (
    <Flex
      as="button"
      align="center"
      gap="4px"
      fontSize="12px"
      fontWeight={600}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: GREEN }}
      onClick={() => setExpanded(true)}
    >
      View calendar <FiArrowRight size={13} />
    </Flex>
  )

  if (loading) {
    return (
      <SectionCard mb={4}>
        <Flex direction="column" align="center" py={6} gap={3}>
          <Spinner size="sm" style={{ color: GREEN }} />
          <EyebrowLabel>Loading schedule</EyebrowLabel>
        </Flex>
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard mb={4}>
        <Flex direction="column" align="center" py={4} gap={2}>
          <Text fontSize="13px" color="#DC2626">
            {error}
          </Text>
          <Box
            as="button"
            px="12px"
            py="6px"
            borderRadius="8px"
            fontSize="12px"
            fontWeight={600}
            style={{ background: GREEN_LT, border: 'none', cursor: 'pointer', color: GREEN }}
            onClick={() => {
              const today = format(new Date(), 'yyyy-MM-dd')
              const to = format(addDays(new Date(), 60), 'yyyy-MM-dd')
              void fetchData(today, to)
            }}
          >
            Retry
          </Box>
        </Flex>
      </SectionCard>
    )
  }

  return (
    <SectionCard label="UPCOMING" right={expandToggle} mb={4}>
      {!expanded ? (
        /* Collapsed mode */
        <Box>
          {/* Week strip */}
          <Grid templateColumns="repeat(7, 1fr)" gap={1} mb={3}>
            {weekDays.map((day) => {
              const isSelected = selectedDate ? isSameDay(selectedDate, day) : false
              const isCurrentDay = isTodayFn(day)
              const dayItems = items.filter((item) => isSameDay(parseISO(item.start), day))

              // Deduplicate dots by accent_token
              const tokensSeen = new Set<string>()
              const dots = dayItems
                .filter((item) => {
                  if (tokensSeen.has(item.accent_token)) return false
                  tokensSeen.add(item.accent_token)
                  return true
                })
                .slice(0, 3)

              return (
                <Box
                  key={day.toISOString()}
                  as="button"
                  onClick={() => setSelectedDate(isSelected ? null : day)}
                  borderRadius="8px"
                  p="6px 4px"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  gap="3px"
                  style={{
                    background: isSelected ? GREEN : isCurrentDay ? GREEN_LT : 'transparent',
                    border: isCurrentDay && !isSelected ? `2px solid ${GREEN}` : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  <Text
                    fontSize="9px"
                    fontWeight={700}
                    letterSpacing="0.05em"
                    textTransform="uppercase"
                    color={isSelected ? WHITE : GRAY500}
                  >
                    {format(day, 'EEEEE')}
                  </Text>
                  <Text
                    fontSize="13px"
                    fontWeight={isCurrentDay || isSelected ? 700 : 400}
                    color={isSelected ? WHITE : isCurrentDay ? GREEN : GRAY800}
                  >
                    {format(day, 'd')}
                  </Text>
                  {dots.length > 0 && (
                    <Flex gap="2px">
                      {dots.map((item) => (
                        <Box
                          key={item.accent_token}
                          w="4px"
                          h="4px"
                          borderRadius="full"
                          style={{ background: isSelected ? WHITE : itemAccentColor(item.accent_token).dot }}
                        />
                      ))}
                    </Flex>
                  )}
                </Box>
              )
            })}
          </Grid>

          {/* Next 3 agenda items */}
          {nextItems.length === 0 ? (
            <AgendaList items={[]} conflicts={[]} />
          ) : (
            <Box>
              {nextItems.map((item) => {
                const colors = itemAccentColor(item.accent_token)
                const to = itemLinkTo(item)
                return (
                  <Link
                    key={item.id}
                    to={to}
                    style={{ display: 'block', textDecoration: 'none', marginBottom: '8px' }}
                  >
                    <Box
                      borderRadius="8px"
                      overflow="hidden"
                      style={{ border: `1px solid ${GRAY200}`, background: WHITE }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = GRAY100 }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = WHITE }}
                    >
                      <Flex align="center" gap={0}>
                        <Box w="3px" alignSelf="stretch" style={{ background: colors.strip, flexShrink: 0 }} />
                        <Flex align="center" gap={2} flex={1} px={3} py="8px" minW={0}>
                          <Box flex={1} minW={0}>
                            <Text
                              fontSize="12px"
                              fontWeight={600}
                              color={GRAY800}
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {item.title}
                            </Text>
                            <Text fontSize="11px" color={GRAY500}>
                              {formatItemRange(item)}
                              {item.counterpart ? ` · ${item.counterpart.name}` : ''}
                            </Text>
                          </Box>
                        </Flex>
                      </Flex>
                    </Box>
                  </Link>
                )
              })}
            </Box>
          )}
        </Box>
      ) : (
        /* Expanded mode */
        <Grid
          templateColumns={{ base: '1fr', md: '1.05fr 1.4fr' }}
          gap={5}
          alignItems="start"
        >
          <Box>
            <CalendarMonthGrid
              items={items}
              conflicts={conflicts}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              initialMonth={currentMonth}
              maxDate={maxDate}
            />
          </Box>
          <Box>
            <AgendaList
              items={items}
              conflicts={conflicts}
              selectedDate={selectedDate}
            />
          </Box>
        </Grid>
      )}
    </SectionCard>
  )
}

export default UpcomingSchedule
