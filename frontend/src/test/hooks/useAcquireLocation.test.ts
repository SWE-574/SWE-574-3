import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const geoState = vi.hoisted(() => ({
  geoLocation: null as { latitude: number; longitude: number } | null,
  setGeoLocation: vi.fn((loc: { latitude: number; longitude: number }) => {
    geoState.geoLocation = loc
  }),
}))
const getCurrentPositionMock = vi.hoisted(() => vi.fn())

vi.mock('@/store/useGeoStore', () => ({
  useGeoStore: { getState: () => geoState },
}))
vi.mock('@/utils/location', () => ({
  getCurrentPosition: getCurrentPositionMock,
}))

// jsdom 28 in this project ships a broken localStorage; mirror the shim from
// src/test/store/useTourStore.test.ts.
let storage: Record<string, string>
function installStorage() {
  storage = {}
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (k in storage ? storage[k] : null),
      setItem: (k: string, v: string) => { storage[k] = v },
      removeItem: (k: string) => { delete storage[k] },
      clear: () => { storage = {} },
      key: (i: number) => Object.keys(storage)[i] ?? null,
      get length() { return Object.keys(storage).length },
    },
  })
}

let useAcquireLocation: typeof import('@/hooks/useAcquireLocation').useAcquireLocation

beforeEach(async () => {
  geoState.geoLocation = null
  geoState.setGeoLocation.mockClear()
  getCurrentPositionMock.mockReset()
  installStorage()
  vi.resetModules()
  useAcquireLocation = (await import('@/hooks/useAcquireLocation')).useAcquireLocation
})

describe('useAcquireLocation', () => {
  it('skips when geoLocation is already in the store', () => {
    geoState.geoLocation = { latitude: 1, longitude: 2 }
    localStorage.setItem('locationEnabled', 'true')
    renderHook(() => useAcquireLocation())
    expect(getCurrentPositionMock).not.toHaveBeenCalled()
  })

  it('skips when locationEnabled consent is missing', () => {
    renderHook(() => useAcquireLocation())
    expect(getCurrentPositionMock).not.toHaveBeenCalled()
  })

  it('skips when locationEnabled is set to a non-true value', () => {
    localStorage.setItem('locationEnabled', 'false')
    renderHook(() => useAcquireLocation())
    expect(getCurrentPositionMock).not.toHaveBeenCalled()
  })

  it('writes coords into the store on success', async () => {
    localStorage.setItem('locationEnabled', 'true')
    getCurrentPositionMock.mockResolvedValue({ coords: { latitude: 41.04, longitude: 28.99 } })
    renderHook(() => useAcquireLocation())
    await waitFor(() => {
      expect(geoState.setGeoLocation).toHaveBeenCalledWith({ latitude: 41.04, longitude: 28.99 })
    })
  })

  it('swallows errors silently', async () => {
    localStorage.setItem('locationEnabled', 'true')
    getCurrentPositionMock.mockRejectedValue(new Error('denied'))
    renderHook(() => useAcquireLocation())
    // Give the rejected promise a tick to flush.
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(geoState.setGeoLocation).not.toHaveBeenCalled()
  })

  it('does not call setGeoLocation if the component unmounts before resolution', async () => {
    localStorage.setItem('locationEnabled', 'true')
    let resolveFn!: (v: GeolocationPosition) => void
    getCurrentPositionMock.mockImplementation(() => new Promise((r) => { resolveFn = r }))
    const { unmount } = renderHook(() => useAcquireLocation())
    unmount()
    resolveFn({ coords: { latitude: 0, longitude: 0 } } as GeolocationPosition)
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(geoState.setGeoLocation).not.toHaveBeenCalled()
  })
})
