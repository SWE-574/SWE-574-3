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

let userAPI: typeof import('@/services/userAPI').userAPI
let dataURLtoBlob: typeof import('@/services/userAPI').dataURLtoBlob

beforeEach(async () => {
  Object.values(apiMocks).forEach((fn) => fn.mockReset())
  vi.resetModules()
  const mod = await import('@/services/userAPI')
  userAPI = mod.userAPI
  dataURLtoBlob = mod.dataURLtoBlob
})

describe('userAPI.getMe / getUser', () => {
  it('getMe GETs /users/me/', async () => {
    apiMocks.get.mockResolvedValue({ data: { id: 'u-1' } })
    const out = await userAPI.getMe()
    expect(apiMocks.get).toHaveBeenCalledWith('/users/me/', { signal: undefined })
    expect(out).toEqual({ id: 'u-1' })
  })

  it('getUser GETs /users/:id/', async () => {
    apiMocks.get.mockResolvedValue({ data: { id: 'u-9' } })
    await userAPI.getUser('u-9')
    expect(apiMocks.get).toHaveBeenCalledWith('/users/u-9/', { signal: undefined })
  })
})

describe('userAPI.updateMe', () => {
  it('PATCHes FormData with multipart Content-Type', async () => {
    const fd = new FormData()
    fd.append('first_name', 'Yusuf')
    apiMocks.patch.mockResolvedValue({ data: { id: 'u-1' } })
    await userAPI.updateMe(fd)
    expect(apiMocks.patch).toHaveBeenCalledWith('/users/me/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('PATCHes plain object with empty headers', async () => {
    apiMocks.patch.mockResolvedValue({ data: { id: 'u-1' } })
    await userAPI.updateMe({ bio: 'hi' })
    expect(apiMocks.patch).toHaveBeenCalledWith('/users/me/', { bio: 'hi' }, { headers: {} })
  })
})

describe('userAPI.getMyReports', () => {
  it('returns array directly when response is an array', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ id: 'r-1' }] })
    const out = await userAPI.getMyReports()
    expect(out).toEqual([{ id: 'r-1' }])
  })

  it('extracts results from a paginated payload', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [{ id: 'r-1' }] } })
    const out = await userAPI.getMyReports()
    expect(out).toEqual([{ id: 'r-1' }])
  })
})

describe('userAPI.followUser / unfollowUser', () => {
  it('followUser POSTs to /users/:id/follow/', async () => {
    apiMocks.post.mockResolvedValue({})
    await userAPI.followUser('u-9')
    expect(apiMocks.post).toHaveBeenCalledWith('/users/u-9/follow/')
  })

  it('unfollowUser DELETEs /users/:id/follow/', async () => {
    apiMocks.delete.mockResolvedValue({})
    await userAPI.unfollowUser('u-9')
    expect(apiMocks.delete).toHaveBeenCalledWith('/users/u-9/follow/')
  })
})

describe('userAPI.getFollowers / getFollowing', () => {
  it('getFollowers GETs /users/:id/followers/ and returns results', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [{ id: 'a' }] } })
    const out = await userAPI.getFollowers('u-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/users/u-1/followers/', { signal: undefined })
    expect(out).toEqual([{ id: 'a' }])
  })

  it('getFollowing GETs /users/:id/following/', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [{ id: 'b' }] } })
    await userAPI.getFollowing('u-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/users/u-1/following/', { signal: undefined })
  })
})

describe('userAPI.getSuggested', () => {
  it('omits page param when absent', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [], next: null, count: 0 } })
    await userAPI.getSuggested()
    expect(apiMocks.get).toHaveBeenCalledWith('/users/suggested/', { params: undefined, signal: undefined })
  })

  it('passes page param when present', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [], next: null, count: 0 } })
    await userAPI.getSuggested({ page: 3 })
    expect(apiMocks.get).toHaveBeenCalledWith('/users/suggested/', { params: { page: 3 }, signal: undefined })
  })

  it('defaults missing fields to safe values', async () => {
    apiMocks.get.mockResolvedValue({ data: {} as never })
    const out = await userAPI.getSuggested()
    expect(out).toEqual({ results: [], next: null, count: 0 })
  })
})

describe('userAPI.getHistory', () => {
  it('returns array directly when response is array', async () => {
    apiMocks.get.mockResolvedValue({ data: [{ service_id: 's-1' }] })
    const out = await userAPI.getHistory('u-1')
    expect(out).toEqual([{ service_id: 's-1' }])
  })

  it('extracts results from paginated response', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [{ service_id: 's-1' }] } })
    const out = await userAPI.getHistory('u-1')
    expect(out).toEqual([{ service_id: 's-1' }])
  })

  it('returns [] when response has no results', async () => {
    apiMocks.get.mockResolvedValue({ data: {} as never })
    const out = await userAPI.getHistory('u-1')
    expect(out).toEqual([])
  })
})

describe('userAPI.getBadgeProgress (normalization)', () => {
  it('flattens an object-keyed map to flat shape using achievement nesting', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        first_friend: {
          achievement: { name: 'First Friend', description: 'd', icon_url: 'i', karma_points: 10, is_hidden: false },
          earned: true, current: 1, threshold: 1, progress_percent: 100, earned_at: '2026-01-01',
        },
      },
    })
    const out = await userAPI.getBadgeProgress('u-1')
    expect(out[0]).toMatchObject({
      badge_type: 'first_friend',
      name: 'First Friend',
      description: 'd',
      current_value: 1,
      threshold: 1,
      earned: true,
      earned_at: '2026-01-01',
      karma_points: 10,
      is_hidden: false,
    })
  })

  it('falls back to defaults when nested achievement missing', async () => {
    apiMocks.get.mockResolvedValue({ data: { x: { earned: false } } })
    const out = await userAPI.getBadgeProgress('u-1')
    expect(out[0]).toMatchObject({
      badge_type: 'x', name: 'x', current_value: 0, threshold: 0,
      earned: false, karma_points: 0,
    })
  })

  it('handles results-array shape from paginated endpoint', async () => {
    apiMocks.get.mockResolvedValue({
      data: { results: [{ badge_type: 'b1', earned: true, current: 5, threshold: 10 }] as never },
    })
    const out = await userAPI.getBadgeProgress('u-1')
    expect(out).toHaveLength(1)
    expect(out[0].badge_type).toBe('b1')
  })

  it('handles bare-array shape', async () => {
    apiMocks.get.mockResolvedValue({
      data: [{ badge_type: 'b1', earned: true }] as never,
    })
    const out = await userAPI.getBadgeProgress('u-1')
    expect(out).toHaveLength(1)
  })
})

describe('userAPI.getAchievementProgress', () => {
  it('returns the nested AchievementProgressItem shape', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        x: {
          achievement: { name: 'X', description: 'd', icon_url: null, karma_points: 5, is_hidden: false },
          earned: true, current: 1, threshold: 1, progress_percent: 100, earned_at: null,
        },
      },
    })
    const out = await userAPI.getAchievementProgress('u-1')
    expect(out[0].achievement.name).toBe('X')
    expect(out[0].badge_type).toBe('x')
  })
})

describe('userAPI.getVerifiedReviews', () => {
  it('GETs /users/:id/verified-reviews/ with empty params when no role', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [], next: null, previous: null } })
    await userAPI.getVerifiedReviews('u-1')
    expect(apiMocks.get).toHaveBeenCalledWith('/users/u-1/verified-reviews/', {
      params: {},
      signal: undefined,
    })
  })

  it('forwards role param', async () => {
    apiMocks.get.mockResolvedValue({ data: { count: 0, results: [], next: null, previous: null } })
    await userAPI.getVerifiedReviews('u-1', { role: 'provider' })
    expect(apiMocks.get).toHaveBeenCalledWith('/users/u-1/verified-reviews/', {
      params: { role: 'provider' },
      signal: undefined,
    })
  })

  it('defaults missing fields to safe values', async () => {
    apiMocks.get.mockResolvedValue({ data: {} as never })
    const out = await userAPI.getVerifiedReviews('u-1')
    expect(out).toEqual({ count: 0, results: [], next: null, previous: null })
  })

  it('falls back to results.length when count missing', async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [{ id: 'r-1' }] } as never })
    const out = await userAPI.getVerifiedReviews('u-1')
    expect(out.count).toBe(1)
  })
})

describe('dataURLtoBlob', () => {
  it('decodes a PNG data URL into a Blob with the parsed mime type', () => {
    const blob = dataURLtoBlob('data:image/png;base64,aGVsbG8=')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(5)
  })

  it('falls back to image/jpeg when the header has no mime type', () => {
    const blob = dataURLtoBlob('data:,aGVsbG8=')
    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBe(5)
  })
})
