import type { UserHistoryItem } from '@/services/userAPI'

export interface GroupedHistoryEntry {
  key: string
  serviceId: string
  serviceTitle: string
  duration: number
  completedDate: string
  items: UserHistoryItem[]
  partnerName: string
  partnerId: string
  partnerAvatarUrl?: string | null
  useCount: number
  isMultiUse: boolean
}

function numericDuration(value: number | string) {
  return Number(value ?? 0)
}

function isMultiUseHistoryItem(item: UserHistoryItem) {
  return item.schedule_type === 'One-Time' && item.max_participants > 1
}

export function isOwnHistoryItem(item: UserHistoryItem) {
  if (item.service_type === 'Event') return true
  if (item.service_type === 'Need') return item.was_provider === false
  return item.was_provider === true
}

export function groupHistoryItems(items: UserHistoryItem[]): GroupedHistoryEntry[] {
  const groups = new Map<string, GroupedHistoryEntry>()

  for (const item of items) {
    const isMultiUse = isMultiUseHistoryItem(item)
    const key = isMultiUse
      ? item.service_id
      : `${item.service_id}:${item.partner_id}:${item.completed_date}`

    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
      existing.useCount += 1
      existing.duration = Math.max(existing.duration, numericDuration(item.duration))
      if (new Date(item.completed_date).getTime() > new Date(existing.completedDate).getTime()) {
        existing.completedDate = item.completed_date
      }
      continue
    }

    groups.set(key, {
      key,
      serviceId: item.service_id,
      serviceTitle: item.service_title,
      duration: numericDuration(item.duration),
      completedDate: item.completed_date,
      items: [item],
      partnerName: item.partner_name,
      partnerId: item.partner_id,
      partnerAvatarUrl: item.partner_avatar_url,
      useCount: 1,
      isMultiUse,
    })
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime(),
  )
}
