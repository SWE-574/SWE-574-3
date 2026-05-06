/**
 * Calendar utility helpers – RN port of the web calendarItems utils.
 * Uses native Date and Intl.DateTimeFormat (no date-fns dependency).
 */

import { colors } from "../constants/colors";
import type {
  CalendarItem,
  CalendarConflict,
  CalendarAccentToken,
} from "../api/calendar";

// ── Date helpers ──────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const PROFILE_CALENDAR_HISTORY_START = "2020-01-01";
const PROFILE_CALENDAR_WINDOW_DAYS = 365;

export function profileCalendarFetchRange(
  referenceDate: Date = new Date(),
  userJoinedAt?: string | null,
): { from: string; to: string } {
  const fallbackStart = new Date(`${PROFILE_CALENDAR_HISTORY_START}T12:00:00`);
  const joinedDate = userJoinedAt ? new Date(userJoinedAt) : null;
  const fromDate =
    joinedDate && !Number.isNaN(joinedDate.getTime()) && joinedDate.getTime() < fallbackStart.getTime()
      ? joinedDate
      : fallbackStart;

  return {
    from: toDateString(fromDate),
    to: toDateString(addDays(referenceDate, PROFILE_CALENDAR_WINDOW_DAYS)),
  };
}

// ── Agenda grouping ───────────────────────────────────────────────────────

export interface AgendaGroups {
  today: CalendarItem[];
  tomorrow: CalendarItem[];
  thisWeek: CalendarItem[];
  later: CalendarItem[];
}

/**
 * Groups calendar items into Today / Tomorrow / This week / Later buckets.
 * Items within each bucket are sorted by start time.
 */
export function groupItemsByAgenda(items: CalendarItem[]): AgendaGroups {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterTomorrow = addDays(todayStart, 2);
  // "This week" = within the next 7 days, excluding today and tomorrow
  const weekEnd = addDays(todayStart, 7);

  const sorted = [...items].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  const groups: AgendaGroups = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
  };

  for (const item of sorted) {
    const itemStart = new Date(item.start);
    if (isSameDay(itemStart, todayStart)) {
      groups.today.push(item);
    } else if (isSameDay(itemStart, tomorrowStart)) {
      groups.tomorrow.push(item);
    } else if (itemStart >= dayAfterTomorrow && itemStart < weekEnd) {
      groups.thisWeek.push(item);
    } else if (itemStart >= weekEnd) {
      groups.later.push(item);
    }
  }

  return groups;
}

// ── Next N items ──────────────────────────────────────────────────────────

/**
 * Returns the next `n` upcoming items from `fromDate` (defaults to now).
 */
export function nextNItems(
  items: CalendarItem[],
  n: number,
  fromDate?: Date,
): CalendarItem[] {
  const from = fromDate ?? new Date();
  const upcoming = items
    .filter((item) => new Date(item.end) >= from)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return upcoming.slice(0, n);
}

// ── Accent color ──────────────────────────────────────────────────────────

/**
 * Maps an accent_token to the corresponding color from the design token set.
 * The backend now sends 'GREEN' | 'BLUE' | 'TEAL' (PURPLE retired per THEME.md).
 */
export function accentColorFor(token: CalendarAccentToken): string {
  switch (token) {
    case "GREEN":
      return colors.GREEN;
    case "BLUE":
      return colors.BLUE;
    case "TEAL":
      return colors.TEAL;
    default:
      return colors.GREEN;
  }
}

// ── Format item time range ────────────────────────────────────────────────

/**
 * Formats a calendar item's time range as e.g. "Tue 14:00 – 16:00 (2h)"
 */
export function formatItemRange(item: CalendarItem): string {
  try {
    const start = new Date(item.start);
    const end = new Date(item.end);

    const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const day = dayFmt.format(start);
    const startTime = timeFmt.format(start);
    const endTime = timeFmt.format(end);
    const hours = item.duration_hours;
    const durationLabel =
      Number.isFinite(hours) && hours > 0
        ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
        : "";

    return `${day} ${startTime} – ${endTime}${durationLabel ? ` (${durationLabel})` : ""}`;
  } catch {
    return "";
  }
}

// ── Conflict map ──────────────────────────────────────────────────────────

/**
 * Converts the conflicts array into a Map<item_id, overlaps_with[]> for O(1) lookup.
 */
export function conflictMap(conflicts: CalendarConflict[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const conflict of conflicts) {
    map.set(conflict.item_id, conflict.overlaps_with);
  }
  return map;
}

// ── Month grid ────────────────────────────────────────────────────────────

export interface MonthGridCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: CalendarItem[];
  hasConflict: boolean;
}

/**
 * Builds a 6-row × 7-column month grid for the given month.
 * `month` is a Date whose year/month is used (day is ignored).
 * `items` are filtered to those whose start date falls in the grid.
 */
export function buildMonthGrid(
  month: Date,
  items: CalendarItem[],
  conflicts?: CalendarConflict[],
): MonthGridCell[][] {
  const conflictSet = new Set<string>(
    (conflicts ?? []).map((c) => c.item_id),
  );

  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  // First day of the grid = Monday of the week that contains the 1st
  const firstOfMonth = new Date(year, monthIndex, 1);
  const dayOfWeek = firstOfMonth.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const gridStart = addDays(firstOfMonth, mondayOffset);

  const today = startOfDay(new Date());

  // Index items by date string for quick lookup
  const itemsByDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    try {
      const d = startOfDay(new Date(item.start));
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = itemsByDate.get(key) ?? [];
      existing.push(item);
      itemsByDate.set(key, existing);
    } catch {
      // skip invalid dates
    }
  }

  const weeks: MonthGridCell[][] = [];
  // Always render 6 weeks for consistent grid height
  for (let week = 0; week < 6; week++) {
    const row: MonthGridCell[] = [];
    for (let day = 0; day < 7; day++) {
      const cellDate = addDays(gridStart, week * 7 + day);
      const key = `${cellDate.getFullYear()}-${cellDate.getMonth()}-${cellDate.getDate()}`;
      const cellItems = itemsByDate.get(key) ?? [];
      const hasConflict = cellItems.some((item) => conflictSet.has(item.id));

      row.push({
        date: cellDate,
        isCurrentMonth: cellDate.getMonth() === monthIndex,
        isToday: isSameDay(cellDate, today),
        items: cellItems,
        hasConflict,
      });
    }
    weeks.push(row);
  }

  return weeks;
}

// ── Date string helpers ───────────────────────────────────────────────────

/**
 * Formats a Date as a "YYYY-MM-DD" string (local time, not UTC).
 * Shared between CalendarScreen and UpcomingScheduleCard to avoid duplication.
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Helpers re-exported for tests ─────────────────────────────────────────

export { isSameDay, addDays, startOfDay };
