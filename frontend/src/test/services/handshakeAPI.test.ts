import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let handshakeAPI: typeof import('@/services/handshakeAPI').handshakeAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  vi.resetModules()
  handshakeAPI = (await import('@/services/handshakeAPI')).handshakeAPI
})

describe('handshakeAPI.list', () => {
  it('GETs /handshakes/ and returns the array', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ id: 'h-1' }] })
    const out = await handshakeAPI.list()
    expect(apiMocks.get).toHaveBeenCalledWith('/handshakes/', { signal: undefined })
    expect(out).toEqual([{ id: 'h-1' }])
  })

  it('returns [] when response is not an array', async () => {
    apiMocks.get.mockResolvedValue({ data: { detail: 'oops' } })
    const out = await handshakeAPI.list()
    expect(out).toEqual([])
  })
})

describe('handshakeAPI single-id endpoints', () => {
  it.each([
    ['accept', 'accept/'],
    ['deny', 'deny/'],
    ['cancel', 'cancel/'],
    ['approveCancellation', 'cancel-request/approve/'],
    ['rejectCancellation', 'cancel-request/reject/'],
    ['approve', 'approve/'],
    ['requestChanges', 'request-changes/'],
    ['confirm', 'confirm/'],
    ['leaveEvent', 'leave-event/'],
    ['markAttended', 'mark-attended/'],
  ] as const)('%s POSTs to /handshakes/:id/%s with empty body', async (method, suffix) => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await (handshakeAPI[method] as (id: string) => Promise<unknown>)('h-1')
    expect(apiMocks.post).toHaveBeenCalledWith(`/handshakes/h-1/${suffix}`, {})
  })
})

describe('handshakeAPI.get', () => {
  it('GETs /handshakes/:id/', async () => {
    apiMocks.get.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.get('h-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/handshakes/h-1/', { signal: undefined })
  })
})

describe('handshakeAPI.requestCancellation', () => {
  it('POSTs an empty body when no reason given', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.requestCancellation('h-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/cancel-request/', {})
  })

  it('POSTs reason when given', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.requestCancellation('h-1', 'no longer available')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/cancel-request/', {
      reason: 'no longer available',
    })
  })
})

describe('handshakeAPI.initiate', () => {
  it('POSTs the InitiatePayload to /initiate/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.initiate('h-1', {
      exact_location: 'Cafe X',
      exact_duration: 2,
      scheduled_time: '2026-06-01T10:00:00Z',
      exact_location_lat: 41.0,
      exact_location_lng: 29.0,
    })
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/initiate/', {
      exact_location: 'Cafe X',
      exact_duration: 2,
      scheduled_time: '2026-06-01T10:00:00Z',
      exact_location_lat: 41.0,
      exact_location_lng: 29.0,
    })
  })
})

describe('handshakeAPI.report', () => {
  it('POSTs without reported_user_id when not provided', async () => {
    apiMocks.post.mockResolvedValue({ data: { status: 'ok', report_id: 'r-1' } })
    await handshakeAPI.report('h-1', 'no_show', 'because')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/report/', {
      issue_type: 'no_show',
      description: 'because',
    })
  })

  it('includes reported_user_id when provided', async () => {
    apiMocks.post.mockResolvedValue({ data: { status: 'ok', report_id: 'r-1' } })
    await handshakeAPI.report('h-1', 'harassment', 'detail', 'u-9')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/report/', {
      issue_type: 'harassment',
      description: 'detail',
      reported_user_id: 'u-9',
    })
  })
})

describe('handshakeAPI.joinEvent', () => {
  it('POSTs to /handshakes/services/:id/join-event/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.joinEvent('s-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/services/s-1/join-event/', {})
  })
})

describe('handshakeAPI.checkin', () => {
  it('POSTs an empty body when no qr token', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.checkin('h-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/checkin/', {})
  })

  it('POSTs the qr_token when provided', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'h-1' } })
    await handshakeAPI.checkin('h-1', 'token-xyz')
    expect(apiMocks.post).toHaveBeenCalledWith('/handshakes/h-1/checkin/', { qr_token: 'token-xyz' })
  })
})
