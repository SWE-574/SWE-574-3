// ─── Event Utilities ──────────────────────────────────────────────────────────

/** Returns true if now is within 24 hours of the event start (lockdown window) */
export function isWithinLockdownWindow(scheduledTime: string | null | undefined): boolean {
  if (!scheduledTime) return false
  const eventMs = new Date(scheduledTime).getTime()
  const nowMs = Date.now()
  return nowMs >= eventMs - 24 * 60 * 60 * 1000 && nowMs < eventMs
}

/** Returns true if the event is in the future (not yet started) */
export function isFutureEvent(scheduledTime: string | null | undefined): boolean {
  if (!scheduledTime) return false
  return new Date(scheduledTime).getTime() > Date.now()
}

/** Returns true if the event is in the past */
export function isEventPast(scheduledTime: string | null | undefined): boolean {
  if (!scheduledTime) return false
  return new Date(scheduledTime).getTime() <= Date.now()
}

/** Spots remaining */
export function spotsLeft(maxParticipants: number, participantCount: number): number {
  return Math.max(0, maxParticipants - participantCount)
}

/** Returns true when 75-99% capacity (nearly full) */
export function isNearlyFull(maxParticipants: number, participantCount: number): boolean {
  if (maxParticipants <= 0) return false
  const pct = participantCount / maxParticipants
  return pct >= 0.75 && pct < 1.0
}

/** Returns true when at or over capacity */
export function isEventFull(maxParticipants: number, participantCount: number): boolean {
  if (maxParticipants <= 0) return false
  return participantCount >= maxParticipants
}

/** Format a scheduled_time ISO string to a human-readable date/time */
export function formatEventDateTime(scheduledTime: string | null | undefined): string {
  if (!scheduledTime) return 'TBD'
  return new Date(scheduledTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Returns a human-readable countdown (e.g. "2 days away", "3 hours away") */
export function timeUntilEvent(scheduledTime: string | null | undefined): string {
  if (!scheduledTime) return ''
  const diff = new Date(scheduledTime).getTime() - Date.now()
  if (diff <= 0) return 'Event started'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m away`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h away`
  const days = Math.floor(hours / 24)
  return `${days}d away`
}

/** Returns true if the user is currently under an event-participation ban */
export function isEventBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  return new Date(bannedUntil).getTime() > Date.now()
}

/** Returns true if the user is currently under an organizer ban */
export function isOrganizerBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  return new Date(bannedUntil).getTime() > Date.now()
}

/** Format a ban expiry date for display */
export function formatBanExpiry(bannedUntil: string | null | undefined): string {
  if (!bannedUntil) return ''
  return new Date(bannedUntil).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
