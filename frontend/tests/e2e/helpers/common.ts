export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function futureDateParts(daysAhead = 2): { date: string; time: string } {
  const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  future.setHours(10, 0, 0, 0)

  const year = future.getFullYear()
  const month = String(future.getMonth() + 1).padStart(2, '0')
  const day = String(future.getDate()).padStart(2, '0')

  return {
    date: `${year}-${month}-${day}`,
    time: '10:00',
  }
}
