import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn((_e: unknown, fallback?: string) => fallback ?? 'oops'),
}))

let useAuthStore: typeof import('@/store/useAuthStore').useAuthStore

beforeEach(async () => {
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  vi.resetModules()
  vi.useFakeTimers()
  useAuthStore = (await import('@/store/useAuthStore')).useAuthStore
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAuthStore.login', () => {
  it('sets user + isAuthenticated when payload includes user', async () => {
    apiMocks.post.mockResolvedValue({ data: { access: 'a', refresh: 'r', user: { id: 'u-1' } } })
    await useAuthStore.getState().login('a@b.co', 'pw')
    const s = useAuthStore.getState()
    expect(s.user).toEqual({ id: 'u-1' })
    expect(s.isAuthenticated).toBe(true)
    expect(s.isLoading).toBe(false)
  })

  it('falls back to /users/me/ when login payload omits user', async () => {
    apiMocks.post.mockResolvedValue({ data: { access: 'a', refresh: 'r' } })
    apiMocks.get.mockResolvedValue({ data: { id: 'u-2' } })
    await useAuthStore.getState().login('a@b.co', 'pw')
    expect(apiMocks.get).toHaveBeenCalledWith('/users/me/', expect.objectContaining({
      headers: { 'Cache-Control': 'no-cache' },
    }))
    expect(useAuthStore.getState().user).toEqual({ id: 'u-2' })
  })

  it('stores error and rethrows on 401', async () => {
    const err = Object.assign(new Error('bad'), { response: { status: 401 } })
    apiMocks.post.mockRejectedValue(err)
    await expect(useAuthStore.getState().login('a@b.co', 'pw')).rejects.toBe(err)
    expect(useAuthStore.getState().error).toBe('Login failed')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})

describe('useAuthStore.register', () => {
  it('sets user when register response includes user', async () => {
    apiMocks.post.mockResolvedValue({ data: { access: 'a', refresh: 'r', user: { id: 'u-1' } } })
    await useAuthStore.getState().register({
      email: 'a@b.co', password: 'pw', first_name: 'A', last_name: 'B',
    })
    expect(useAuthStore.getState().user).toEqual({ id: 'u-1' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('rethrows on registration failure', async () => {
    const err = Object.assign(new Error('bad'), { response: { status: 400 } })
    apiMocks.post.mockRejectedValue(err)
    await expect(useAuthStore.getState().register({
      email: 'a@b.co', password: 'pw', first_name: 'A', last_name: 'B',
    })).rejects.toBe(err)
    expect(useAuthStore.getState().error).toBe('Registration failed')
  })
})

describe('useAuthStore.checkAuth retry on 429', () => {
  it('retries up to MAX_ME_RETRIES then succeeds', async () => {
    const rl = Object.assign(new Error('429'), { response: { status: 429 } })
    apiMocks.get
      .mockRejectedValueOnce(rl)
      .mockRejectedValueOnce(rl)
      .mockResolvedValueOnce({ data: { id: 'u-3' } })
    const p = useAuthStore.getState().checkAuth(true)
    await vi.runAllTimersAsync()
    await p
    expect(apiMocks.get).toHaveBeenCalledTimes(3)
    expect(useAuthStore.getState().user).toEqual({ id: 'u-3' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps existing auth when retries exhaust on 429', async () => {
    useAuthStore.setState({ user: { id: 'cached' } as never, isAuthenticated: true })
    const rl = Object.assign(new Error('429'), { response: { status: 429 } })
    apiMocks.get.mockRejectedValue(rl)
    const p = useAuthStore.getState().checkAuth(true)
    await vi.runAllTimersAsync()
    await p
    expect(useAuthStore.getState().error).toMatch(/Too many auth checks/)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('clears auth on non-429 errors', async () => {
    useAuthStore.setState({ user: { id: 'cached' } as never, isAuthenticated: true })
    apiMocks.get.mockRejectedValue(Object.assign(new Error('500'), { response: { status: 500 } }))
    await useAuthStore.getState().checkAuth(true)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('skips network when already authenticated and not forced', async () => {
    useAuthStore.setState({ user: { id: 'u' } as never, isAuthenticated: true })
    await useAuthStore.getState().checkAuth(false)
    expect(apiMocks.get).not.toHaveBeenCalled()
  })

  it('hits network when forced even if already authenticated', async () => {
    useAuthStore.setState({ user: { id: 'u' } as never, isAuthenticated: true })
    apiMocks.get.mockResolvedValue({ data: { id: 'u-fresh' } })
    await useAuthStore.getState().checkAuth(true)
    expect(apiMocks.get).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toEqual({ id: 'u-fresh' })
  })
})

describe('useAuthStore.refreshUser', () => {
  it('updates user on success', async () => {
    apiMocks.get.mockResolvedValue({ data: { id: 'u-fresh' } })
    await useAuthStore.getState().refreshUser()
    expect(useAuthStore.getState().user).toEqual({ id: 'u-fresh' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('skips soft refreshes while the current profile snapshot is fresh', async () => {
    vi.setSystemTime(1_000)
    apiMocks.get.mockResolvedValueOnce({ data: { id: 'u-fresh' } })
    await useAuthStore.getState().refreshUser()

    apiMocks.get.mockClear()
    vi.setSystemTime(5_000)
    await useAuthStore.getState().refreshUser({ force: false })

    expect(apiMocks.get).not.toHaveBeenCalled()
  })

  it('skips soft refresh after checkAuth already confirmed the user', async () => {
    vi.setSystemTime(1_000)
    apiMocks.get.mockResolvedValueOnce({ data: { id: 'u-fresh' } })
    await useAuthStore.getState().checkAuth(true)

    apiMocks.get.mockClear()
    vi.setSystemTime(5_000)
    await useAuthStore.getState().refreshUser({ force: false })

    expect(apiMocks.get).not.toHaveBeenCalled()
  })

  it('sets error on 429 but keeps existing state', async () => {
    useAuthStore.setState({ user: { id: 'cached' } as never, isAuthenticated: true })
    apiMocks.get.mockRejectedValue(Object.assign(new Error('429'), { response: { status: 429 } }))
    await useAuthStore.getState().refreshUser()
    expect(useAuthStore.getState().error).toMatch(/Too many auth checks/)
  })

  it('silently swallows non-429 errors', async () => {
    apiMocks.get.mockRejectedValue(Object.assign(new Error('500'), { response: { status: 500 } }))
    await expect(useAuthStore.getState().refreshUser()).resolves.toBeUndefined()
  })
})

describe('useAuthStore.logout', () => {
  it('clears state even when network logout fails', async () => {
    useAuthStore.setState({ user: { id: 'u' } as never, isAuthenticated: true, error: 'old' })
    apiMocks.post.mockRejectedValue(new Error('boom'))
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('clears state on success', async () => {
    useAuthStore.setState({ user: { id: 'u' } as never, isAuthenticated: true })
    apiMocks.post.mockResolvedValue({ data: { detail: 'bye' } })
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('useAuthStore.updateUserOptimistically / setUser / setError', () => {
  it('merges updates onto existing user', () => {
    useAuthStore.setState({ user: { id: 'u', bio: 'old' } as never })
    useAuthStore.getState().updateUserOptimistically({ bio: 'new' } as never)
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u', bio: 'new' })
  })

  it('is a no-op when no user is set', () => {
    useAuthStore.getState().updateUserOptimistically({ bio: 'x' } as never)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('setUser flips isAuthenticated', () => {
    useAuthStore.getState().setUser({ id: 'u' } as never)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('setError stores the message', () => {
    useAuthStore.getState().setError('boom')
    expect(useAuthStore.getState().error).toBe('boom')
  })
})
