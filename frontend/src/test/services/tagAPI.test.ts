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

let tagAPI: typeof import('@/services/tagAPI').tagAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  vi.resetModules()
  tagAPI = (await import('@/services/tagAPI')).tagAPI
})

describe('tagAPI.search', () => {
  it('returns [] for empty queries without hitting the API', async () => {
    const out = await tagAPI.search('')
    expect(apiMocks.get).not.toHaveBeenCalled()
    expect(out).toEqual([])
  })

  it('returns [] for whitespace-only queries', async () => {
    const out = await tagAPI.search('   ')
    expect(apiMocks.get).not.toHaveBeenCalled()
    expect(out).toEqual([])
  })

  it('GETs /wikidata/search/ with q and limit, mapping label -> name', async () => {
    apiMocks.get.mockResolvedValue({
      data: [
        { id: 'Q1', label: 'Python', description: 'language', entity_type: 'tech' },
        { id: 'Q2', label: 'Django', description: 'framework', entity_type: 'tech' },
      ],
    })
    const out = await tagAPI.search('py')
    expect(apiMocks.get).toHaveBeenCalledWith(
      '/wikidata/search/',
      { params: { q: 'py', limit: 10 }, signal: undefined },
    )
    expect(out).toEqual([
      { id: 'Q1', name: 'Python', description: 'language', entity_type: 'tech' },
      { id: 'Q2', name: 'Django', description: 'framework', entity_type: 'tech' },
    ])
  })

  it('drops items missing id or label', async () => {
    apiMocks.get.mockResolvedValue({
      data: [
        { id: '', label: 'no id' },
        { id: 'Q1', label: '' },
        { id: 'Q2', label: 'kept' },
      ],
    })
    const out = await tagAPI.search('q')
    expect(out).toEqual([{ id: 'Q2', name: 'kept', description: undefined, entity_type: undefined }])
  })

  it('passes the abort signal through', async () => {
    const ac = new AbortController()
    apiMocks.get.mockResolvedValue({ data: [] })
    await tagAPI.search('x', ac.signal)
    expect(apiMocks.get).toHaveBeenCalledWith(
      '/wikidata/search/',
      { params: { q: 'x', limit: 10 }, signal: ac.signal },
    )
  })

  it('returns [] when the response data is null', async () => {
    apiMocks.get.mockResolvedValue({ data: null })
    const out = await tagAPI.search('x')
    expect(out).toEqual([])
  })
})

describe('tagAPI.searchLocal', () => {
  it('returns [] for empty queries', async () => {
    const out = await tagAPI.searchLocal('')
    expect(apiMocks.get).not.toHaveBeenCalled()
    expect(out).toEqual([])
  })

  it('GETs /tags/ with search param and returns the data', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ id: 'Q1', name: 'Python' }] })
    const out = await tagAPI.searchLocal('py')
    expect(apiMocks.get).toHaveBeenCalledWith(
      '/tags/',
      { params: { search: 'py' }, signal: undefined },
    )
    expect(out).toEqual([{ id: 'Q1', name: 'Python' }])
  })
})

describe('tagAPI.ensureInDb', () => {
  it('POSTs and returns the created tag on success', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'Q1', name: 'Python' } })
    const out = await tagAPI.ensureInDb({ id: 'Q1', name: 'Python' })
    expect(apiMocks.post).toHaveBeenCalledWith('/tags/', { id: 'Q1', name: 'Python' })
    expect(out).toEqual({ id: 'Q1', name: 'Python' })
  })

  it('trims whitespace from the name field on POST', async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 'Q1', name: 'Python' } })
    await tagAPI.ensureInDb({ id: 'Q1', name: '  Python  ' })
    expect(apiMocks.post).toHaveBeenCalledWith('/tags/', { id: 'Q1', name: 'Python' })
  })

  it('falls back to GET on 400 (tag already exists), matching by id', async () => {
    const conflict = Object.assign(new Error('exists'), { response: { status: 400 } })
    apiMocks.post.mockRejectedValue(conflict)
    apiMocks.get.mockResolvedValue({
      data: [{ id: 'Q1', name: 'Python' }, { id: 'Q9', name: 'Snake' }],
    })
    const out = await tagAPI.ensureInDb({ id: 'Q1', name: 'Python' })
    expect(apiMocks.get).toHaveBeenCalledWith('/tags/', { params: { search: 'Python' } })
    expect(out).toEqual({ id: 'Q1', name: 'Python' })
  })

  it('falls back to GET on 400 and matches case-insensitively by name', async () => {
    const conflict = Object.assign(new Error('exists'), { response: { status: 400 } })
    apiMocks.post.mockRejectedValue(conflict)
    apiMocks.get.mockResolvedValue({
      data: [{ id: 'Q9', name: 'PYTHON' }],
    })
    const out = await tagAPI.ensureInDb({ id: 'Q1', name: 'python' })
    expect(out).toEqual({ id: 'Q9', name: 'PYTHON' })
  })

  it('rethrows the original error when no matching tag is found', async () => {
    const conflict = Object.assign(new Error('exists'), { response: { status: 400 } })
    apiMocks.post.mockRejectedValue(conflict)
    apiMocks.get.mockResolvedValue({ data: [] })
    await expect(tagAPI.ensureInDb({ id: 'Q1', name: 'Python' })).rejects.toBe(conflict)
  })

  it('rethrows non-400 errors immediately without GET fallback', async () => {
    const err = Object.assign(new Error('500'), { response: { status: 500 } })
    apiMocks.post.mockRejectedValue(err)
    await expect(tagAPI.ensureInDb({ id: 'Q1', name: 'Python' })).rejects.toBe(err)
    expect(apiMocks.get).not.toHaveBeenCalled()
  })
})
