import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'hive_dashboard_tour_v1'

let storage: Record<string, string>

let useTourStore: typeof import('@/store/useTourStore').useTourStore

// jsdom 28 in this project ships a broken localStorage (plain Object, no methods).
// Install a real storage shim before each test so the store can read/write.
function installStorage(initial: Record<string, string> = {}) {
  storage = { ...initial }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => (key in storage ? storage[key] : null)),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
      clear: vi.fn(() => { storage = {} }),
      key: vi.fn((idx: number) => Object.keys(storage)[idx] ?? null),
      get length() { return Object.keys(storage).length },
    },
  })
}

beforeEach(async () => {
  installStorage()
  vi.resetModules()
  useTourStore = (await import('@/store/useTourStore')).useTourStore
})

describe('useTourStore initial state', () => {
  it('hasSeen starts false when storage is empty', () => {
    expect(useTourStore.getState().hasSeen).toBe(false)
    expect(useTourStore.getState().isOpen).toBe(false)
    expect(useTourStore.getState().runId).toBe(0)
  })

  it('hasSeen reads from localStorage at module init', async () => {
    installStorage({ [STORAGE_KEY]: 'done' })
    vi.resetModules()
    const { useTourStore: fresh } = await import('@/store/useTourStore')
    expect(fresh.getState().hasSeen).toBe(true)
  })
})

describe('useTourStore.startTour', () => {
  it('opens the tour and increments runId', () => {
    useTourStore.getState().startTour()
    expect(useTourStore.getState().isOpen).toBe(true)
    expect(useTourStore.getState().runId).toBe(1)
  })

  it('increments runId on each call', () => {
    useTourStore.getState().startTour()
    useTourStore.getState().startTour()
    useTourStore.getState().startTour()
    expect(useTourStore.getState().runId).toBe(3)
  })
})

describe('useTourStore.endTour', () => {
  it('writes "done" to localStorage and sets hasSeen', () => {
    useTourStore.getState().startTour()
    useTourStore.getState().endTour('done')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('done')
    expect(useTourStore.getState().hasSeen).toBe(true)
    expect(useTourStore.getState().isOpen).toBe(false)
  })

  it('writes "skipped" when reason is skipped', () => {
    useTourStore.getState().endTour('skipped')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('skipped')
    expect(useTourStore.getState().hasSeen).toBe(true)
  })

  it('swallows storage errors gracefully', () => {
    const setItem = window.localStorage.setItem as unknown as ReturnType<typeof vi.fn>
    setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceeded')
    })
    expect(() => useTourStore.getState().endTour('done')).not.toThrow()
    expect(useTourStore.getState().hasSeen).toBe(true)
  })
})
