import {
  isToday,
  isTomorrow,
  isThisWeek,
  parseISO,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from 'date-fns'
import type { CalendarItem, CalendarConflict, CalendarAccentToken } from '@/types'
import { GREEN, BLUE, TEAL } from '@/theme/tokens'

export type AgendaGroupKey = 'today' | 'tomorrow' | 'thisWeek' | 'later'

export function groupItemsByAgenda(
  items: CalendarItem[],
): Record<AgendaGroupKey, CalendarItem[]> {
  const result: Record<AgendaGroupKey, CalendarItem[]> = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
  }

  for (const item of items) {
    const date = parseISO(item.start)
    if (isToday(date)) {
      result.today.push(item)
    } else if (isTomorrow(date)) {
      result.tomorrow.push(item)
    } else if (isThisWeek(date, { weekStartsOn: 1 })) {
      result.thisWeek.push(item)
    } else {
      result.later.push(item)
    }
  }

  // Sort each group ascending by start time
  const sortAsc = (a: CalendarItem, b: CalendarItem) =>
    parseISO(a.start).getTime() - parseISO(b.start).getTime()

  result.today.sort(sortAsc)
  result.tomorrow.sort(sortAsc)
  result.thisWeek.sort(sortAsc)
  result.later.sort(sortAsc)

  return result
}

export interface MonthGridDay {
  date: Date
  inMonth: boolean
  items: CalendarItem[]
  isConflict: boolean
  isToday: boolean
}

export function buildMonthGrid(
  month: Date,
  items: CalendarItem[],
  conflicts?: CalendarConflict[],
): { weeks: MonthGridDay[][] } {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Build a set of item IDs involved in conflicts
  const conflictItemIds = new Set<string>()
  if (conflicts) {
    for (const c of conflicts) {
      conflictItemIds.add(c.item_id)
      for (const id of c.overlaps_with) {
        conflictItemIds.add(id)
      }
    }
  }

  const weeks: MonthGridDay[][] = []
  let week: MonthGridDay[] = []

  for (const day of allDays) {
    const dayItems = items.filter((item) => isSameDay(parseISO(item.start), day))
    const hasConflict = dayItems.some((item) => conflictItemIds.has(item.id))

    week.push({
      date: day,
      inMonth: isSameMonth(day, monthStart),
      items: dayItems,
      isConflict: hasConflict,
      isToday: isToday(day),
    })

    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }

  if (week.length > 0) {
    weeks.push(week)
  }

  return { weeks }
}

export function itemAccentColor(token: CalendarAccentToken): { strip: string; dot: string } {
  switch (token) {
    case 'GREEN':
      return { strip: GREEN, dot: GREEN }
    case 'BLUE':
      return { strip: BLUE, dot: BLUE }
    case 'TEAL':
      return { strip: TEAL, dot: TEAL }
    default:
      return { strip: GREEN, dot: GREEN }
  }
}

export function conflictMap(conflicts: CalendarConflict[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const c of conflicts) {
    map.set(c.item_id, c.overlaps_with)
    for (const id of c.overlaps_with) {
      if (!map.has(id)) {
        map.set(id, [c.item_id])
      } else {
        map.get(id)!.push(c.item_id)
      }
    }
  }
  return map
}

export function nextNItems(
  items: CalendarItem[],
  n: number,
  fromDate?: Date,
): CalendarItem[] {
  const from = fromDate ?? new Date()
  return items
    .filter((item) => parseISO(item.start).getTime() >= from.getTime())
    .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
    .slice(0, n)
}

export function formatItemRange(item: CalendarItem): string {
  const start = parseISO(item.start)
  const end = parseISO(item.end)

  if (isToday(start)) {
    return `Today · ${format(start, 'HH:mm')} (${item.duration_hours}h)`
  }

  const dayLabel = format(start, 'EEE')
  const startTime = format(start, 'HH:mm')
  const endTime = format(end, 'HH:mm')

  return `${dayLabel} ${startTime} – ${endTime}`
}

export function itemLinkTo(item: CalendarItem): string {
  const serviceId = item.service_id ?? item.link.id
  return `/service-detail/${serviceId}`
}
