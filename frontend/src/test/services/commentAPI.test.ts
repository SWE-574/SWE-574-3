import { beforeEach, describe, expect, it, vi } from 'vitest'

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

let commentAPI: typeof import('@/services/commentAPI').commentAPI

beforeEach(async () => {
  Object.values(apiMocks).forEach((fn) => fn.mockReset())
  vi.resetModules()
  commentAPI = (await import('@/services/commentAPI')).commentAPI
})

describe('commentAPI.list', () => {
  it('GETs /services/:id/comments/ with empty params when no page', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await commentAPI.list('s-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/services/s-1/comments/', { params: {}, signal: undefined })
  })

  it('forwards page param when provided', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await commentAPI.list('s-1', 3)
    expect(apiMocks.get).toHaveBeenCalledWith('/services/s-1/comments/', {
      params: { page: 3 },
      signal: undefined,
    })
  })

  it('returns the response data unchanged', async () => {
    const payload = { count: 1, next: null, previous: null, results: [{ id: 'c-1' }] } as never
    apiMocks.get.mockResolvedValue({ data: payload })
    const out = await commentAPI.list('s-1')
    expect(out).toBe(payload)
  })

  it('forwards abort signal', async () => {
    const ac = new AbortController()
    apiMocks.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await commentAPI.list('s-1', undefined, ac.signal)
    expect(apiMocks.get.mock.calls[0][1].signal).toBe(ac.signal)
  })
})

describe('commentAPI.create', () => {
  it('POSTs body without parent_id when none provided', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'c-1' } })
    await commentAPI.create('s-1', 'hello')
    expect(apiMocks.post).toHaveBeenCalledWith('/services/s-1/comments/', { body: 'hello' }, { signal: undefined })
  })

  it('includes parent_id when provided', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'c-2' } })
    await commentAPI.create('s-1', 'reply', 'c-parent')
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/services/s-1/comments/',
      { body: 'reply', parent_id: 'c-parent' },
      { signal: undefined },
    )
  })

  it('forwards abort signal', async () => {
    const ac = new AbortController()
    apiMocks.post.mockResolvedValue({ data: { id: 'c-1' } })
    await commentAPI.create('s-1', 'hi', undefined, ac.signal)
    expect(apiMocks.post.mock.calls[0][2].signal).toBe(ac.signal)
  })
})

describe('commentAPI.delete', () => {
  it('DELETEs /services/:sid/comments/:cid/', async () => {
    apiMocks.delete.mockResolvedValue({})
    await commentAPI.delete('s-1', 'c-1')
    expect(apiMocks.delete).toHaveBeenCalledWith('/services/s-1/comments/c-1/', { signal: undefined })
  })
})
