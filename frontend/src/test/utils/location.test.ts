import { describe, it, expect } from 'vitest'
import { haversineDistance } from '@/utils/location'

describe('haversineDistance', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistance(41.015, 28.979, 41.015, 28.979)).toBe(0)
  })

  it('calculates the approximate distance between Istanbul and Ankara', () => {
    // Istanbul: 41.0082° N, 28.9784° E
    // Ankara:   39.9334° N, 32.8597° E
    // Real distance ≈ 350 km
    const dist = haversineDistance(41.0082, 28.9784, 39.9334, 32.8597)
    expect(dist).toBeGreaterThan(340)
    expect(dist).toBeLessThan(360)
  })

  it('is symmetric — distance A→B equals B→A', () => {
    const ab = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522)
    const ba = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278)
    expect(ab).toBeCloseTo(ba, 5)
  })

  it('returns a positive value for distinct coordinates', () => {
    const dist = haversineDistance(0, 0, 1, 1)
    expect(dist).toBeGreaterThan(0)
  })
})
