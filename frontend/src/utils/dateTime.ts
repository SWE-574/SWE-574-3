import { formatDistanceToNow, format, parseISO } from 'date-fns'

/**
 * Format an ISO datetime string to a human-readable relative time (e.g. "3 minutes ago")
 */
export function timeAgo(isoString: string): string {
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true })
  } catch {
    return isoString
  }
}

/**
 * Format an ISO datetime string to a localized date string
 */
export function formatDate(isoString: string, pattern = 'MMM d, yyyy'): string {
  try {
    return format(parseISO(isoString), pattern)
  } catch {
    return isoString
  }
}

/**
 * Format an ISO datetime string to a localized date and time string
 */
export function formatDateTime(isoString: string, pattern = 'MMM d, yyyy HH:mm'): string {
  try {
    return format(parseISO(isoString), pattern)
  } catch {
    return isoString
  }
}

/**
 * Convert hours (decimal) to a human-readable duration string
 */
export function formatDuration(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return `${minutes} min`
  }
  if (Number.isInteger(hours)) return `${hours}h`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

/**
 * Returns a short timestamp label for chat messages
 */
export function chatTimestamp(isoString: string): string {
  try {
    const date = parseISO(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    if (diffHours < 24) return format(date, 'HH:mm')
    if (diffHours < 48 * 24) return format(date, 'EEE HH:mm')
    return format(date, 'MMM d')
  } catch {
    return isoString
  }
}
