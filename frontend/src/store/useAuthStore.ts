import { create } from 'zustand'
import type { User } from '@/types'
import apiClient, { getErrorMessage } from '@/services/api'

let inFlightUserRequest: Promise<User> | null = null

const RATE_LIMIT_STATUS = 429
const MAX_ME_RETRIES = 2
const BACKOFF_BASE_MS = 300

const sleep = (ms: number) => new Promise((resolve) => {
  window.setTimeout(resolve, ms)
})

const getStatusCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined
  const maybeResponse = (error as { response?: { status?: number } }).response
  return maybeResponse?.status
}

const isRateLimitError = (error: unknown): boolean => getStatusCode(error) === RATE_LIMIT_STATUS

const fetchCurrentUserWithRetry = async (): Promise<User> => {
  let attempt = 0
  while (true) {
    try {
      const res = await apiClient.get<User>('/users/me/', {
        params: { _: Date.now() },
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      return res.data
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= MAX_ME_RETRIES) {
        throw error
      }

      const jitter = Math.floor(Math.random() * 200)
      const backoffMs = BACKOFF_BASE_MS * (2 ** attempt) + jitter
      attempt += 1
      await sleep(backoffMs)
    }
  }
}

const fetchCurrentUserSingleFlight = async (): Promise<User> => {
  if (inFlightUserRequest) return inFlightUserRequest

  inFlightUserRequest = fetchCurrentUserWithRetry()
    .finally(() => {
      inFlightUserRequest = null
    })

  return inFlightUserRequest
}

const fetchCurrentUserFresh = async (): Promise<User> => {
  const res = await apiClient.get<User>('/users/me/', {
    params: { _: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
    },
  })
  return res.data
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  setUser: (user: User | null) => void
  setError: (error: string | null) => void

  login: (email: string, password: string) => Promise<void>
  register: (data: {
    email: string
    password: string
    first_name: string
    last_name: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  checkAuth: (force?: boolean) => Promise<void>
  updateUserOptimistically: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  // Start with no user — always verify via cookie on mount
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setError: (error) => set({ error }),

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      // Backend sets access_token + refresh_token cookies in the response
      const res = await apiClient.post<{
        access: string
        refresh: string
        user?: User
      }>('/auth/login/', { email, password })

      let user = res.data.user ?? null
      if (!user) {
        user = await fetchCurrentUserSingleFlight()
      }

      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({ isLoading: false, error: getErrorMessage(error, 'Login failed') })
      throw error
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      // Backend sets cookies and returns user
      const res = await apiClient.post<{
        access: string
        refresh: string
        user?: User
      }>('/auth/register/', data)

      let user = res.data.user ?? null
      if (!user) {
        user = await fetchCurrentUserSingleFlight()
      }

      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: getErrorMessage(error, 'Registration failed'),
      })
      throw error
    }
  },

  logout: async () => {
    try {
      // Ask backend to clear httponly refresh_token cookie
      await apiClient.post('/auth/logout/')
    } catch {
      // Ignore errors — clear state regardless
    }
    inFlightUserRequest = null
    set({ user: null, isAuthenticated: false, error: null })
  },

  refreshUser: async () => {
    try {
      inFlightUserRequest = null
      const user = await fetchCurrentUserFresh()
      set({ user, isAuthenticated: true })
    } catch (error) {
      if (isRateLimitError(error)) {
        set({ error: 'Too many auth checks. Retrying shortly.' })
      }
      // Silently fail for non-429 errors — if cookie is gone the 401 handler will redirect
    }
  },

  checkAuth: async (force = false) => {
    const state = get()
    // Skip if already verified and not forced
    if (!force && state.isAuthenticated && state.user) return

    set({ isLoading: true })
    try {
      const user = await fetchCurrentUserSingleFlight()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (error) {
      if (isRateLimitError(error)) {
        // Keep current auth state on transient throttling.
        set({ isLoading: false, error: 'Too many auth checks. Please wait a moment.' })
        return
      }

      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  updateUserOptimistically: (updates) => {
    const { user } = get()
    if (!user) return
    set({ user: { ...user, ...updates } })
  },
}))
