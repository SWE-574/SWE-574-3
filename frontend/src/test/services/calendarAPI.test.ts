import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let calendarAPI: typeof import('@/services/calendarAPI').calendarAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  vi.resetModules()
  calendarAPI = (await import('@/services/calendarAPI')).calendarAPI
})

describe('calendarAPI.fetchUpcoming', () => {
  it('GETs /users/me/calendar/ with empty params when none provided', async () => {
    apiMocks.get.mockResolvedValue({ data: { items: [] } })
    const out = await calendarAPI.fetchUpcoming()
    expect(apiMocks.get).toHaveBeenCalledWith('/users/me/calendar/', { params: {}, signal: undefined })
    expect(out).toEqual({ items: [] })
  })

  it('forwards from / to params and abort signal', async () => {
    const ac = new AbortController()
    apiMocks.get.mockResolvedValue({ data: { items: [] } })
    await calendarAPI.fetchUpcoming({ from: '2026-05-01', to: '2026-06-01' }, ac.signal)
    expect(apiMocks.get).toHaveBeenCalledWith('/users/me/calendar/', {
      params: { from: '2026-05-01', to: '2026-06-01' },
      signal: ac.signal,
    })
  })

  it('returns the response data unmodified', async () => {
    const payload = { items: [{ id: 1 }] } as never
    apiMocks.get.mockResolvedValue({ data: payload })
    const out = await calendarAPI.fetchUpcoming()
    expect(out).toBe(payload)
  })

  it('propagates rejection unchanged', async () => {
    const err = Object.assign(new Error('500'), { response: { status: 500 } })
    apiMocks.get.mockRejectedValue(err)
    await expect(calendarAPI.fetchUpcoming()).rejects.toBe(err)
  })
})
