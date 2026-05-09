export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function futureDateParts(daysAhead = 2): { date: string; time: string } {
  const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  // Spread the slot across the workday with a random hour/quarter so concurrent
  // workers proposing session details on the same demo user fan out instead of
  // colliding on the same default 10:00 slot.
  const hour = 9 + Math.floor(Math.random() * 8)
  const quarter = Math.floor(Math.random() * 4) * 15
  future.setHours(hour, quarter, 0, 0)

  const year = future.getFullYear()
  const month = String(future.getMonth() + 1).padStart(2, '0')
  const day = String(future.getDate()).padStart(2, '0')

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, '0')}:${String(quarter).padStart(2, '0')}`,
  }
}
