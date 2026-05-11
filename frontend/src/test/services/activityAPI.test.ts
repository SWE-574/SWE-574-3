import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let activityAPI: typeof import('@/services/activityAPI').activityAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  vi.resetModules()
  activityAPI = (await import('@/services/activityAPI')).activityAPI
})

const event = {
  id: 1,
  verb: 'service_created' as const,
  actor: { id: 'u-1', first_name: 'A', last_name: 'B', avatar_url: null },
  target_user: null,
  service: null,
  created_at: '2026-05-08T00:00:00Z',
  distance_km: null,
  event_capacity_pct: null,
  event_starts_in_seconds: null,
  handshake_duration_hours: null,
  actor_skills: null,
  actor_location: null,
}

describe('activityAPI.feed', () => {
  it('GETs /activity/feed/ with empty params when none provided', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    const out = await activityAPI.feed()
    const call = apiMocks.get.mock.calls[0]
    expect(call[0]).toBe('/activity/feed/')
    expect((call[1].params as URLSearchParams).toString()).toBe('')
    expect(out).toEqual([])
  })

  it('builds the query string from days, lat, lng, page, sort', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [event] } })
    await activityAPI.feed({ days: 7, lat: 40.5, lng: -3.7, page: 2, sort: 'nearby' })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.get('days')).toBe('7')
    expect(params.get('lat')).toBe('40.5')
    expect(params.get('lng')).toBe('-3.7')
    expect(params.get('page')).toBe('2')
    expect(params.get('sort')).toBe('nearby')
  })

  it('omits unset params (null vs zero distinction)', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await activityAPI.feed({ days: 0, page: 1 })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.get('days')).toBe('0')
    expect(params.has('lat')).toBe(false)
    expect(params.has('sort')).toBe(false)
  })

  it('extracts results from a paginated response', async () => {
    apiMocks.get.mockResolvedValue({
      data: { count: 1, next: null, previous: null, results: [event] },
    })
    const out = await activityAPI.feed()
    expect(out).toEqual([event])
  })

  it('returns the array directly when the response is already an array', async () => {
    apiMocks.get.mockResolvedValue({ data: [event] })
    const out = await activityAPI.feed()
    expect(out).toEqual([event])
  })

  it('returns [] when paginated response has no results key', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, next: null, previous: null } })
    const out = await activityAPI.feed()
    expect(out).toEqual([])
  })

  it('forwards the abort signal', async () => {
    const ac = new AbortController()
    apiMocks.get.mockResolvedValue({ data: [] })
    await activityAPI.feed({}, ac.signal)
    expect(apiMocks.get.mock.calls[0][1].signal).toBe(ac.signal)
  })
})
