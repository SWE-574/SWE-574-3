import { useEffect, useRef, useState } from 'react'
import { Box, Flex, Spinner, Text } from '@chakra-ui/react'
import {
  format,
  addDays,
} from 'date-fns'
import { calendarAPI } from '@/services/calendarAPI'
import { useAuthStore } from '@/store/useAuthStore'
import type { CalendarResponse } from '@/types'
import SectionCard from '@/components/ui/SectionCard'
import CalendarMonthGrid from '@/components/profile/CalendarMonthGrid'
import AgendaList from '@/components/profile/AgendaList'
import EyebrowLabel from '@/components/ui/EyebrowLabel'
import {
  GREEN, GREEN_LT, GRAY200, GRAY700, WHITE,
} from '@/theme/tokens'

// The max number of days ahead the calendar fetches (and navigation is capped to).
const CALENDAR_WINDOW_DAYS = 365
const HISTORY_START_DATE = '2020-01-01'

// No external props — this component owns its own data fetch
const UpcomingSchedule = () => {
  const [data, setData] = useState<CalendarResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date())
  const [currentMonth] = useState<Date>(new Date())
  const user = useAuthStore((state) => state.user)
  // The last date reachable in the calendar — today + CALENDAR_WINDOW_DAYS.
  // Navigation past this boundary is disabled.
  const maxDate = addDays(new Date(), CALENDAR_WINDOW_DAYS)

  const abortRef = useRef<AbortController | null>(null)

  const fetchData = async (from: string, to: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const result = await calendarAPI.fetchUpcoming({ from, to }, controller.signal)
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
    const from = user?.date_joined
      ? format(new Date(Math.min(new Date(user.date_joined).getTime(), new Date(HISTORY_START_DATE).getTime())), 'yyyy-MM-dd')
      : HISTORY_START_DATE
    const to = format(addDays(new Date(), CALENDAR_WINDOW_DAYS), 'yyyy-MM-dd')
    void fetchData(from, to)

    return () => {
      abortRef.current?.abort()
    }
  }, [user?.date_joined])

  const items = data?.items ?? []
  const conflicts = data?.conflicts ?? []
  const showCalendar = selectedDate !== null

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
    <SectionCard
      mb={0}
      h={{ base: 'auto', xl: '100%' }}
      maxH={{ base: 'none', xl: '100%' }}
      overflow="hidden"
    >
      <Flex
        direction="column"
        gap={3}
        h="100%"
        maxH="100%"
        overflow="hidden"
      >
        {showCalendar ? (
          <CalendarMonthGrid
            items={items}
            conflicts={conflicts}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            initialMonth={currentMonth}
            maxDate={maxDate}
          />
        ) : (
          <Flex align="center" justify="space-between" gap={3}>
            <Box
              as="button"
              aria-label="Show upcoming schedule"
              px="12px"
              py="9px"
              borderRadius="12px"
              fontSize="12px"
              fontWeight={800}
              style={{
                background: GREEN,
                border: 'none',
                cursor: 'default',
                color: WHITE,
              }}
            >
              Upcoming
            </Box>
            <Box
              as="button"
              aria-label="Go to today"
              onClick={() => setSelectedDate(new Date())}
              px="14px"
              py="9px"
              borderRadius="12px"
              fontSize="13px"
              fontWeight={700}
              style={{
                background: GREEN_LT,
                border: `1px solid ${GRAY200}`,
                cursor: 'pointer',
                color: GRAY700,
              }}
            >
              Today
            </Box>
          </Flex>
        )}
        <Box flex={1} minH={0} overflow="hidden" pr={{ base: 0, xl: 1 }}>
          <AgendaList
            items={items}
            conflicts={conflicts}
            selectedDate={selectedDate}
          />
        </Box>
      </Flex>
    </SectionCard>
  )
}

export default UpcomingSchedule
