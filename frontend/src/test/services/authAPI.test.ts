import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  default: apiMocks,
  apiClient: apiMocks,
  getErrorMessage: vi.fn((_e: unknown, fallback?: string) => fallback ?? 'err'),
}))

let authAPI: typeof import('@/services/authAPI').authAPI

beforeEach(async () => {
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  vi.resetModules()
  authAPI = (await import('@/services/authAPI')).authAPI
})

describe('authAPI.forgotPassword', () => {
  it('posts the email payload to /auth/forgot-password/', async () => {
    apiMocks.post.mockResolvedValue({ data: { detail: 'sent' } })
    const res = await authAPI.forgotPassword('a@b.co')
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/forgot-password/', { email: 'a@b.co' })
    expect(res.data.detail).toBe('sent')
  })

  it('propagates rejection unchanged', async () => {
    const err = Object.assign(new Error('429'), { response: { status: 429 } })
    apiMocks.post.mockRejectedValue(err)
    await expect(authAPI.forgotPassword('a@b.co')).rejects.toBe(err)
  })
})

describe('authAPI.resetPassword', () => {
  it('sends token + password to /auth/reset-password/', async () => {
    apiMocks.post.mockResolvedValue({ data: { detail: 'ok' } })
    await authAPI.resetPassword('tok-1', 'newPwd')
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/reset-password/', {
      token: 'tok-1',
      password: 'newPwd',
    })
  })
})

describe('authAPI.verifyEmail', () => {
  it('returns the access token + user payload from the body', async () => {
    apiMocks.post.mockResolvedValue({
      data: { detail: 'ok', access: 'jwt', user: { id: '1' } },
    })
    const res = await authAPI.verifyEmail('tok-1')
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/verify-email/', { token: 'tok-1' })
    expect(res.data.access).toBe('jwt')
    expect(res.data.user).toEqual({ id: '1' })
  })

  it('rejects on invalid token', async () => {
    const err = Object.assign(new Error('400'), { response: { status: 400 } })
    apiMocks.post.mockRejectedValue(err)
    await expect(authAPI.verifyEmail('bad')).rejects.toBe(err)
  })
})

describe('authAPI.resendVerification', () => {
  it('posts the email to /auth/resend-verification/', async () => {
    apiMocks.post.mockResolvedValue({ data: { detail: 'sent' } })
    await authAPI.resendVerification('a@b.co')
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/resend-verification/', { email: 'a@b.co' })
  })
})

describe('authAPI.sendVerification', () => {
  it('posts to /auth/send-verification/ with no payload', async () => {
    apiMocks.post.mockResolvedValue({ data: { detail: 'ok' } })
    await authAPI.sendVerification()
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/send-verification/')
  })
})

describe('authAPI.changePassword', () => {
  it('renames camelCase args to snake_case body fields', async () => {
    apiMocks.post.mockResolvedValue({ data: { detail: 'ok' } })
    await authAPI.changePassword('old123', 'new456')
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/change-password/', {
      current_password: 'old123',
      new_password: 'new456',
    })
  })
})

describe('authAPI.logout', () => {
  it('posts to /auth/logout/ with no body', async () => {
    apiMocks.post.mockResolvedValue({ data: { detail: 'bye' } })
    await authAPI.logout()
    expect(apiMocks.post).toHaveBeenCalledWith('/auth/logout/')
  })

  it('rejects when the server errors', async () => {
    apiMocks.post.mockRejectedValue(new Error('boom'))
    await expect(authAPI.logout()).rejects.toThrow('boom')
  })
})

describe('authAPI.getWsToken', () => {
  it('GETs /auth/ws-token/ and returns the token', async () => {
    apiMocks.get.mockResolvedValue({ data: { token: 'wsjwt' } })
    const res = await authAPI.getWsToken()
    expect(apiMocks.get).toHaveBeenCalledWith('/auth/ws-token/')
    expect(res.data.token).toBe('wsjwt')
  })
})
