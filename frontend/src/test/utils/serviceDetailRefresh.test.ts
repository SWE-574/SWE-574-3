import { describe, it, expect } from 'vitest'
import { isServiceDetailRefreshType } from '@/pages/ServiceDetailPage'
import type { NotificationType } from '@/types'

describe('isServiceDetailRefreshType', () => {
  const refreshTypes: NotificationType[] = [
    'handshake_accepted',
    'handshake_cancelled',
    'handshake_cancellation_requested',
    'positive_rep',
    'service_updated',
    'service_confirmation',
  ]

  const ignoredTypes: NotificationType[] = [
    'handshake_request',
    'handshake_denied',
    'handshake_cancellation_rejected',
    'chat_message',
    'service_reminder',
    'admin_warning',
    'dispute_resolved',
    'user_followed',
    'new_report',
    'report_received',
    'report_resolved',
    'report_dismissed',
  ]

  it.each(refreshTypes)('returns true for %s', (type) => {
    expect(isServiceDetailRefreshType(type)).toBe(true)
  })

  it.each(ignoredTypes)('returns false for %s', (type) => {
    expect(isServiceDetailRefreshType(type)).toBe(false)
  })
})
