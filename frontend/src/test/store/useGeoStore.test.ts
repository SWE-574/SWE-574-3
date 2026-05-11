import { beforeEach, describe, expect, it, vi } from 'vitest'

let useGeoStore: typeof import('@/store/useGeoStore').useGeoStore

beforeEach(async () => {
  vi.resetModules()
  useGeoStore = (await import('@/store/useGeoStore')).useGeoStore
})

describe('useGeoStore', () => {
  it('starts with null geoLocation', () => {
    expect(useGeoStore.getState().geoLocation).toBeNull()
  })

  it('setGeoLocation stores the coordinates', () => {
    useGeoStore.getState().setGeoLocation({ latitude: 41.0, longitude: 29.0 })
    expect(useGeoStore.getState().geoLocation).toEqual({ latitude: 41.0, longitude: 29.0 })
  })

  it('setGeoLocation(null) clears the value', () => {
    useGeoStore.getState().setGeoLocation({ latitude: 41.0, longitude: 29.0 })
    useGeoStore.getState().setGeoLocation(null)
    expect(useGeoStore.getState().geoLocation).toBeNull()
  })

  it('replaces previous coordinates rather than merging', () => {
    useGeoStore.getState().setGeoLocation({ latitude: 41.0, longitude: 29.0 })
    useGeoStore.getState().setGeoLocation({ latitude: 50.0, longitude: 0.0 })
    expect(useGeoStore.getState().geoLocation).toEqual({ latitude: 50.0, longitude: 0.0 })
  })
})
