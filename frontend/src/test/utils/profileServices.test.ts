import { describe, expect, it } from 'vitest'
import type { Service } from '@/types'
import { isOngoingProfileService } from '@/utils/profileServices'

const serviceWithStatus = (status: Service['status']): Service => ({
  id: status,
  title: status,
  description: '',
  type: 'Offer',
  duration: 1,
  location_type: 'Online',
  status,
  max_participants: 1,
  schedule_type: 'One-Time',
  tags: [],
  created_at: new Date().toISOString(),
}) as Service

describe('isOngoingProfileService', () => {
  it('keeps active agreement services visible on profile service tabs', () => {
    expect(isOngoingProfileService(serviceWithStatus('Active'))).toBe(true)
    expect(isOngoingProfileService(serviceWithStatus('Agreed'))).toBe(true)
    expect(isOngoingProfileService(serviceWithStatus('Completed'))).toBe(false)
    expect(isOngoingProfileService(serviceWithStatus('Cancelled'))).toBe(false)
  })
})
