import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let pulseAPI: typeof import('@/services/pulseAPI').pulseAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  apiMocks.delete.mockReset()
  vi.resetModules()
  const mod = await import('@/services/pulseAPI')
  pulseAPI = mod.pulseAPI
})

afterEach(() => vi.clearAllMocks())

describe('pulseAPI.getStats', () => {
  it('GETs /pulse/stats/ and returns the response body', async () => {
    apiMocks.get.mockResolvedValue({
      data: { new_since_last_visit: 3, saved_count: 5, follow_handshakes_week: 2 },
    })
    const result = await pulseAPI.getStats()
    expect(apiMocks.get).toHaveBeenCalledWith('/pulse/stats/', { signal: undefined })
    expect(result).toEqual({
      new_since_last_visit: 3,
      saved_count: 5,
      follow_handshakes_week: 2,
    })
  })

  it('forwards an AbortSignal when one is provided', async () => {
    apiMocks.get.mockResolvedValue({ data: {} })
    const ctrl = new AbortController()
    await pulseAPI.getStats(ctrl.signal)
    expect(apiMocks.get).toHaveBeenCalledWith('/pulse/stats/', { signal: ctrl.signal })
  })
})

describe('pulseAPI.recordVisit', () => {
  it('POSTs /pulse/visit/ and returns the visit timestamp', async () => {
    apiMocks.post.mockResolvedValue({ data: { last_pulse_visit_at: '2026-05-08T08:00:00Z' } })
    const result = await pulseAPI.recordVisit()
    expect(apiMocks.post).toHaveBeenCalledWith('/pulse/visit/')
    expect(result).toEqual({ last_pulse_visit_at: '2026-05-08T08:00:00Z' })
  })
})

