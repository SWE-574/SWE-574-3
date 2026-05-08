import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let transactionAPI: typeof import('@/services/transactionAPI').transactionAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  vi.resetModules()
  transactionAPI = (await import('@/services/transactionAPI')).transactionAPI
})

const tx = (overrides: Record<string, unknown> = {}) => ({
  id: 't-1',
  amount: '5.00',
  balance_after: '10.00',
  type: 'credit',
  ...overrides,
})

describe('transactionAPI.list — defaults and params', () => {
  it('GETs /transactions/ with default page=1 and direction=all', async () => {
    apiMocks.get.mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [], summary: null },
    })
    await transactionAPI.list()
    expect(apiMocks.get).toHaveBeenCalledWith('/transactions/', {
      params: { page: 1, page_size: undefined, direction: 'all' },
      signal: undefined,
    })
  })

  it('forwards page, page_size, direction overrides', async () => {
    apiMocks.get.mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [], summary: null },
    })
    await transactionAPI.list({ page: 3, page_size: 25, direction: 'credit' })
    expect(apiMocks.get).toHaveBeenCalledWith('/transactions/', {
      params: { page: 3, page_size: 25, direction: 'credit' },
      signal: undefined,
    })
  })
})

describe('transactionAPI.list — normalization', () => {
  it('coerces amount and balance_after to numbers', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [tx({ amount: '5.00', balance_after: '10.50' })],
        summary: { current_balance: '10.50', total_earned: '5.00', total_spent: '0' },
      },
    })
    const out = await transactionAPI.list()
    expect(out.results[0].amount).toBe(5)
    expect(out.results[0].balance_after).toBe(10.5)
    expect(out.summary.current_balance).toBe(10.5)
    expect(out.summary.total_earned).toBe(5)
  })

  it('falls back to 0 when amount/balance_after are missing', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [tx({ amount: undefined, balance_after: undefined })],
        summary: undefined,
      },
    })
    const out = await transactionAPI.list()
    expect(out.results[0].amount).toBe(0)
    expect(out.results[0].balance_after).toBe(0)
    expect(out.summary).toEqual({ current_balance: 0, total_earned: 0, total_spent: 0 })
  })

  it('wraps a bare-array response as a single-page paginated result', async () => {
    apiMocks.get.mockResolvedValue({
      data: [tx({ amount: '1' }), tx({ id: 't-2', amount: '2' })],
    })
    const out = await transactionAPI.list()
    expect(out.count).toBe(2)
    expect(out.next).toBeNull()
    expect(out.previous).toBeNull()
    expect(out.results[0].amount).toBe(1)
    expect(out.results[1].amount).toBe(2)
    expect(out.summary).toEqual({ current_balance: 0, total_earned: 0, total_spent: 0 })
  })
})

describe('transactionAPI.list — abort signal', () => {
  it('forwards the abort signal', async () => {
    const ac = new AbortController()
    apiMocks.get.mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [], summary: null },
    })
    await transactionAPI.list({}, ac.signal)
    expect(apiMocks.get.mock.calls[0][1].signal).toBe(ac.signal)
  })
})
