/** Returns true if now is within 24 hours before the event start (lockdown window). */
export function isWithinLockdownWindow(scheduledTime: string | null | undefined): boolean {
  if (!scheduledTime) return false;
  const eventMs = new Date(scheduledTime).getTime();
  const nowMs = Date.now();
  return nowMs >= eventMs - 24 * 60 * 60 * 1000 && nowMs < eventMs;
}

/** Returns true if the event has not yet started. */
export function isFutureEvent(scheduledTime: string | null | undefined): boolean {
  if (!scheduledTime) return false;
  return new Date(scheduledTime).getTime() > Date.now();
}

/** Returns true if the event start time has passed. */
export function isPastEvent(scheduledTime: string | null | undefined): boolean {
  if (!scheduledTime) return false;
  return new Date(scheduledTime).getTime() <= Date.now();
}

/** Spots remaining (clamped to 0). */
export function spotsLeft(maxParticipants: number, participantCount: number): number {
  return Math.max(0, maxParticipants - participantCount);
}

/** Returns true when the event is at or over capacity. */
export function isEventFull(maxParticipants: number, participantCount: number): boolean {
  if (maxParticipants <= 0) return false;
  return participantCount >= maxParticipants;
}

/**
 * Returns true when 75-99% of capacity is filled. Mirrors web `isNearlyFull`
 * so the "X spots left" SmartPill on mobile fires for the same listings as
 * the desktop client. Single-seat services never qualify because they jump
 * straight from 0% to 100% without crossing the band.
 */
export function isNearlyFull(maxParticipants: number, participantCount: number): boolean {
  if (maxParticipants <= 0) return false;
  const pct = participantCount / maxParticipants;
  return pct >= 0.75 && pct < 1.0;
}

/** Returns true if the user is currently under an event-participation ban. */
export function isEventBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  return new Date(bannedUntil).getTime() > Date.now();
}

/** Format fixed group-offer dates compactly for service cards/details. */
export function formatGroupOfferDateTime(scheduledTime: string | null | undefined): string {
  if (!scheduledTime) return "Not scheduled";
  const date = new Date(scheduledTime);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
