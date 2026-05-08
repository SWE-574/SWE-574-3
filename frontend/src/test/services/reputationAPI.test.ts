import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
}))
vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn((_e: unknown, fallback?: string) => fallback ?? 'err'),
}))

let reputationAPI: typeof import('@/services/reputationAPI').reputationAPI

beforeEach(async () => {
  apiMocks.post.mockReset()
  vi.resetModules()
  reputationAPI = (await import('@/services/reputationAPI')).reputationAPI
})

describe('reputationAPI.submitPositive / submitNegative', () => {
  it('POSTs positive payload to /reputation/', async () => {
    apiMocks.post.mockResolvedValue({ data: { ok: true } })
    const out = await reputationAPI.submitPositive({
      handshake_id: 'h-1', punctual: true, helpful: false, kindness: true,
    } as never)
    expect(apiMocks.post).toHaveBeenCalledWith('/reputation/', {
      handshake_id: 'h-1', punctual: true, helpful: false, kindness: true,
    })
    expect(out).toEqual({ ok: true })
  })

  it('POSTs negative payload to /reputation/negative/', async () => {
    apiMocks.post.mockResolvedValue({ data: { ok: true } })
    await reputationAPI.submitNegative({
      handshake_id: 'h-1', is_late: true, is_unhelpful: false, is_rude: false,
    } as never)
    expect(apiMocks.post).toHaveBeenCalledWith('/reputation/negative/', {
      handshake_id: 'h-1', is_late: true, is_unhelpful: false, is_rude: false,
    })
  })
})

describe('reputationAPI.attachReviewImages', () => {
  it('POSTs multipart payload with handshake_id and one entry per image', async () => {
    apiMocks.post.mockResolvedValue({})
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    await reputationAPI.attachReviewImages('h-1', [f1, f2])
    const [path, fd, opts] = apiMocks.post.mock.calls[0]
    expect(path).toBe('/reputation/add-review/')
    expect(opts.headers['Content-Type']).toBe('multipart/form-data')
    const formData = fd as FormData
    expect(formData.get('handshake_id')).toBe('h-1')
    expect(formData.getAll('images')).toHaveLength(2)
  })

  it('POSTs even when images array is empty', async () => {
    apiMocks.post.mockResolvedValue({})
    await reputationAPI.attachReviewImages('h-1', [])
    const fd = apiMocks.post.mock.calls[0][1] as FormData
    expect(fd.getAll('images')).toHaveLength(0)
  })
})

describe('reputationAPI.submitCombined', () => {
  const base = {
    handshake_id: 'h-1',
    positive: { punctual: false, helpful: false, kindness: false },
    negative: { is_late: false, is_unhelpful: false, is_rude: false },
  }

  it('throws when no traits selected', async () => {
    await expect(reputationAPI.submitCombined(base)).rejects.toThrow(/at least one trait/i)
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('submits only positive when only positive traits selected', async () => {
    apiMocks.post.mockResolvedValue({ data: { ok: 'pos' } })
    const out = await reputationAPI.submitCombined({
      ...base,
      positive: { punctual: true, helpful: false, kindness: false },
    })
    expect(apiMocks.post).toHaveBeenCalledTimes(1)
    expect(apiMocks.post).toHaveBeenCalledWith('/reputation/', expect.objectContaining({
      handshake_id: 'h-1', punctual: true, helpful: false, kindness: false,
    }))
    expect(out.positive).toEqual({ ok: 'pos' })
    expect(out.negative).toBeUndefined()
  })

  it('submits both when both selected and trims comment', async () => {
    apiMocks.post
      .mockResolvedValueOnce({ data: { ok: 'pos' } })
      .mockResolvedValueOnce({ data: { ok: 'neg' } })
    const out = await reputationAPI.submitCombined({
      ...base,
      positive: { punctual: true, helpful: false, kindness: false },
      negative: { is_late: false, is_unhelpful: true, is_rude: false },
      comment: '   trim me   ',
    })
    expect(apiMocks.post).toHaveBeenCalledTimes(2)
    expect(apiMocks.post.mock.calls[0][1].comment).toBe('trim me')
    expect(apiMocks.post.mock.calls[1][1].comment).toBe('trim me')
    expect(out.positive).toEqual({ ok: 'pos' })
    expect(out.negative).toEqual({ ok: 'neg' })
  })

  it('drops empty comment after trim', async () => {
    apiMocks.post.mockResolvedValue({ data: { ok: true } })
    await reputationAPI.submitCombined({
      ...base,
      positive: { punctual: true, helpful: false, kindness: false },
      comment: '   ',
    })
    expect(apiMocks.post.mock.calls[0][1].comment).toBeUndefined()
  })

  it('wraps downstream errors in a generic message', async () => {
    apiMocks.post.mockRejectedValue(new Error('network'))
    await expect(reputationAPI.submitCombined({
      ...base,
      positive: { punctual: true, helpful: false, kindness: false },
    })).rejects.toThrow(/Failed to submit evaluation/)
  })
})

describe('reputationAPI.submitCombinedEvent', () => {
  const baseEvent = {
    handshake_id: 'h-1',
    positive: { well_organized: false, engaging: false, welcoming: false },
    negative: { disorganized: false, boring: false, unwelcoming: false },
  }

  it('throws when no event traits selected', async () => {
    await expect(reputationAPI.submitCombinedEvent(baseEvent)).rejects.toThrow(/at least one trait/i)
  })

  it('submits positive event traits to /reputation/', async () => {
    apiMocks.post.mockResolvedValue({ data: { ok: true } })
    await reputationAPI.submitCombinedEvent({
      ...baseEvent,
      positive: { well_organized: true, engaging: false, welcoming: false },
    })
    expect(apiMocks.post).toHaveBeenCalledWith('/reputation/', expect.objectContaining({
      well_organized: true, engaging: false, welcoming: false,
    }))
  })
})
