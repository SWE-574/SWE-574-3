/**
 * Shared badge configuration for Handshake statuses.
 * Single source of truth used by both ServiceDetailPage and InterestRequesterRow.
 */
import { GRAY100, GRAY500 } from '@/theme/tokens'
import type { Handshake } from '@/services/handshakeAPI'

export const HS_BADGE: Record<Handshake['status'], { label: string; bg: string; color: string }> = {
  pending:    { label: 'Pending',    bg: '#fef9c3', color: '#854d0e' },
  accepted:   { label: 'Accepted',   bg: '#dcfce7', color: '#166534' },
  completed:  { label: 'Completed',  bg: '#d1fae5', color: '#065f46' },
  denied:     { label: 'Declined',   bg: '#fee2e2', color: '#991b1b' },
  cancelled:  { label: 'Cancelled',  bg: '#f3f4f6', color: '#6b7280' },
  reported:   { label: 'Reported',   bg: '#fee2e2', color: '#991b1b' },
  paused:     { label: 'Paused',     bg: '#e0f2fe', color: '#0369a1' },
  checked_in: { label: 'Checked In', bg: '#d1fae5', color: '#065f46' },
  attended:   { label: 'Attended',   bg: '#d1fae5', color: '#065f46' },
  no_show:    { label: 'No-Show',    bg: '#fee2e2', color: '#991b1b' },
}

export const STATUS_FALLBACK = { bg: GRAY100, color: GRAY500 }
