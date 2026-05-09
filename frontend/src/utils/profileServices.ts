import type { Service } from '@/types'

const PROFILE_ONGOING_STATUSES = new Set(['Active', 'Agreed'])

export function isOngoingProfileService(service: Service): boolean {
  return PROFILE_ONGOING_STATUSES.has(service.status)
}
