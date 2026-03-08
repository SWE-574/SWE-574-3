/**
 * Validation helpers for handshake and form constraints.
 */

/**
 * Returns true if value is a positive integer (suitable for duration in hours).
 */
export function isIntegerDuration(value: number): boolean {
  return Number.isInteger(value) && value >= 1
}

/**
 * Clamps duration to integer between 1 and max (inclusive).
 * Used for Offer/Need handshakes with a max cap (e.g. 10 hours).
 */
export function clampDuration(value: number, max?: number): number {
  const v = Math.max(1, Math.floor(Number(value)))
  if (max != null) return Math.min(v, max)
  return v
}

const FIFTEEN_MINUTES = 15

/**
 * Rounds a time string (HH:mm or HH:mm:ss) to the nearest 15-minute mark.
 * Returns time in HH:mm format (suitable for appending ":00" in ISO datetime).
 */
export function roundTimeToFifteenMinutes(time: string): string {
  if (!time || !time.trim()) return '00:00'
  const parts = time.trim().split(':')
  const hours = parseInt(parts[0], 10)
  const minutes = parts[1] != null ? parseInt(parts[1], 10) : 0
  if (isNaN(hours)) return '00:00'
  const roundedMinutes = Math.round((isNaN(minutes) ? 0 : minutes) / FIFTEEN_MINUTES) * FIFTEEN_MINUTES
  const m = roundedMinutes === 60 ? 0 : roundedMinutes
  const h = roundedMinutes === 60 ? hours + 1 : hours
  const hNorm = h % 24
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hNorm)}:${pad(m)}`
}
