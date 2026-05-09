import type { Service } from '@/types'

type ServiceTypeName = 'Offer' | 'Need' | 'Event'
type ScheduleType = 'One-Time' | 'Recurrent'

export function isEventRecurrent(
  service: Pick<Service, 'type' | 'schedule_type'> | null | undefined,
): boolean {
  if (!service) return false
  return service.type === 'Event' && service.schedule_type === 'Recurrent'
}

export function recurrenceLabel(
  scheduleType: string | null | undefined,
): 'Recurring' | 'One-time' {
  return scheduleType === 'Recurrent' ? 'Recurring' : 'One-time'
}

export function effectiveScheduleType(
  type: ServiceTypeName,
  scheduleType: ScheduleType,
): ScheduleType {
  return type === 'Event' ? scheduleType : 'One-Time'
}

export function recurrenceIntervalForSubmission(
  type: ServiceTypeName,
  scheduleType: ScheduleType,
  days: number | null | undefined,
): number | null {
  if (type !== 'Event') return null
  if (scheduleType !== 'Recurrent') return null
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return null
  return Math.floor(days)
}
