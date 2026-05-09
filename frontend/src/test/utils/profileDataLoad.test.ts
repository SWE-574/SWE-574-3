import { describe, expect, it } from 'vitest'
import { profileDataUserId } from '@/utils/profileDataLoad'

describe('profileDataUserId', () => {
  it('uses only the stable user id for profile data reload identity', () => {
    expect(profileDataUserId(null)).toBeNull()
    expect(profileDataUserId({ id: 'u-1', first_name: 'Old' })).toBe('u-1')
    expect(profileDataUserId({ id: 'u-1', first_name: 'Fresh' })).toBe('u-1')
    expect(profileDataUserId({ id: 'u-2', first_name: 'Fresh' })).toBe('u-2')
  })
})
