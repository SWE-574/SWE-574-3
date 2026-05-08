import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn(),
}))

let serviceAPI: typeof import('@/services/serviceAPI').serviceAPI

beforeEach(async () => {
  Object.values(apiMocks).forEach((fn) => fn.mockReset())
  vi.resetModules()
  serviceAPI = (await import('@/services/serviceAPI')).serviceAPI
})

describe('serviceAPI.list — query string building', () => {
  it('GETs /services/ with empty params when none provided', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list()
    expect(apiMocks.get).toHaveBeenCalledWith('/services/', {
      params: expect.any(URLSearchParams),
      signal: undefined,
    })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.toString()).toBe('')
  })

  it('forwards sort, lat, lng, distance, search, type, status', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list({
      sort: 'hot', lat: 41, lng: 29, distance: 5,
      search: 'python', type: 'Offer', status: 'Active',
    })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.get('sort')).toBe('hot')
    expect(params.get('lat')).toBe('41')
    expect(params.get('lng')).toBe('29')
    expect(params.get('distance')).toBe('5')
    expect(params.get('search')).toBe('python')
    expect(params.get('type')).toBe('Offer')
    expect(params.get('status')).toBe('Active')
  })

  it('appends multiple tags as repeated query keys', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list({ tags: ['Q1', 'Q2', 'Q3'] })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.getAll('tags')).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('renames user_id to user param', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list({ user_id: 'u-1' })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.get('user')).toBe('u-1')
    expect(params.has('user_id')).toBe(false)
  })

  it('serializes explore_only=true as the literal string "true"', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list({ explore_only: true })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.get('explore_only')).toBe('true')
  })

  it('omits explore_only when false', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list({ explore_only: false })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.has('explore_only')).toBe(false)
  })

  it('forwards date_from and date_to', async () => {
    apiMocks.get.mockResolvedValue({ data: [] })
    await serviceAPI.list({ type: 'Event', date_from: '2026-05-01', date_to: '2026-06-01' })
    const params = apiMocks.get.mock.calls[0][1].params as URLSearchParams
    expect(params.get('date_from')).toBe('2026-05-01')
    expect(params.get('date_to')).toBe('2026-06-01')
  })
})

describe('serviceAPI.list — response shape', () => {
  it('returns the array directly when response is an array', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ id: 's-1' }] })
    const out = await serviceAPI.list()
    expect(out).toEqual([{ id: 's-1' }])
  })

  it('extracts results from a paginated response', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [{ id: 's-1' }], count: 1 } })
    const out = await serviceAPI.list()
    expect(out).toEqual([{ id: 's-1' }])
  })

  it('returns [] when paginated response has no results key', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0 } as never })
    const out = await serviceAPI.list()
    expect(out).toEqual([])
  })
})

describe('serviceAPI.get / delete', () => {
  it('get GETs /services/:id/', async () => {
    apiMocks.get.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.get('s-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/services/s-1/', { signal: undefined })
  })

  it('delete DELETEs /services/:id/', async () => {
    apiMocks.delete.mockResolvedValue({})
    await serviceAPI.delete('s-1')
    expect(apiMocks.delete).toHaveBeenCalledWith('/services/s-1/')
  })
})

describe('serviceAPI.create', () => {
  it('POSTs FormData with multipart Content-Type when given FormData', async () => {
    const fd = new FormData()
    fd.append('title', 'svc')
    apiMocks.post.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.create(fd)
    expect(apiMocks.post).toHaveBeenCalledWith('/services/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('POSTs plain object with empty headers (no multipart)', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.create({ title: 'svc' })
    expect(apiMocks.post).toHaveBeenCalledWith('/services/', { title: 'svc' }, { headers: {} })
  })
})

describe('serviceAPI.update', () => {
  it('PATCHes FormData with multipart Content-Type when given FormData', async () => {
    const fd = new FormData()
    apiMocks.patch.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.update('s-1', fd)
    expect(apiMocks.patch).toHaveBeenCalledWith('/services/s-1/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('PATCHes plain object with empty headers', async () => {
    apiMocks.patch.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.update('s-1', { title: 'new' })
    expect(apiMocks.patch).toHaveBeenCalledWith('/services/s-1/', { title: 'new' }, { headers: {} })
  })
})

describe('serviceAPI events / interest / report', () => {
  it('expressInterest POSTs empty body', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'i-1', status: 'pending' } })
    await serviceAPI.expressInterest('s-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/services/s-1/interest/', {}, { signal: undefined })
  })

  it('report POSTs issue_type and description', async () => {
    apiMocks.post.mockResolvedValue({})
    await serviceAPI.report('s-1', 'spam', 'why')
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/services/s-1/report/',
      { issue_type: 'spam', description: 'why' },
      { signal: undefined },
    )
  })

  it('pinEvent POSTs to /pin-event/', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.pinEvent('s-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/services/s-1/pin-event/')
  })

  it('completeEvent POSTs empty body', async () => {
    apiMocks.post.mockResolvedValue({})
    await serviceAPI.completeEvent('s-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/services/s-1/complete-event/', {})
  })

  it('cancelEvent POSTs reason', async () => {
    apiMocks.post.mockResolvedValue({})
    await serviceAPI.cancelEvent('s-1', 'venue closed')
    expect(apiMocks.post).toHaveBeenCalledWith('/services/s-1/cancel-event/', { reason: 'venue closed' })
  })
})

describe('serviceAPI QR + media + ranking debug', () => {
  it('generateQRToken POSTs to /generate-qr-token/', async () => {
    apiMocks.post.mockResolvedValue({ data: { token: 't' } })
    await serviceAPI.generateQRToken('s-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/services/s-1/generate-qr-token/')
  })

  it('getQRToken GETs /qr-token/', async () => {
    apiMocks.get.mockResolvedValue({ data: { token: 't' } })
    await serviceAPI.getQRToken('s-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/services/s-1/qr-token/')
  })

  it('setPrimaryMedia PATCHes media_id', async () => {
    apiMocks.patch.mockResolvedValue({ data: { id: 's-1' } })
    await serviceAPI.setPrimaryMedia('s-1', 'm-9')
    expect(apiMocks.patch).toHaveBeenCalledWith('/services/s-1/set-primary-media/', { media_id: 'm-9' })
  })

  it('getRankingDebug POSTs payload to /debug-ranking/', async () => {
    apiMocks.post.mockResolvedValue({ data: {} })
    await serviceAPI.getRankingDebug({ service_ids: ['s-1', 's-2'] })
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/services/debug-ranking/',
      { service_ids: ['s-1', 's-2'] },
      { signal: undefined },
    )
  })

  it('getPublicFeatured GETs /featured/public/', async () => {
    apiMocks.get.mockResolvedValue({ data: { trending: [], top_providers: [] } })
    await serviceAPI.getPublicFeatured()
    expect(apiMocks.get).toHaveBeenCalledWith('/featured/public/', { signal: undefined })
  })
})
