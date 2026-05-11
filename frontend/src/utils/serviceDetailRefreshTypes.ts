import type { NotificationType } from '@/types'

const SERVICE_DETAIL_REFRESH_TYPES: NotificationType[] = [
  'handshake_accepted',
  'handshake_cancelled',
  'handshake_cancellation_requested',
  'positive_rep',
  'service_updated',
  'service_confirmation',
]

export function isServiceDetailRefreshType(type: NotificationType): boolean {
  return SERVICE_DETAIL_REFRESH_TYPES.includes(type)
}
