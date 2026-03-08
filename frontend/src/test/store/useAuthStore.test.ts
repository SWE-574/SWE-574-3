import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '@/store/useAuthStore'

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  getErrorMessage: (_: unknown, fallback: string) => fallback,
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, error: null })
  })

  it('setUser updates user and isAuthenticated', () => {
    const user = {
      id: '1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      is_onboarded: true,
      is_verified: true,
      role: 'registered',
      is_admin: false,
    }
    useAuthStore.getState().setUser(user as never)
    expect(useAuthStore.getState().user).toEqual(user)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('setUser(null) clears auth state', () => {
    useAuthStore.getState().setUser({ id: '1', email: 'a@b.com' } as never)
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('setError updates error message', () => {
    useAuthStore.getState().setError('Invalid credentials')
    expect(useAuthStore.getState().error).toBe('Invalid credentials')
    useAuthStore.getState().setError(null)
    expect(useAuthStore.getState().error).toBeNull()
  })
})
