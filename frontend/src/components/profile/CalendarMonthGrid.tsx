import { useState, useCallback, useRef, useMemo } from 'react'
import { Box, Flex, Text, Grid } from '@chakra-ui/react'
import { format, addMonths, subMonths, isToday as isTodayFn, isSameDay } from 'date-fns'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import type { CalendarItem, CalendarConflict } from '@/types'
import { buildMonthGrid, itemAccentColor } from '@/utils/calendarItems'
import { GREEN, GREEN_LT, AMBER, GRAY100, GRAY200, GRAY400, GRAY700, GRAY800, WHITE } from '@/theme/tokens'

type Props = {
  items: CalendarItem[]
  conflicts: CalendarConflict[]
  selectedDate: Date | null
  onSelectDate: (date: Date | null) => void
  initialMonth?: Date
  /** Cap forward navigation: the [>] button is disabled when the next month
   *  starts after this date. Prevents browsing past the fetched data window. */
  maxDate?: Date
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const CalendarMonthGrid = ({
  items,
  conflicts,
  selectedDate,
  onSelectDate,
  initialMonth,
  maxDate,
}: Props) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(initialMonth ?? new Date())
  // focusedDate drives roving tabIndex: only the focused cell has tabIndex=0
  const [focusedDate, setFocusedDate] = useState<Date | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  // Map from ISO date string → DOM element for arrow-key focus management
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map())

  // MINOR 1: memoize grid so it doesn't rebuild on every selectedDate change
  const { weeks } = useMemo(
    () => buildMonthGrid(currentMonth, items, conflicts),
    [currentMonth, items, conflicts],
  )

  const handlePrevMonth = () => setCurrentMonth((m) => subMonths(m, 1))
  const handleNextMonth = () => setCurrentMonth((m) => addMonths(m, 1))
  const handleToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    onSelectDate(today)
  }

  // Disable forward navigation when the next month starts after maxDate
  const nextMonthStart = addMonths(currentMonth, 1)
  const isNextDisabled = maxDate != null && nextMonthStart > maxDate

  const handleSelectDate = useCallback(
    (date: Date) => {
      onSelectDate(date)
    },
    [onSelectDate],
  )

  // Flat list of all cell dates in grid order, for arrow navigation
  const allDates = useMemo(
    () => weeks.flatMap((week) => week.map((cell) => cell.date)),
    [weeks],
  )

  const focusCell = useCallback((date: Date) => {
    const key = date.toISOString()
    const el = cellRefs.current.get(key)
    if (el) {
      el.focus()
      setFocusedDate(date)
    }
  }, [])

  // CRITICAL 2: Arrow-key navigation (roving tabindex ARIA grid pattern)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, date: Date) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleSelectDate(date)
        return
      }

      const COLS = 7
      const idx = allDates.findIndex((d) => isSameDay(d, date))
      if (idx === -1) return

      let targetIdx: number | null = null

      if (e.key === 'ArrowRight') {
        targetIdx = idx + 1
      } else if (e.key === 'ArrowLeft') {
        targetIdx = idx - 1
      } else if (e.key === 'ArrowDown') {
        targetIdx = idx + COLS
      } else if (e.key === 'ArrowUp') {
        targetIdx = idx - COLS
      }

      if (targetIdx !== null && targetIdx >= 0 && targetIdx < allDates.length) {
        e.preventDefault()
        focusCell(allDates[targetIdx])
      }
    },
    [handleSelectDate, allDates, focusCell],
  )

  // Build conflict item id set
  const conflictIds = new Set<string>()
  for (const c of conflicts) {
    conflictIds.add(c.item_id)
    for (const id of c.overlaps_with) conflictIds.add(id)
  }

  // Determine which date gets tabIndex=0 (roving tabindex)
  const tabbableDate = focusedDate ?? selectedDate ?? weeks[0]?.[0]?.date ?? new Date()

  return (
    <Box>
      {/* Header row */}
      <Flex align="center" justify="space-between" mb={4}>
        <Flex align="center" gap={2}>
          <Box
            as="button"
            aria-label="Previous month"
            onClick={handlePrevMonth}
            px="11px"
            py="9px"
            borderRadius="11px"
            style={{ background: 'none', border: `1px solid ${GRAY200}`, cursor: 'pointer', color: GRAY700 }}
          >
            <FiChevronLeft size={17} />
          </Box>
          <Box
            as="button"
            aria-label="Next month"
            onClick={isNextDisabled ? undefined : handleNextMonth}
            aria-disabled={isNextDisabled ? 'true' : undefined}
            px="11px"
            py="9px"
            borderRadius="11px"
            title={isNextDisabled ? 'Calendar limited to next 60 days' : undefined}
            style={{
              background: 'none',
              border: `1px solid ${GRAY200}`,
              cursor: isNextDisabled ? 'not-allowed' : 'pointer',
              color: isNextDisabled ? GRAY400 : GRAY700,
              opacity: isNextDisabled ? 0.5 : 1,
            }}
          >
            <FiChevronRight size={17} />
          </Box>
        </Flex>

        <Text fontSize={{ base: '18px', md: '20px' }} fontWeight={800} color={GRAY800}>
          {format(currentMonth, 'MMMM yyyy')}
        </Text>

        <Flex align="center" gap={2}>
          <Box
            as="button"
            aria-label="Show upcoming schedule"
            onClick={() => onSelectDate(null)}
            px="12px"
            py="9px"
            borderRadius="12px"
            fontSize="12px"
            fontWeight={800}
            style={{
              background: selectedDate === null ? GREEN : WHITE,
              border: selectedDate === null ? 'none' : `1px solid ${GRAY200}`,
              cursor: 'pointer',
              color: selectedDate === null ? WHITE : GRAY700,
            }}
          >
            Upcoming
          </Box>
          <Box
            as="button"
            aria-label="Go to today"
            onClick={handleToday}
            px="14px"
            py="9px"
            borderRadius="12px"
            fontSize="13px"
            fontWeight={700}
            style={{ background: GREEN_LT, border: 'none', cursor: 'pointer', color: GREEN }}
          >
            Today
          </Box>
        </Flex>
      </Flex>

      {/* Day of week labels */}
      <Grid
        templateColumns="repeat(7, 1fr)"
        mb={2}
        role="row"
        aria-label="Day of week headers"
      >
        {DAY_LABELS.map((d) => (
          <Box
            key={d}
            role="columnheader"
            textAlign="center"
            py="6px"
          >
            <Text fontSize="12px" fontWeight={800} color={GRAY400} letterSpacing="0.05em">
              {d}
            </Text>
          </Box>
        ))}
      </Grid>

      {/* Month grid */}
      <Box role="grid" aria-label={format(currentMonth, 'MMMM yyyy')} ref={gridRef}>
        {weeks.map((week, wi) => (
          <Grid key={wi} templateColumns="repeat(7, 1fr)" role="row">
            {week.map((cell) => {
              const isSelected = selectedDate ? isSameDay(selectedDate, cell.date) : false
              const isCurrentDay = isTodayFn(cell.date)
              // Roving tabindex: only the "tabbable" cell gets tabIndex=0
              const isTabbable = isSameDay(cell.date, tabbableDate)

              const dots = cell.items.slice(0, 4)

              const hasConflict = cell.isConflict

              const cellBg = isSelected ? GREEN : 'transparent'
              const cellColor = isSelected ? WHITE : cell.inMonth ? GRAY800 : GRAY400
              const outline = isCurrentDay && !isSelected ? `2px solid ${GREEN}` : undefined

              const dateKey = cell.date.toISOString()

              return (
                <Box
                  key={dateKey}
                  role="gridcell"
                  as="button"
                  ref={(el: HTMLElement | null) => {
                    if (el) {
                      cellRefs.current.set(dateKey, el)
                    } else {
                      cellRefs.current.delete(dateKey)
                    }
                  }}
                  onClick={() => handleSelectDate(cell.date)}
                  onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, cell.date)}
                  onFocus={() => setFocusedDate(cell.date)}
                  aria-label={format(cell.date, 'd MMMM yyyy')}
                  aria-selected={isSelected}
                  tabIndex={isTabbable ? 0 : -1}
                  minH="42px"
                  p="7px"
                  borderRadius="11px"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  gap="4px"
                  style={{
                    background: cellBg,
                    border: hasConflict && !isSelected ? `1px solid ${AMBER}66` : '1px solid transparent',
                    cursor: 'pointer',
                    outline,
                    outlineOffset: '-2px',
                  }}
                  _hover={{ bg: isSelected ? GREEN : GRAY100 }}
                >
                  <Text
                    fontSize="16px"
                    fontWeight={isCurrentDay || isSelected ? 700 : 400}
                    color={cellColor}
                    lineHeight="1.05"
                  >
                    {format(cell.date, 'd')}
                  </Text>

                  {/* Dots */}
                  {cell.items.length > 0 && (
                    <Flex gap="3px" justify="center" flexWrap="wrap">
                      {dots.map((item) => (
                        <Box
                          key={item.id}
                          data-testid="calendar-item-dot"
                          w="6px"
                          h="6px"
                          borderRadius="full"
                          style={{
                            background: isSelected ? WHITE : itemAccentColor(item.accent_token).dot,
                          }}
                        />
                      ))}
                    </Flex>
                  )}
                </Box>
              )
            })}
          </Grid>
        ))}
      </Box>
    </Box>
  )
}

export default CalendarMonthGrid
